/**
 * Finance forward auto-snapshot — when trip is completed + financially final,
 * materialize certified FR1 snapshot via existing materializer.
 *
 * Fail-closed on major inconsistency → DQ audit only, no snapshot.
 * Never mutates order/. Never settlements. Idempotent + retry-safe.
 */

import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import {
  AccountingSnapshotMaterializeService,
  detectMajorInconsistency,
  type MaterializeActor,
  type MaterializeBatchResult,
} from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import type { AccountingSnapshotMaterializePorts } from "@/application/finance/materialize/AccountingSnapshotMaterializePorts";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { ACCOUNTING_SNAPSHOT_CLIENT_KEY_PREFIX } from "@/application/finance/materialize/AccountingSnapshotMaterializeDocuments";
import { classifyTripFinanceDisplayState } from "@/domain/finance/TripFinanceDisplayState";

export const FINANCE_DQ_MAJORS_INCONSISTENT_ACTION =
  "finance_dq.majors_inconsistent" as const;
export const FINANCE_FORWARD_AUTO_SNAPSHOT_CLIENT_KEY_PREFIX =
  "finance_forward_auto_snapshot_v1" as const;

export type FinanceForwardAutoSnapshotResult = {
  dryRun: boolean;
  orderId: string;
  outcome:
    | "created"
    | "already_materialized"
    | "eligible_dry_run"
    | "skipped_not_final"
    | "missing_financial_facts"
    | "inconsistent_dq_alerted"
    | "inconsistent_dq_dry_run"
    | "error";
  reasons: string[];
  displayState: ReturnType<typeof classifyTripFinanceDisplayState>["state"];
  snapshotId: string | null;
  productionWrites: number;
  orderMutations: 0;
  settlementWrites: 0;
  dqAlertCreated: boolean;
  materialize?: MaterializeBatchResult;
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class FinanceForwardAutoSnapshotService {
  private readonly materialize: AccountingSnapshotMaterializeService;

  constructor(
    private readonly ports: AccountingSnapshotMaterializePorts,
    private readonly gate: FinanceWriteGate,
  ) {
    this.materialize = new AccountingSnapshotMaterializeService(ports, gate);
  }

  /**
   * Automatic path for a single order that just became financially final.
   * Admin materialize API remains the controlled recovery / batch tool.
   */
  async finalizeOrder(input: {
    actor: MaterializeActor;
    orderId: string;
    dryRun: boolean;
    correlationId: string;
    clientKey?: string;
    /** QA fixtures only — never for commercial Production apply. */
    includeQaFixtures?: boolean;
  }): Promise<FinanceForwardAutoSnapshotResult> {
    const orderId = input.orderId.trim();
    const order = await this.ports.read.getOrder(orderId);
    if (!order.exists || !order.data) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "error",
        reasons: ["order_not_found"],
        displayState: "not_applicable",
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
      };
    }

    const snap = await this.ports.read.getSnapshot(orderId);
    const display = classifyTripFinanceDisplayState({
      orderId,
      data: order.data,
      snapshotExists: snap.exists,
    });

    if (snap.exists) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "already_materialized",
        reasons: ["snapshot_already_exists"],
        displayState: display.state,
        snapshotId: orderId,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
      };
    }

    const calculated = calculateFinanceFr1PilotSnapshot({
      order: { documentId: orderId, data: order.data },
      actorUserId: input.actor.userId,
    });
    const inconsistent = detectMajorInconsistency(calculated);
    if (inconsistent.length > 0) {
      let dqAlertCreated = false;
      if (!input.dryRun) {
        this.gate.requireWritable("snapshot.materialize");
        const auditId = generateId("dq");
        const created = await this.ports.write.createAudit(auditId, {
          action: FINANCE_DQ_MAJORS_INCONSISTENT_ACTION,
          resourceType: "order",
          resourceId: orderId,
          correlationId: input.correlationId,
          actorUserId: input.actor.userId,
          reasons: inconsistent,
          grossFareMinor: calculated.grossFareMinor,
          platformCommissionMinor: calculated.commissionAmountPersistedMinor,
          vatAmountMinor: calculated.vatAmountMinor,
          driverNetMinor: calculated.driverNetMinor,
          expectedDriverNetMinor: (() => {
            try {
              const g = calculated.grossFareMinor
                ? BigInt(calculated.grossFareMinor)
                : null;
              const c = calculated.commissionAmountPersistedMinor
                ? BigInt(calculated.commissionAmountPersistedMinor)
                : null;
              const v = calculated.vatAmountMinor
                ? BigInt(calculated.vatAmountMinor)
                : null;
              if (g == null || c == null || v == null) return null;
              return (g - c - v).toString();
            } catch {
              return null;
            }
          })(),
          mutatesOrderMajors: false,
          snapshotCreated: false,
          atUtc: new Date().toISOString(),
        });
        dqAlertCreated = created.ok;
      }
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: input.dryRun
          ? "inconsistent_dq_dry_run"
          : "inconsistent_dq_alerted",
        reasons: inconsistent,
        displayState: "historical_conflict",
        snapshotId: null,
        productionWrites: dqAlertCreated ? 1 : 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated,
      };
    }

    if (display.state === "historical_incomplete") {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "missing_financial_facts",
        reasons: display.reasons,
        displayState: display.state,
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
      };
    }

    if (display.state === "pending_uncollected") {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "skipped_not_final",
        reasons: display.reasons,
        displayState: display.state,
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
      };
    }

    const clientKey =
      (input.clientKey && input.clientKey.trim()) ||
      `${FINANCE_FORWARD_AUTO_SNAPSHOT_CLIENT_KEY_PREFIX}:${orderId}`;

    const batch = await this.materialize.run({
      actor: input.actor,
      dryRun: input.dryRun,
      orderIds: [orderId],
      scanLimit: 1,
      applyLimit: 1,
      clientKey,
      correlationId: input.correlationId,
      includeQaFixtures: input.includeQaFixtures === true,
    });

    if (batch.created.length > 0) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "created",
        reasons: batch.created[0]!.reasons,
        displayState: "certified_snapshotted",
        snapshotId: batch.created[0]!.snapshotId ?? orderId,
        productionWrites: batch.productionWrites,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
        materialize: batch,
      };
    }
    if (batch.alreadyMaterialized.length > 0) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "already_materialized",
        reasons: batch.alreadyMaterialized[0]!.reasons,
        displayState: "certified_snapshotted",
        snapshotId: orderId,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
        materialize: batch,
      };
    }
    if (batch.eligible.length > 0 && input.dryRun) {
      return {
        dryRun: true,
        orderId,
        outcome: "eligible_dry_run",
        reasons: batch.eligible[0]!.reasons,
        displayState: "certified_ready",
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
        materialize: batch,
      };
    }
    if (batch.missingFinancialFacts.length > 0) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: "missing_financial_facts",
        reasons: batch.missingFinancialFacts[0]!.reasons,
        displayState: "historical_incomplete",
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
        materialize: batch,
      };
    }
    if (batch.inconsistent.length > 0) {
      return {
        dryRun: input.dryRun,
        orderId,
        outcome: input.dryRun
          ? "inconsistent_dq_dry_run"
          : "inconsistent_dq_alerted",
        reasons: batch.inconsistent[0]!.reasons,
        displayState: "historical_conflict",
        snapshotId: null,
        productionWrites: 0,
        orderMutations: 0,
        settlementWrites: 0,
        dqAlertCreated: false,
        materialize: batch,
      };
    }

    const skip = batch.skipped[0] ?? batch.errors[0];
    return {
      dryRun: input.dryRun,
      orderId,
      outcome: skip?.status === "error" ? "error" : "skipped_not_final",
      reasons: skip?.reasons ?? ["not_eligible"],
      displayState: display.state,
      snapshotId: null,
      productionWrites: batch.productionWrites,
      orderMutations: 0,
      settlementWrites: 0,
      dqAlertCreated: false,
      materialize: batch,
    };
  }
}

void ACCOUNTING_SNAPSHOT_CLIENT_KEY_PREFIX;
