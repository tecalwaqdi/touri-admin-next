/**
 * Offline Fake Settlement V2 repository — design preparation only.
 * No Production I/O. Implements dual-control, idempotency, payments.
 */

import {
  assertFinanceWritesDisabled,
  buildFinanceIdempotencyKey,
  canTransitionSettlementV2,
  creatorCannotApprove,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import type { SettlementPayment } from "@/domain/settlement/v2/SettlementPayment";
import {
  buildPaymentIdempotencyKey,
  canConfirmPayment,
  canReversePayment,
} from "@/domain/settlement/v2/SettlementPayment";
import type {
  CreateSettlementDraftInput,
  SettlementV2Repository,
} from "@/repositories/interfaces/SettlementV2Repository";
import { isAgentCompanyDirection } from "@/domain/settlement/v2/SettlementDirections";
import { isDriverCompanyDirection } from "@/domain/settlement/v2/SettlementDirections";

export class FakeSettlementV2Repository implements SettlementV2Repository {
  private readonly byId = new Map<string, SettlementV2>();
  private readonly payments = new Map<string, SettlementPayment>();
  private readonly byIdempotency = new Map<string, string>();
  private readonly paymentByIdempotency = new Map<string, string>();
  private seq = 0;
  private paySeq = 0;

  async createDraft(input: CreateSettlementDraftInput): Promise<SettlementV2> {
    assertFinanceWritesDisabled(false);

    if (input.claims.length === 0) {
      throw new Error("claims_required");
    }
    for (const c of input.claims) {
      if (c.currency !== input.currency) {
        throw new Error("currency_mismatch");
      }
    }
    if (input.partyType === "driver" && !isDriverCompanyDirection(input.direction)) {
      throw new Error("driver_settlement_invalid_direction");
    }
    if (input.partyType === "agent" && !isAgentCompanyDirection(input.direction)) {
      throw new Error("agent_settlement_invalid_direction");
    }
    // Agent settlements claim agent commission lines only — no driver cash/online.
    if (input.partyType === "agent") {
      for (const c of input.claims) {
        if (!c.lineId.startsWith("agt_line_")) {
          throw new Error("agent_settlement_driver_claim_forbidden");
        }
      }
    }

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: input.createdByUserId,
      op: "settlement.create",
      resourceType: "financial_settlements",
      resourceId: `${input.partyType}:${input.partyId}`,
      clientKey: input.clientKey,
    });
    const existingId = this.byIdempotency.get(idempotencyKey);
    if (existingId) {
      return this.byId.get(existingId)!;
    }

    const amountMinor = input.claims.reduce(
      (sum, c) => sum + c.amountMinor,
      BigInt(0),
    );
    this.seq += 1;
    const now = new Date().toISOString();
    const settlement: SettlementV2 = {
      id: `fake_set_${this.seq}`,
      partyType: input.partyType,
      partyId: input.partyId,
      countryId: input.countryId,
      currency: input.currency,
      status: "draft",
      direction: input.direction,
      amountMinor,
      paidConfirmedMinor: BigInt(0),
      periodFromUtc: input.periodFromUtc,
      periodToUtc: input.periodToUtc,
      claims: input.claims.map((c) => ({ ...c })),
      createdByUserId: input.createdByUserId,
      lockedByUserId: null,
      voidedByUserId: null,
      idempotencyKey,
      correlationId: input.correlationId,
      createdAtUtc: now,
      updatedAtUtc: now,
      dueAtUtc: input.dueAtUtc ?? null,
      productionApproved: false,
    };
    this.byId.set(settlement.id, settlement);
    this.byIdempotency.set(idempotencyKey, settlement.id);
    return settlement;
  }

  async lock(input: {
    settlementId: string;
    approverUserId: string;
    clientKey: string;
  }): Promise<SettlementV2> {
    assertFinanceWritesDisabled(false);
    const cur = this.byId.get(input.settlementId);
    if (!cur) throw new Error("settlement_not_found");

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: input.approverUserId,
      op: "settlement.lock",
      resourceType: "financial_settlements",
      resourceId: input.settlementId,
      clientKey: input.clientKey,
    });
    const existingId = this.byIdempotency.get(idempotencyKey);
    if (existingId) {
      return this.byId.get(existingId)!;
    }

    if (!creatorCannotApprove(cur.createdByUserId, input.approverUserId)) {
      throw new Error("dual_control_violation");
    }
    if (!canTransitionSettlementV2(cur.status, "locked")) {
      throw new Error(`invalid_transition:${cur.status}->locked`);
    }
    const next: SettlementV2 = {
      ...cur,
      status: "locked",
      lockedByUserId: input.approverUserId,
      updatedAtUtc: new Date().toISOString(),
    };
    this.byId.set(next.id, next);
    this.byIdempotency.set(idempotencyKey, next.id);
    return next;
  }

  async void(input: {
    settlementId: string;
    actorUserId: string;
    reason: string;
  }): Promise<SettlementV2> {
    assertFinanceWritesDisabled(false);
    const cur = this.byId.get(input.settlementId);
    if (!cur) throw new Error("settlement_not_found");
    if (!canTransitionSettlementV2(cur.status, "voided")) {
      throw new Error(`invalid_transition:${cur.status}->voided`);
    }
    const next: SettlementV2 = {
      ...cur,
      status: "voided",
      voidedByUserId: input.actorUserId,
      updatedAtUtc: new Date().toISOString(),
    };
    this.byId.set(next.id, next);
    return next;
  }

  async createPayment(input: {
    settlementId: string;
    amountMinor: bigint;
    createdByUserId: string;
    clientKey: string;
  }): Promise<SettlementPayment> {
    assertFinanceWritesDisabled(false);
    const cur = this.byId.get(input.settlementId);
    if (!cur) throw new Error("settlement_not_found");
    const idempotencyKey = buildPaymentIdempotencyKey({
      actorUid: input.createdByUserId,
      op: "payment.create",
      settlementId: input.settlementId,
      clientKey: input.clientKey,
    });
    const existingId = this.paymentByIdempotency.get(idempotencyKey);
    if (existingId) return this.payments.get(existingId)!;

    if (cur.status !== "locked" && cur.status !== "partially_paid") {
      throw new Error(`payment_not_allowed:${cur.status}`);
    }

    this.paySeq += 1;
    const payment: SettlementPayment = {
      id: `fake_pay_${this.paySeq}`,
      settlementId: input.settlementId,
      direction: cur.direction,
      amountMinor: input.amountMinor,
      currency: cur.currency,
      status: "pending",
      createdByUserId: input.createdByUserId,
      confirmedByUserId: null,
      reversedByUserId: null,
      idempotencyKey,
      createdAtUtc: new Date().toISOString(),
      confirmedAtUtc: null,
      reversedAtUtc: null,
    };
    this.payments.set(payment.id, payment);
    this.paymentByIdempotency.set(idempotencyKey, payment.id);
    return payment;
  }

  async confirmPayment(input: {
    paymentId: string;
    actorUserId: string;
    clientKey: string;
  }): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }> {
    assertFinanceWritesDisabled(false);
    const payment = this.payments.get(input.paymentId);
    if (!payment) throw new Error("payment_not_found");
    const idempotencyKey = buildPaymentIdempotencyKey({
      actorUid: input.actorUserId,
      op: "payment.confirm",
      settlementId: payment.settlementId,
      clientKey: input.clientKey,
    });
    const existingPayId = this.paymentByIdempotency.get(idempotencyKey);
    if (existingPayId) {
      return {
        payment: this.payments.get(existingPayId)!,
        settlement: this.byId.get(payment.settlementId)!,
      };
    }
    if (!canConfirmPayment(payment.status)) {
      throw new Error(`payment_confirm_invalid:${payment.status}`);
    }
    const cur = this.byId.get(payment.settlementId);
    if (!cur) throw new Error("settlement_not_found");

    const paid = cur.paidConfirmedMinor + payment.amountMinor;
    if (paid > cur.amountMinor) throw new Error("overpay");
    const status =
      paid === cur.amountMinor ? "settled" : ("partially_paid" as const);
    const nextSettlement: SettlementV2 = {
      ...cur,
      paidConfirmedMinor: paid,
      status,
      updatedAtUtc: new Date().toISOString(),
    };
    const nextPayment: SettlementPayment = {
      ...payment,
      status: "confirmed",
      confirmedByUserId: input.actorUserId,
      confirmedAtUtc: new Date().toISOString(),
    };
    this.byId.set(nextSettlement.id, nextSettlement);
    this.payments.set(nextPayment.id, nextPayment);
    this.paymentByIdempotency.set(idempotencyKey, nextPayment.id);
    return { payment: nextPayment, settlement: nextSettlement };
  }

  async reversePayment(input: {
    paymentId: string;
    actorUserId: string;
    reason: string;
    clientKey: string;
  }): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }> {
    assertFinanceWritesDisabled(false);
    if (!input.reason?.trim()) throw new Error("missing_reason");
    const payment = this.payments.get(input.paymentId);
    if (!payment) throw new Error("payment_not_found");

    const idempotencyKey = buildPaymentIdempotencyKey({
      actorUid: input.actorUserId,
      op: "payment.reverse",
      settlementId: payment.settlementId,
      clientKey: input.clientKey,
    });
    const existingPayId = this.paymentByIdempotency.get(idempotencyKey);
    if (existingPayId) {
      return {
        payment: this.payments.get(existingPayId)!,
        settlement: this.byId.get(payment.settlementId)!,
      };
    }

    if (!canReversePayment(payment.status)) {
      throw new Error(`payment_reverse_invalid:${payment.status}`);
    }
    const cur = this.byId.get(payment.settlementId);
    if (!cur) throw new Error("settlement_not_found");

    // Settled history immutable — reopen via reverse forbidden; use append-only adjustment.
    if (cur.status === "settled") {
      throw new Error(
        "settled_history_immutable:use_append_only_adjustment_not_payment_reverse",
      );
    }
    if (cur.status !== "locked" && cur.status !== "partially_paid") {
      throw new Error(`payment_reverse_settlement_invalid:${cur.status}`);
    }

    const paid = cur.paidConfirmedMinor - payment.amountMinor;
    if (paid < BigInt(0)) throw new Error("underflow");
    if (payment.amountMinor > cur.paidConfirmedMinor) {
      throw new Error(
        `reversal_exceeds_original:${payment.amountMinor}>${cur.paidConfirmedMinor}`,
      );
    }
    let status: SettlementV2["status"] = "partially_paid";
    if (paid === BigInt(0)) status = "locked";
    const nextSettlement: SettlementV2 = {
      ...cur,
      paidConfirmedMinor: paid,
      status,
      updatedAtUtc: new Date().toISOString(),
    };
    const nextPayment: SettlementPayment = {
      ...payment,
      status: "reversed",
      reversedByUserId: input.actorUserId,
      reversedAtUtc: new Date().toISOString(),
      reason: input.reason,
      idempotencyKey,
    };
    this.byId.set(nextSettlement.id, nextSettlement);
    this.payments.set(nextPayment.id, nextPayment);
    this.paymentByIdempotency.set(idempotencyKey, nextPayment.id);
    return { payment: nextPayment, settlement: nextSettlement };
  }

  async get(id: string): Promise<SettlementV2 | null> {
    return this.byId.get(id) ?? null;
  }

  async getPayment(id: string): Promise<SettlementPayment | null> {
    return this.payments.get(id) ?? null;
  }
}
