/**
 * Reconciliation service — read/compare command (D-10).
 * Offline Fake + shadow variance reports. Never auto-fix Production.
 */

import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { AccountingLine } from "@/domain/finance/v2/AccountingLine";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import {
  emptyReconciliationRun,
  type ReconciliationRun,
} from "@/domain/reconciliation/ReconciliationRun";
import { buildVariance, type Variance } from "@/domain/reconciliation/Variance";
import type { ReconciliationRepository } from "@/repositories/interfaces/ReconciliationRepository";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { chargebackNotRepresented } from "@/domain/finance/v2/FinanceImplementationContracts";

export type ReconInputSnapshot = {
  orderId: string;
  orderMajorDriverNetMinor: bigint | null;
  accountingLine?: AccountingLine | null;
  settlementClaimMinor?: bigint | null;
  settlementPaymentConfirmedMinor?: bigint | null;
  providerCaptureMinor?: bigint | null;
  refundSessionMinor?: bigint | null;
};

export class ReconciliationService {
  private seq = 0;

  constructor(
    private readonly repo: ReconciliationRepository,
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async run(input: {
    actor: { userId: string; permissions: FinancePermission[] };
    countryId: string;
    currency: string;
    periodFromUtc: string;
    periodToUtc: string;
    clientKey: string;
    correlationId: string;
    snapshots: ReconInputSnapshot[];
    settlements?: SettlementV2[];
  }): Promise<ReconciliationRun> {
    if (!input.actor.permissions.includes("finance:read")) {
      throw new Error("rbac_denied:finance:read");
    }

    // Recon is read/compare; Fake may persist run doc offline only.
    const decision = this.gate.assertWritable("recon.run");
    if (!decision.allowed && this.gate.FINANCE_WRITE_ENABLED === false) {
      // Production: still allow in-memory shadow result without persistence writes
      // when env is production — return completed shadow run, productionWrites=0.
    }

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: input.actor.userId,
      op: "recon.run",
      resourceType: "finance_reconciliation_runs",
      resourceId: `${input.countryId}:${input.currency}`,
      clientKey: input.clientKey,
    });

    const existing = await this.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    this.seq += 1;
    let run = emptyReconciliationRun({
      id: `fake_recon_${this.seq}`,
      countryId: input.countryId,
      currency: input.currency,
      periodFromUtc: input.periodFromUtc,
      periodToUtc: input.periodToUtc,
      createdByUserId: input.actor.userId,
      idempotencyKey,
      correlationId: input.correlationId,
    });

    const variances: Variance[] = [];
    const cb = chargebackNotRepresented();
    variances.push(
      buildVariance({
        dimension: "chargebacks",
        leftRef: "policy",
        rightRef: "gateway",
        leftMinor: cb.amountMinor,
        rightMinor: null,
        severity: "info",
        reasonCode: "chargeback_not_represented",
      }),
    );

    for (const snap of input.snapshots) {
      if (
        snap.accountingLine &&
        snap.settlementClaimMinor != null &&
        snap.accountingLine.amount.amountMinor != null &&
        snap.accountingLine.amount.amountMinor !== snap.settlementClaimMinor
      ) {
        variances.push(
          buildVariance({
            dimension: "settlement_claims",
            leftRef: snap.accountingLine.lineId,
            rightRef: `claim:${snap.orderId}`,
            leftMinor: snap.accountingLine.amount.amountMinor,
            rightMinor: snap.settlementClaimMinor,
            severity: "blocker",
            reasonCode: "line_claim_mismatch",
          }),
        );
      }

      if (
        snap.orderMajorDriverNetMinor != null &&
        snap.accountingLine?.partyType === "driver" &&
        snap.accountingLine.paymentChannel === "card" &&
        snap.accountingLine.amount.amountMinor != null &&
        snap.orderMajorDriverNetMinor !== snap.accountingLine.amount.amountMinor
      ) {
        variances.push(
          buildVariance({
            dimension: "order_majors",
            leftRef: `order:${snap.orderId}:total_mndob`,
            rightRef: snap.accountingLine.lineId,
            leftMinor: snap.orderMajorDriverNetMinor,
            rightMinor: snap.accountingLine.amount.amountMinor,
            severity: "blocker",
            reasonCode: "order_vs_line_mismatch",
          }),
        );
      }

      if (snap.refundSessionMinor != null) {
        variances.push(
          buildVariance({
            dimension: "refunds",
            leftRef: `session_refund:${snap.orderId}`,
            rightRef: `order_majors:${snap.orderId}`,
            leftMinor: snap.refundSessionMinor,
            rightMinor: snap.orderMajorDriverNetMinor,
            severity: "warning",
            reasonCode: "refund_session_present_majors_immutable",
          }),
        );
      }
    }

    for (const s of input.settlements ?? []) {
      if (s.currency !== input.currency) {
        variances.push(
          buildVariance({
            dimension: "settlement_payments",
            leftRef: s.id,
            rightRef: `run_currency:${input.currency}`,
            leftMinor: null,
            rightMinor: null,
            severity: "blocker",
            reasonCode: "cross_currency_fail_closed",
          }),
        );
      }
      if (s.countryId !== input.countryId) {
        variances.push(
          buildVariance({
            dimension: "settlement_payments",
            leftRef: s.id,
            rightRef: `run_country:${input.countryId}`,
            leftMinor: null,
            rightMinor: null,
            severity: "blocker",
            reasonCode: "cross_country_fail_closed",
          }),
        );
      }
    }

    run = {
      ...run,
      status: "completed",
      variances,
      completedAtUtc: new Date().toISOString(),
      productionWrites: 0,
    };

    if (decision.allowed) {
      await this.repo.save(run);
    }

    await this.audit.record({
      actorUserId: input.actor.userId,
      action: "recon.run",
      resourceType: "finance_reconciliation_runs",
      resourceId: run.id,
      correlationId: input.correlationId,
      idempotencyKey,
    });

    return run;
  }
}
