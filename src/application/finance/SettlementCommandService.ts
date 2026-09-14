/**
 * Settlement command service — gated; Fake offline.
 * All commands check FinanceWriteGate. Production always denied.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { SettlementV2Repository } from "@/repositories/interfaces/SettlementV2Repository";
import type { CreateSettlementDraftInput } from "@/repositories/interfaces/SettlementV2Repository";
import type { SettlementV2 } from "@/domain/settlement/v2/SettlementV2";
import type { SettlementPayment } from "@/domain/settlement/v2/SettlementPayment";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";

export type ActorContext = {
  userId: string;
  permissions: FinancePermission[];
};

function requirePerm(actor: ActorContext, perm: FinancePermission): void {
  if (!actor.permissions.includes(perm)) {
    throw new Error(`rbac_denied:${perm}`);
  }
}

/** Prepare = settlements:prepare OR legacy settlements:create. */
function requirePrepare(actor: ActorContext): void {
  const ok =
    actor.permissions.includes("settlements:prepare") ||
    actor.permissions.includes("settlements:create");
  if (!ok) throw new Error("rbac_denied:settlements:prepare");
}

export class SettlementCommandService {
  constructor(
    private readonly repo: SettlementV2Repository,
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  async createDraft(
    actor: ActorContext,
    input: Omit<CreateSettlementDraftInput, "createdByUserId">,
  ): Promise<SettlementV2> {
    requirePrepare(actor);
    this.gate.requireWritable("settlement.create");
    const settlement = await this.repo.createDraft({
      ...input,
      createdByUserId: actor.userId,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "settlement.create",
      resourceType: "financial_settlements",
      resourceId: settlement.id,
      correlationId: input.correlationId,
      idempotencyKey: settlement.idempotencyKey,
    });
    return settlement;
  }

  async lock(
    actor: ActorContext,
    input: { settlementId: string; clientKey: string; correlationId: string },
  ): Promise<SettlementV2> {
    requirePerm(actor, "settlements:approve");
    this.gate.requireWritable("settlement.lock");
    const settlement = await this.repo.lock({
      settlementId: input.settlementId,
      approverUserId: actor.userId,
      clientKey: input.clientKey,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "settlement.lock",
      resourceType: "financial_settlements",
      resourceId: settlement.id,
      correlationId: input.correlationId,
    });
    return settlement;
  }

  async void(
    actor: ActorContext,
    input: {
      settlementId: string;
      reason: string;
      correlationId: string;
    },
  ): Promise<SettlementV2> {
    requirePerm(actor, "settlements:reverse");
    this.gate.requireWritable("settlement.void");
    const settlement = await this.repo.void({
      settlementId: input.settlementId,
      actorUserId: actor.userId,
      reason: input.reason,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "settlement.void",
      resourceType: "financial_settlements",
      resourceId: settlement.id,
      correlationId: input.correlationId,
      reason: input.reason,
    });
    return settlement;
  }

  async createPayment(
    actor: ActorContext,
    input: {
      settlementId: string;
      amountMinor: bigint;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<SettlementPayment> {
    requirePerm(actor, "settlements:execute");
    this.gate.requireWritable("payment.create");
    const payment = await this.repo.createPayment({
      settlementId: input.settlementId,
      amountMinor: input.amountMinor,
      createdByUserId: actor.userId,
      clientKey: input.clientKey,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payment.create",
      resourceType: "settlement_payments",
      resourceId: payment.id,
      correlationId: input.correlationId,
      idempotencyKey: payment.idempotencyKey,
    });
    return payment;
  }

  async confirmPayment(
    actor: ActorContext,
    input: {
      paymentId: string;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }> {
    requirePerm(actor, "settlements:execute");
    this.gate.requireWritable("payment.confirm");
    const result = await this.repo.confirmPayment({
      paymentId: input.paymentId,
      actorUserId: actor.userId,
      clientKey: input.clientKey,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payment.confirm",
      resourceType: "settlement_payments",
      resourceId: result.payment.id,
      correlationId: input.correlationId,
    });
    return result;
  }

  async reversePayment(
    actor: ActorContext,
    input: {
      paymentId: string;
      reason: string;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<{ payment: SettlementPayment; settlement: SettlementV2 }> {
    requirePerm(actor, "settlements:reverse");
    this.gate.requireWritable("payment.reverse");
    const result = await this.repo.reversePayment({
      paymentId: input.paymentId,
      actorUserId: actor.userId,
      reason: input.reason,
      clientKey: input.clientKey,
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: "payment.reverse",
      resourceType: "settlement_payments",
      resourceId: result.payment.id,
      correlationId: input.correlationId,
      reason: input.reason,
    });
    return result;
  }
}
