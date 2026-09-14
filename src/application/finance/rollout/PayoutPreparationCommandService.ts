/**
 * FR5 — Settlement execution preparation + payout preparation (NOT live).
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { assertFinanceWriteStillDisabled } from "@/application/finance/rollout/FinanceRolloutFlags";

export type PaymentPreparationStatus = "prepared" | "cancelled";
export type PayoutPreparationStatus =
  | "prepared"
  | "ready_for_execute"
  | "cancelled";

export type SettlementPaymentPreparation = {
  id: string;
  settlementId: string;
  currency: string;
  amountMinor: bigint;
  status: PaymentPreparationStatus;
  liveExecute: false;
  idempotencyKey: string;
  createdByUserId: string;
};

export type PayoutPreparation = {
  id: string;
  settlementId: string;
  currency: string;
  amountMinor: bigint;
  status: PayoutPreparationStatus;
  liveProviderCall: false;
  idempotencyKey: string;
  createdByUserId: string;
};

type Actor = { userId: string; permissions: FinancePermission[]; countryIds?: string[] };

export class SettlementExecutionPreparationService {
  private readonly byId = new Map<string, SettlementPaymentPreparation>();
  private readonly byIdempotency = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async prepare(
    actor: Actor,
    input: {
      settlementId: string;
      currency: string;
      amountMinor: bigint;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<SettlementPaymentPreparation> {
    assertFinanceWriteStillDisabled(false);
    if (!actor.permissions.includes("settlements:execute")) {
      throw new Error("rbac_denied:settlements:execute");
    }
    this.gate.requireWritable("payment.prepare");
    if (!input.currency?.trim()) throw new Error("currency_required");

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "payment.prepare",
      resourceType: "settlement_payments",
      resourceId: input.settlementId,
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    this.seq += 1;
    const row: SettlementPaymentPreparation = {
      id: `fake_payprep_${this.seq}`,
      settlementId: input.settlementId,
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      status: "prepared",
      liveExecute: false,
      idempotencyKey,
      createdByUserId: actor.userId,
    };
    this.byId.set(row.id, row);
    this.byIdempotency.set(idempotencyKey, row.id);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payment.prepare",
      resourceType: "settlement_payment_intents",
      resourceId: row.id,
      correlationId: input.correlationId,
      idempotencyKey,
    });
    return row;
  }
}

export class PayoutPreparationCommandService {
  private readonly byId = new Map<string, PayoutPreparation>();
  private readonly byIdempotency = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async prepare(
    actor: Actor,
    input: {
      settlementId: string;
      currency: string;
      amountMinor: bigint;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<PayoutPreparation> {
    assertFinanceWriteStillDisabled(false);
    if (!actor.permissions.includes("payouts:prepare")) {
      throw new Error("rbac_denied:payouts:prepare");
    }
    this.gate.requireWritable("payout.prepare");
    if (!input.currency?.trim()) throw new Error("currency_required");

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "payout.prepare",
      resourceType: "finance_payout_preparations",
      resourceId: input.settlementId,
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    this.seq += 1;
    const row: PayoutPreparation = {
      id: `fake_payoutprep_${this.seq}`,
      settlementId: input.settlementId,
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      status: "prepared",
      liveProviderCall: false,
      idempotencyKey,
      createdByUserId: actor.userId,
    };
    this.byId.set(row.id, row);
    this.byIdempotency.set(idempotencyKey, row.id);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payout.prepare",
      resourceType: "finance_payout_preparations",
      resourceId: row.id,
      correlationId: input.correlationId,
      idempotencyKey,
    });
    return row;
  }

  async transition(
    actor: Actor,
    input: {
      payoutId: string;
      to: PayoutPreparationStatus;
      correlationId: string;
    },
  ): Promise<PayoutPreparation> {
    if (!actor.permissions.includes("payouts:prepare")) {
      throw new Error("rbac_denied:payouts:prepare");
    }
    this.gate.requireWritable("payout.state_transition");
    const cur = this.byId.get(input.payoutId);
    if (!cur) throw new Error("payout_prep_not_found");
    if (input.to === "ready_for_execute" && !actor.permissions.includes("payouts:execute")) {
      // Marking ready still requires execute perm for the transition into execute-ready.
      throw new Error("rbac_denied:payouts:execute");
    }
    const next: PayoutPreparation = { ...cur, status: input.to, liveProviderCall: false };
    this.byId.set(next.id, next);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payout.state_transition",
      resourceType: "finance_payout_preparations",
      resourceId: next.id,
      correlationId: input.correlationId,
    });
    return next;
  }
}
