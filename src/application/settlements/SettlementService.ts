import type { AuthUser } from "@/types/auth";
import type { Settlement, SettlementPartyType, SettlementSummary } from "@/domain/settlement/Settlement";
import { settlementStateMachine } from "@/domain/settlement/SettlementStateMachine";
import { IllegalSettlementTransitionError } from "@/domain/settlement/SettlementStateMachine";
import {
  settlementEligibilityService,
  type EligibilityExclusion,
} from "@/domain/finance/SettlementEligibilityService";
import { FinancialCalculationService } from "@/domain/finance/FinancialCalculationService";
import { Money } from "@/domain/finance/Money";
import { journalService } from "@/domain/ledger/Journal";
import type { JournalEntry } from "@/domain/ledger/Journal";
import type { SettlementRepository } from "@/repositories/interfaces/SettlementRepository";
import type { TripRepository } from "@/repositories/interfaces/TripRepository";
import type { LedgerRepository } from "@/repositories/interfaces/LedgerRepository";
import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import type { DriverRepository } from "@/repositories/interfaces/DriverRepository";
import { AuditService } from "@/audit/AuditService";
import { assertPermission, assertScope, AuthorizationError } from "@/permissions/guards";
import { createCorrelationId, createIdempotencyKey } from "@/lib/ids";
import { SYNTHETIC_POLICY_ID, SYNTHETIC_POLICY_VERSION } from "@/domain/finance/SyntheticFinancialPolicy";

export class SettlementBusinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "SettlementBusinessError";
  }
}

function sumMinor(
  values: Array<Money | null | undefined>,
  currency: string,
): string {
  let total = Money.zero(currency);
  for (const v of values) {
    if (v) total = total.add(v);
  }
  return total.amountMinor.toString();
}

export class SettlementService {
  constructor(
    private readonly settlements: SettlementRepository,
    private readonly trips: TripRepository,
    private readonly ledger: LedgerRepository,
    private readonly agents: AgentRepository,
    private readonly drivers: DriverRepository,
    private readonly audit: AuditService,
    private readonly calc: FinancialCalculationService,
  ) {}

  async previewEligibility(input: {
    partyType: SettlementPartyType;
    partyId: string;
    currencyCode: string;
    periodFromUtc: string;
    periodToUtc: string;
    countryId?: string;
  }) {
    const tripPage = await this.trips.list({ page: 1, pageSize: 500, countryId: input.countryId });
    const closedTripMap: Record<string, string> = {};
    const financials = [];
    const completedAt: Record<string, string | null> = {};

    for (const trip of tripPage.items) {
      const closed = await this.settlements.findClosedContainingTrip(trip.id);
      if (closed) closedTripMap[trip.id] = closed.id;
      financials.push(this.calc.calculateFromTrip(trip, closed?.id ?? null));
      completedAt[trip.id] = trip.completedAtUtc;
    }

    return settlementEligibilityService.evaluate({
      financialTrips: financials,
      partyType: input.partyType,
      partyId: input.partyId,
      currencyCode: input.currencyCode,
      periodFromUtc: input.periodFromUtc,
      periodToUtc: input.periodToUtc,
      tripCompletedAtById: completedAt,
    });
  }

  private buildSummary(
    tripIds: string[],
    currencyCode: string,
    financialByTrip: Map<string, ReturnType<FinancialCalculationService["calculateFromTrip"]>>,
  ): SettlementSummary {
    const fts = tripIds.map((id) => financialByTrip.get(id)!).filter(Boolean);
    return {
      tripCount: fts.length,
      grossFareMinor: sumMinor(
        fts.map((f) => f.amounts.grossFare),
        currencyCode,
      ),
      platformCommissionMinor: sumMinor(
        fts.map((f) => f.amounts.platformCommission),
        currencyCode,
      ),
      agentCommissionMinor: sumMinor(
        fts.map((f) => f.amounts.agentCommission),
        currencyCode,
      ),
      driverEarningsMinor: sumMinor(
        fts.map((f) => f.amounts.driverEarnings),
        currencyCode,
      ),
      vatAmountMinor: sumMinor(
        fts.map((f) => f.amounts.vatAmount),
        currencyCode,
      ),
      cashCollectedMinor: sumMinor(
        fts.map((f) => f.amounts.cashCollected),
        currencyCode,
      ),
      onlineCollectedMinor: sumMinor(
        fts.map((f) => f.amounts.onlineCollected),
        currencyCode,
      ),
      currencyCode,
    };
  }

  async createDraft(
    actor: AuthUser,
    input: {
      partyType: SettlementPartyType;
      partyId: string;
      currencyCode: string;
      periodFromUtc: string;
      periodToUtc: string;
      countryId: string;
      tripIds?: string[];
      idempotencyKey?: string;
      correlationId?: string;
    },
  ): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:create");
    assertScope(actor.scope, { countryId: input.countryId, agentId: input.partyType === "agent" ? input.partyId : undefined });

    const idempotencyKey = input.idempotencyKey ?? createIdempotencyKey("set");
    const existing = await this.settlements.findByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    if (input.partyType === "agent") {
      const agent = await this.agents.getById(input.partyId);
      if (!agent) throw new SettlementBusinessError("PARTY_NOT_FOUND", "Agent not found");
    } else {
      const driver = await this.drivers.getById(input.partyId);
      if (!driver) throw new SettlementBusinessError("PARTY_NOT_FOUND", "Driver not found");
    }

    const preview = await this.previewEligibility(input);
    const eligibleIds = new Set(preview.eligible.map((e) => e.tripId));
    const requested = input.tripIds ?? preview.eligible.map((e) => e.tripId);

    for (const tripId of requested) {
      const closed = await this.settlements.findClosedContainingTrip(tripId);
      if (closed) {
        throw new SettlementBusinessError(
          "DUPLICATE_SETTLEMENT_TRIP",
          `Trip ${tripId} already in closed settlement ${closed.id}`,
        );
      }
    }

    const tripIds = requested.filter((id) => eligibleIds.has(id));

    const financialByTrip = new Map(preview.eligible.map((f) => [f.tripId, f]));
    const correlationId = input.correlationId ?? createCorrelationId();
    const now = new Date().toISOString();
    const id = `SET-${input.countryId}-${Date.now().toString(36).toUpperCase()}`;

    const settlement: Settlement = {
      id,
      partyType: input.partyType,
      partyId: input.partyId,
      countryId: input.countryId,
      currencyCode: input.currencyCode.toUpperCase(),
      periodFromUtc: input.periodFromUtc,
      periodToUtc: input.periodToUtc,
      status: "draft",
      tripIds,
      excluded: preview.excluded,
      summary: this.buildSummary(tripIds, input.currencyCode.toUpperCase(), financialByTrip),
      calculationPolicyId: SYNTHETIC_POLICY_ID,
      calculationPolicyVersion: SYNTHETIC_POLICY_VERSION,
      createdByUserId: actor.id,
      submittedByUserId: null,
      approvedByUserId: null,
      rejectedByUserId: null,
      closedByUserId: null,
      reversedByUserId: null,
      rejectionReason: null,
      reversalReason: null,
      reversesSettlementId: null,
      reversedBySettlementId: null,
      idempotencyKey,
      correlationId,
      createdAtUtc: now,
      updatedAtUtc: now,
      closedAtUtc: null,
      timeline: [{ atUtc: now, action: "created", actorUserId: actor.id }],
      journalEntryId: null,
      synthetic: true,
    };

    await this.settlements.save(settlement);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_created",
      resourceType: "settlement",
      resourceId: settlement.id,
      afterSnapshot: { status: settlement.status, tripIds: settlement.tripIds },
      correlationId,
    });
    return settlement;
  }

  async submit(actor: AuthUser, id: string, correlationId?: string): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:create");
    const settlement = await this.requireSettlement(id);
    assertScope(actor.scope, { countryId: settlement.countryId });
    settlementStateMachine.assertTransition(settlement.status, "under_review");
    const now = new Date().toISOString();
    const corr = correlationId ?? createCorrelationId();
    const next: Settlement = {
      ...settlement,
      status: "under_review",
      submittedByUserId: actor.id,
      updatedAtUtc: now,
      correlationId: corr,
      timeline: [...settlement.timeline, { atUtc: now, action: "submitted", actorUserId: actor.id }],
    };
    await this.settlements.save(next);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_submitted",
      resourceType: "settlement",
      resourceId: id,
      beforeSnapshot: { status: settlement.status },
      afterSnapshot: { status: next.status },
      correlationId: corr,
    });
    return next;
  }

  async approve(
    actor: AuthUser,
    id: string,
    opts?: { correlationId?: string; idempotencyKey?: string },
  ): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:approve");
    const settlement = await this.requireSettlement(id);
    assertScope(actor.scope, { countryId: settlement.countryId });

    if (opts?.idempotencyKey) {
      // Idempotent approve: if already approved with same key marker in timeline, return
      if (
        settlement.status === "approved" &&
        settlement.timeline.some((t) => t.note === `idem:${opts.idempotencyKey}`)
      ) {
        return settlement;
      }
    }

    if (settlement.createdByUserId === actor.id) {
      throw new SettlementBusinessError(
        "SELF_APPROVAL_FORBIDDEN",
        "Creator cannot approve their own settlement",
      );
    }

    settlementStateMachine.assertTransition(settlement.status, "approved");
    const now = new Date().toISOString();
    const corr = opts?.correlationId ?? createCorrelationId();
    const next: Settlement = {
      ...settlement,
      status: "approved",
      approvedByUserId: actor.id,
      updatedAtUtc: now,
      correlationId: corr,
      timeline: [
        ...settlement.timeline,
        {
          atUtc: now,
          action: "approved",
          actorUserId: actor.id,
          note: opts?.idempotencyKey ? `idem:${opts.idempotencyKey}` : undefined,
        },
      ],
    };
    await this.settlements.save(next);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_approved",
      resourceType: "settlement",
      resourceId: id,
      beforeSnapshot: { status: settlement.status },
      afterSnapshot: { status: next.status },
      correlationId: corr,
    });
    return next;
  }

  async reject(
    actor: AuthUser,
    id: string,
    reason: string,
    correlationId?: string,
  ): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:approve");
    const settlement = await this.requireSettlement(id);
    assertScope(actor.scope, { countryId: settlement.countryId });
    settlementStateMachine.assertTransition(settlement.status, "rejected");
    const now = new Date().toISOString();
    const corr = correlationId ?? createCorrelationId();
    const next: Settlement = {
      ...settlement,
      status: "rejected",
      rejectedByUserId: actor.id,
      rejectionReason: reason,
      updatedAtUtc: now,
      correlationId: corr,
      timeline: [
        ...settlement.timeline,
        { atUtc: now, action: "rejected", actorUserId: actor.id, note: reason },
      ],
    };
    await this.settlements.save(next);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_rejected",
      resourceType: "settlement",
      resourceId: id,
      reason,
      beforeSnapshot: { status: settlement.status },
      afterSnapshot: { status: next.status },
      correlationId: corr,
    });
    return next;
  }

  async close(
    actor: AuthUser,
    id: string,
    opts?: { correlationId?: string; idempotencyKey?: string },
  ): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:approve");
    const settlement = await this.requireSettlement(id);
    assertScope(actor.scope, { countryId: settlement.countryId });

    if (
      opts?.idempotencyKey &&
      settlement.status === "closed" &&
      settlement.timeline.some((t) => t.note === `idem:${opts.idempotencyKey}`)
    ) {
      return settlement;
    }

    settlementStateMachine.assertTransition(settlement.status, "closed");

    for (const tripId of settlement.tripIds) {
      const closed = await this.settlements.findClosedContainingTrip(tripId);
      if (closed && closed.id !== settlement.id) {
        throw new SettlementBusinessError(
          "DUPLICATE_SETTLEMENT_TRIP",
          `Trip ${tripId} already in closed settlement ${closed.id}`,
        );
      }
    }

    const now = new Date().toISOString();
    const corr = opts?.correlationId ?? createCorrelationId();
    const entryId = `JE-${settlement.id}`;
    const payableAccount =
      settlement.partyType === "driver" ? "SYN-DRIVER-PAYABLE" : "SYN-AGENT-PAYABLE";
    const amount = Money.of(settlement.summary.driverEarningsMinor, settlement.currencyCode);
    const draftEntry: JournalEntry = {
      entryId,
      status: "draft",
      currencyCode: settlement.currencyCode,
      lines: [
        {
          lineId: `${entryId}-L1`,
          accountCode: "SYN-SETTLEMENT-CLEARING",
          side: "debit",
          amount,
          memo: "Settlement clearing",
        },
        {
          lineId: `${entryId}-L2`,
          accountCode: payableAccount,
          side: "credit",
          amount,
          memo: "Party payable",
        },
      ],
      memo: `Close ${settlement.id}`,
      correlationId: corr,
      createdAtUtc: now,
      postedAtUtc: null,
      reversedByEntryId: null,
      reversesEntryId: null,
      synthetic: true,
      productionLedger: false,
    };
    const posted = journalService.post(draftEntry, now);
    await this.ledger.save(posted);

    const next: Settlement = {
      ...settlement,
      status: "closed",
      closedByUserId: actor.id,
      closedAtUtc: now,
      updatedAtUtc: now,
      correlationId: corr,
      journalEntryId: entryId,
      timeline: [
        ...settlement.timeline,
        {
          atUtc: now,
          action: "closed",
          actorUserId: actor.id,
          note: opts?.idempotencyKey ? `idem:${opts.idempotencyKey}` : undefined,
        },
      ],
    };
    await this.settlements.save(next);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_closed",
      resourceType: "settlement",
      resourceId: id,
      beforeSnapshot: { status: settlement.status },
      afterSnapshot: { status: next.status, journalEntryId: entryId },
      correlationId: corr,
    });
    return next;
  }

  async reverse(
    actor: AuthUser,
    id: string,
    reason: string,
    opts?: { correlationId?: string; idempotencyKey?: string },
  ): Promise<Settlement> {
    assertPermission(actor.permissions, "settlements:approve");
    const settlement = await this.requireSettlement(id);
    assertScope(actor.scope, { countryId: settlement.countryId });

    if (
      opts?.idempotencyKey &&
      settlement.status === "reversed" &&
      settlement.timeline.some((t) => t.note === `idem:${opts.idempotencyKey}`)
    ) {
      return settlement;
    }

    settlementStateMachine.assertTransition(settlement.status, "reversed");
    if (!settlement.journalEntryId) {
      throw new SettlementBusinessError("MISSING_JOURNAL", "Closed settlement missing journal entry");
    }

    const original = await this.ledger.getById(settlement.journalEntryId);
    if (!original) throw new SettlementBusinessError("MISSING_JOURNAL", "Journal entry not found");

    const now = new Date().toISOString();
    const corr = opts?.correlationId ?? createCorrelationId();
    const reversal = journalService.createReversal(original, {
      entryId: `JE-REV-${settlement.id}`,
      correlationId: corr,
      createdAtUtc: now,
    });
    await this.ledger.save({
      ...original,
      reversedByEntryId: reversal.entryId,
    });
    await this.ledger.save(reversal);

    const next: Settlement = {
      ...settlement,
      status: "reversed",
      reversedByUserId: actor.id,
      reversalReason: reason,
      updatedAtUtc: now,
      correlationId: corr,
      timeline: [
        ...settlement.timeline,
        {
          atUtc: now,
          action: "reversed",
          actorUserId: actor.id,
          note: opts?.idempotencyKey ? `idem:${opts.idempotencyKey}` : reason,
        },
      ],
    };
    await this.settlements.save(next);
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "settlement_reversed",
      resourceType: "settlement",
      resourceId: id,
      reason,
      beforeSnapshot: { status: settlement.status },
      afterSnapshot: { status: next.status, reversalJournalId: reversal.entryId },
      correlationId: corr,
    });
    return next;
  }

  private async requireSettlement(id: string): Promise<Settlement> {
    const settlement = await this.settlements.getById(id);
    if (!settlement) {
      throw new SettlementBusinessError("NOT_FOUND", `Settlement ${id} not found`);
    }
    return settlement;
  }
}

export { IllegalSettlementTransitionError, AuthorizationError };
export type { EligibilityExclusion };
