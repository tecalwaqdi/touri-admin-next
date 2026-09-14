/**
 * Adjustment command service — append-only; never mutates order majors / FR1 principal.
 * FR6 A): reason, amount, currency, direction, responsible party, source, actor, timestamp,
 * dual-control approve, immutable history.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  assertAdjustmentSourcePresent,
  assertAdjustmentWithinLimit,
  assertCumulativeAdjustmentFeasible,
  assertCurrencyMatch,
  assertReasonPresent,
  type AdjustmentDirection,
  type AdjustmentResponsibleParty,
} from "@/domain/finance/v2/Fr6CorrectionIntegrity";
import { FinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";

export type AdjustmentStatus = "draft" | "approved" | "rejected";

export type FinanceAdjustment = {
  id: string;
  status: AdjustmentStatus;
  countryId: string;
  currency: string;
  amountMinor: bigint;
  direction: AdjustmentDirection;
  responsibleParty: AdjustmentResponsibleParty;
  reason: string;
  relatedOrderId: string | null;
  relatedSettlementId: string | null;
  createdByUserId: string;
  approvedByUserId: string | null;
  rejectedByUserId: string | null;
  idempotencyKey: string;
  createdAtUtc: string;
  approvedAtUtc: string | null;
  rejectedAtUtc: string | null;
  /** Explicit: never mutates historical majors. */
  mutatesOrderMajors: false;
  mutatesFr1Principal: false;
};

type Actor = {
  userId: string;
  permissions: FinancePermission[];
  countryIds?: string[];
};

export class AdjustmentCommandService {
  private readonly byId = new Map<string, FinanceAdjustment>();
  private readonly byIdempotency = new Map<string, string>();
  private seq = 0;

  constructor(
    private readonly gate: FinanceWriteGate,
    private readonly audit: FinanceAuditService,
  ) {}

  /** Approved adjustment amounts linked to a settlement (absolute sum). */
  approvedSumForSettlement(settlementId: string): bigint {
    let sum = BigInt(0);
    for (const adj of this.byId.values()) {
      if (
        adj.relatedSettlementId === settlementId &&
        adj.status === "approved"
      ) {
        sum += adj.amountMinor;
      }
    }
    return sum;
  }

  async create(
    actor: Actor,
    input: {
      countryId: string;
      currency: string;
      amountMinor: bigint;
      reason: string;
      direction: AdjustmentDirection;
      responsibleParty?: AdjustmentResponsibleParty;
      relatedOrderId?: string | null;
      relatedSettlementId?: string | null;
      sourceCurrency?: string | null;
      maxAmountMinor?: bigint | null;
      settlementAmountMinor?: bigint | null;
      paidConfirmedMinor?: bigint | null;
      clientKey: string;
      correlationId: string;
    },
  ): Promise<FinanceAdjustment> {
    if (!actor.permissions.includes("finance:adjust")) {
      throw new Error("rbac_denied:finance:adjust");
    }
    this.gate.requireWritable("adjustment.create");
    assertReasonPresent(input.reason);
    assertAdjustmentSourcePresent(input);
    assertCurrencyMatch({
      currency: input.currency,
      sourceCurrency: input.sourceCurrency,
    });
    if (actor.countryIds?.length && !actor.countryIds.includes(input.countryId)) {
      throw new Error(`cross_country_denied:${input.countryId}`);
    }
    assertAdjustmentWithinLimit({
      amountMinor: input.amountMinor,
      maxAmountMinor: input.maxAmountMinor ?? null,
    });
    if (
      input.settlementAmountMinor != null &&
      input.relatedSettlementId
    ) {
      assertCumulativeAdjustmentFeasible({
        settlementAmountMinor: input.settlementAmountMinor,
        paidConfirmedMinor: input.paidConfirmedMinor ?? BigInt(0),
        approvedAdjustmentSumMinor: this.approvedSumForSettlement(
          input.relatedSettlementId,
        ),
        nextAdjustmentMinor: input.amountMinor,
        direction: input.direction,
      });
    }

    const idempotencyKey = buildFinanceIdempotencyKey({
      actorUid: actor.userId,
      op: "adjustment.create",
      resourceType: "finance_adjustments",
      resourceId: input.relatedSettlementId ?? input.relatedOrderId ?? "none",
      clientKey: input.clientKey,
    });
    const existing = this.byIdempotency.get(idempotencyKey);
    if (existing) return this.byId.get(existing)!;

    this.seq += 1;
    const now = new Date().toISOString();
    const adj: FinanceAdjustment = {
      id: `fake_adj_${this.seq}`,
      status: "draft",
      countryId: input.countryId,
      currency: input.currency.toUpperCase(),
      amountMinor: input.amountMinor,
      direction: input.direction,
      responsibleParty: input.responsibleParty ?? "unknown",
      reason: input.reason.trim(),
      relatedOrderId: input.relatedOrderId ?? null,
      relatedSettlementId: input.relatedSettlementId ?? null,
      createdByUserId: actor.userId,
      approvedByUserId: null,
      rejectedByUserId: null,
      idempotencyKey,
      createdAtUtc: now,
      approvedAtUtc: null,
      rejectedAtUtc: null,
      mutatesOrderMajors: false,
      mutatesFr1Principal: false,
    };
    this.byId.set(adj.id, adj);
    this.byIdempotency.set(idempotencyKey, adj.id);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "adjustment.create",
      resourceType: "finance_adjustments",
      resourceId: adj.id,
      correlationId: input.correlationId,
      idempotencyKey,
      reason: input.reason,
    });
    return adj;
  }

  async approve(
    actor: Actor,
    input: { adjustmentId: string; correlationId: string },
  ): Promise<FinanceAdjustment> {
    if (!actor.permissions.includes("finance:adjust_approve")) {
      throw new Error("rbac_denied:finance:adjust_approve");
    }
    this.gate.requireWritable("adjustment.approve");
    const cur = this.byId.get(input.adjustmentId);
    if (!cur) throw new Error("adjustment_not_found");
    if (cur.createdByUserId === actor.userId) {
      throw new Error("dual_control_violation");
    }
    if (cur.status !== "draft") {
      throw new Error(`adjustment_not_draft:${cur.status}`);
    }
    const next: FinanceAdjustment = {
      ...cur,
      status: "approved",
      approvedByUserId: actor.userId,
      approvedAtUtc: new Date().toISOString(),
    };
    this.byId.set(next.id, next);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "adjustment.approve",
      resourceType: "finance_adjustments",
      resourceId: next.id,
      correlationId: input.correlationId,
      reason: cur.reason,
    });
    return next;
  }

  async reject(
    actor: Actor,
    input: { adjustmentId: string; reason: string; correlationId: string },
  ): Promise<FinanceAdjustment> {
    if (!actor.permissions.includes("finance:adjust_approve")) {
      throw new Error("rbac_denied:finance:adjust_approve");
    }
    this.gate.requireWritable("adjustment.approve");
    assertReasonPresent(input.reason);
    const cur = this.byId.get(input.adjustmentId);
    if (!cur) throw new Error("adjustment_not_found");
    if (cur.createdByUserId === actor.userId) {
      throw new Error("dual_control_violation");
    }
    if (cur.status !== "draft") {
      throw new Error(`adjustment_not_draft:${cur.status}`);
    }
    const next: FinanceAdjustment = {
      ...cur,
      status: "rejected",
      rejectedByUserId: actor.userId,
      rejectedAtUtc: new Date().toISOString(),
    };
    this.byId.set(next.id, next);
    await this.audit.record({
      actorUserId: actor.userId,
      action: "adjustment.reject",
      resourceType: "finance_adjustments",
      resourceId: next.id,
      correlationId: input.correlationId,
      reason: input.reason,
    });
    return next;
  }

  get(id: string): FinanceAdjustment | undefined {
    return this.byId.get(id);
  }
}
