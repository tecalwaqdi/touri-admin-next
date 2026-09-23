/**
 * Finance forward reconcile — scan recent completed orders and auto-finalize
 * eligible ones via FinanceForwardAutoSnapshotService (in-process).
 *
 * Covers cash + card when the Legacy CF S2S hook is unavailable or delayed.
 * Never mutates orders. Idempotent. Failures per-order do not stop the batch.
 */

import {
  FinanceForwardAutoSnapshotService,
  type FinanceForwardAutoSnapshotResult,
} from "@/application/finance/materialize/FinanceForwardAutoSnapshotService";
import type { AccountingSnapshotMaterializePorts } from "@/application/finance/materialize/AccountingSnapshotMaterializePorts";
import type { MaterializeActor } from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { evaluateCertifiedAccountingSnapshotEligibility } from "@/domain/finance/v2/CertifiedSnapshotEligibility";

export type FinanceForwardReconcileResult = {
  dryRun: boolean;
  scanned: number;
  attempted: number;
  created: number;
  alreadyMaterialized: number;
  skipped: number;
  dqAlerted: number;
  errors: number;
  results: FinanceForwardAutoSnapshotResult[];
  orderMutations: 0;
  settlementWrites: 0;
};

function paymentChannel(data: Record<string, unknown>): "cash" | "card" | "unknown" {
  const method = String(data.PaymentMethod ?? data.payment_method ?? "")
    .toLowerCase();
  if (method.includes("cash")) return "cash";
  if (
    method.includes("card") ||
    method.includes("online") ||
    method.includes("ngenius") ||
    method.includes("wallet")
  ) {
    return "card";
  }
  const pay = String(data.payment_status ?? "").toLowerCase();
  if (pay === "cash_collected" || pay === "pending_cash") return "cash";
  if (pay === "paid" || pay === "captured") return "card";
  return "unknown";
}

function isLikelyEligible(data: Record<string, unknown>): boolean {
  const elig = evaluateCertifiedAccountingSnapshotEligibility({
    lifecycleStatus: String(data.status_code ?? ""),
    paymentChannel: paymentChannel(data),
    paymentStatus: String(data.payment_status ?? ""),
  });
  return elig.eligible;
}

export class FinanceForwardReconcileService {
  private readonly auto: FinanceForwardAutoSnapshotService;

  constructor(
    private readonly ports: AccountingSnapshotMaterializePorts,
    gate: FinanceWriteGate,
  ) {
    this.auto = new FinanceForwardAutoSnapshotService(ports, gate);
  }

  async reconcile(input: {
    actor: MaterializeActor;
    dryRun: boolean;
    correlationId: string;
    scanLimit?: number;
    includeQaFixtures?: boolean;
  }): Promise<FinanceForwardReconcileResult> {
    const scanLimit = Math.min(Math.max(1, input.scanLimit ?? 25), 50);
    const recent = await this.ports.read.listRecentOrders({ limit: scanLimit });

    const out: FinanceForwardReconcileResult = {
      dryRun: input.dryRun,
      scanned: recent.length,
      attempted: 0,
      created: 0,
      alreadyMaterialized: 0,
      skipped: 0,
      dqAlerted: 0,
      errors: 0,
      results: [],
      orderMutations: 0,
      settlementWrites: 0,
    };

    for (const row of recent) {
      if (!isLikelyEligible(row.data)) {
        out.skipped += 1;
        continue;
      }
      out.attempted += 1;
      try {
        const result = await this.auto.finalizeOrder({
          actor: input.actor,
          orderId: row.id,
          dryRun: input.dryRun,
          correlationId: `${input.correlationId}:${row.id}`,
          includeQaFixtures: input.includeQaFixtures === true,
        });
        out.results.push(result);
        if (result.outcome === "created" || result.outcome === "eligible_dry_run") {
          out.created += 1;
        } else if (result.outcome === "already_materialized") {
          out.alreadyMaterialized += 1;
        } else if (
          result.outcome === "inconsistent_dq_alerted" ||
          result.outcome === "inconsistent_dq_dry_run"
        ) {
          out.dqAlerted += 1;
        } else if (result.outcome === "error") {
          out.errors += 1;
        } else {
          out.skipped += 1;
        }
      } catch {
        out.errors += 1;
      }
    }

    return out;
  }
}
