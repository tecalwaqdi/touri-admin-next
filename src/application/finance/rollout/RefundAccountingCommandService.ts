/**
 * FR6 — Refund accounting (offline Fake). Order majors immutable.
 * Distinguishes customer_refund vs internal_settlement_correction.
 * Never invents customer refund where no gateway payment exists.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  assertCurrencyMatch,
  assertCustomerRefundCapability,
  assertReasonPresent,
  assertRefundWithinRefundable,
  type RefundKind,
} from "@/domain/finance/v2/Fr6CorrectionIntegrity";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { assertFinanceWriteStillDisabled } from "@/application/finance/rollout/FinanceRolloutFlags";

export type RefundAccountingRecord = {
  id: string;
  kind: RefundKind;
  relatedOrderId: string;
  sessionId: string | null;
  countryId: string;
  currency: string;
  amountMinor: bigint | null;
  status: "recorded" | "reversed";
  mutatesOrderMajors: false;
  mutatesFr1Principal: false;
  idempotencyKey: string;
  createdByUserId: string;
  createdAtUtc: string;
  reason: string;
};

type Actor = { userId: string; permissions: FinancePermission[]; countryIds?: string[] };

export class RefundAccountingCommandService {
  private readonly byId = new Map<string, RefundAccountingRecord>();
  private readonly byIdempotency = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async record(
    actor: Actor,
    input: {
      relatedOrderId: string;
      sessionId?: string | null;
      countryId: string;
      currency: string;
      amountMinor: bigint | null;
      kind?: RefundKind;
      paymentChannel?: "cash" | "card" | "unknown";
      refundableAmountMinor?: bigint | null;
      sourceCurrency?: string | null;
      reason?: string;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<RefundAccountingRecord> {
    assertFinanceWriteStillDisabled(false);
    if (!actor.permissions.includes("finance:adjust")) {
      throw new Error("rbac_denied:finance:adjust");
    }
    this.gate.requireWritable("refund.account");
    if (!input.currency?.trim()) throw new Error("currency_required");
    if (!input.relatedOrderId?.trim()) {
      throw new Error("missing_source:relatedOrderId");
    }
    assertReasonPresent(input.reason ?? "refund_accounting");
    assertCurrencyMatch({
      currency: input.currency,
      sourceCurrency: input.sourceCurrency,
    });
    if (actor.countryIds?.length && !actor.countryIds.includes(input.countryId)) {
      throw new Error(`cross_country_denied:${input.countryId}`);
    }
    // Missing amount fail closed — never coerce to 0.
    if (input.amountMinor === null) {
      throw new Error("missing_value_fail_closed:refund_amount");
    }

    const kind: RefundKind = input.kind ?? "customer_refund";
    assertCustomerRefundCapability({
      kind,
      paymentChannel: input.paymentChannel ?? "unknown",
      gatewaySessionId: input.sessionId,
    });
    if (input.refundableAmountMinor !== undefined) {
      assertRefundWithinRefundable({
        amountMinor: input.amountMinor,
        refundableAmountMinor: input.refundableAmountMinor,
      });
    }

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "refund.account",
      resourceType: "finance_refund_accounting",
      resourceId: input.relatedOrderId,
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    this.seq += 1;
    const row: RefundAccountingRecord = {
      id: `fake_refund_${this.seq}`,
      kind,
      relatedOrderId: input.relatedOrderId,
      sessionId: input.sessionId ?? null,
      countryId: input.countryId,
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      status: "recorded",
      mutatesOrderMajors: false,
      mutatesFr1Principal: false,
      idempotencyKey,
      createdByUserId: actor.userId,
      createdAtUtc: new Date().toISOString(),
      reason: (input.reason ?? "refund_accounting").trim(),
    };
    this.byId.set(row.id, row);
    this.byIdempotency.set(idempotencyKey, row.id);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "refund.account",
      resourceType: "finance_refund_accounting",
      resourceId: row.id,
      correlationId: input.correlationId,
      idempotencyKey,
      reason: row.reason,
    });
    return row;
  }

  get(id: string): RefundAccountingRecord | undefined {
    return this.byId.get(id);
  }
}
