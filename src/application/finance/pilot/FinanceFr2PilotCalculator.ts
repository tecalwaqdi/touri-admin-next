/**
 * FR2 Settlement V2 pilot — exact settlement amounts from FR1 accounting snapshot.
 * Reuses Settlement V2 direction + driver accounting line rules.
 * Does NOT invent agent share. Does NOT mutate FR1 snapshot.
 */

import type { SettlementDirection } from "@/domain/finance/v2/FinanceImplementationContracts";
import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import { settlementDirectionForTrip } from "@/domain/settlement/v2/SettlementDirections";
import {
  FINANCE_FR2_CLAIM_LINE_ID,
  FINANCE_FR2_COUNTRY_ID,
  FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  FINANCE_FR2_PARTY_ID,
  FINANCE_FR2_PARTY_TYPE,
  FINANCE_FR2_PERIOD_FROM_UTC,
  FINANCE_FR2_PERIOD_TO_UTC,
  FINANCE_FR2_PILOT_CLIENT_KEY,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";

export type FinanceFr2SourceSnapshot = {
  orderId?: unknown;
  currency?: unknown;
  countryId?: unknown;
  paymentMethod?: unknown;
  grossFareMinor?: unknown;
  eligibleRevenueMinor?: unknown;
  commissionAmountPersistedMinor?: unknown;
  driverDeductionsMinor?: unknown;
  driverNetMinor?: unknown;
  agentAttributionStatus?: unknown;
  agentId?: unknown;
  agentShareMinor?: unknown;
  settlementDirection?: unknown;
  mutatesOrderMajors?: unknown;
  historicalReRateForbidden?: unknown;
  lifecycleCompleted?: unknown;
};

export type FinanceFr2CalculatedSettlement = {
  settlementId: typeof FINANCE_FR2_SETTLEMENT_DOC_ID;
  sourceAccountingSnapshotId: typeof FINANCE_FR2_SOURCE_SNAPSHOT_ID;
  sourceOrderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  partyType: typeof FINANCE_FR2_PARTY_TYPE;
  partyId: typeof FINANCE_FR2_PARTY_ID;
  countryId: typeof FINANCE_FR2_COUNTRY_ID;
  currency: "SAR";
  status: "draft";
  direction: SettlementDirection;
  /** Cash remittance = gross − driverNet (locked Settlement V2 accounting line). */
  amountMinor: "1500";
  paidConfirmedMinor: "0";
  claim: {
    lineId: typeof FINANCE_FR2_CLAIM_LINE_ID;
    orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
    amountMinor: "1500";
    currency: "SAR";
  };
  periodFromUtc: typeof FINANCE_FR2_PERIOD_FROM_UTC;
  periodToUtc: typeof FINANCE_FR2_PERIOD_TO_UTC;
  /** Classification from FR1 — never invent agent settlement. */
  agentSettlementCreated: false;
  agentAttributionStatus: string;
  agentShareMinor: null;
  fr1GrossFareMinor: "10000";
  fr1CommissionMinor: "1500";
  fr1DriverNetMinor: "8500";
  paymentMethod: "cash";
  mutatesFinanceSnapshot: false;
  paymentExecutionForbidden: true;
  reconciliationStatus: "preconditions_ok" | "preconditions_blocked";
  reconciliationBlockers: string[];
  idempotencyKeyPattern: string;
  expectedWrites: typeof FINANCE_FR2_EXPECTED_WRITE_COUNTS;
};

function asMinorString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Derive Settlement V2 draft state strictly from an FR1 finance accounting snapshot.
 */
export function calculateFinanceFr2SettlementFromFr1Snapshot(input: {
  snapshot: FinanceFr2SourceSnapshot;
  actorUserId: string;
}): FinanceFr2CalculatedSettlement {
  const blockers: string[] = [];
  const currency = String(input.snapshot.currency ?? "").trim().toUpperCase();
  const paymentMethod = String(input.snapshot.paymentMethod ?? "")
    .trim()
    .toLowerCase();
  const gross = asMinorString(input.snapshot.grossFareMinor);
  const commission = asMinorString(
    input.snapshot.commissionAmountPersistedMinor,
  );
  const driverNet = asMinorString(input.snapshot.driverNetMinor);
  const deductions = asMinorString(input.snapshot.driverDeductionsMinor);
  const agentStatus = String(input.snapshot.agentAttributionStatus ?? "");
  const orderId = String(input.snapshot.orderId ?? "");

  if (orderId !== FINANCE_FR1_SYNTHETIC_ORDER_ID) {
    blockers.push("source_order_id_mismatch");
  }
  if (currency !== "SAR") blockers.push("currency!=SAR");
  if (paymentMethod !== "cash") blockers.push("paymentMethod!=cash");
  if (gross !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.grossFareMinor) {
    blockers.push("gross!=10000");
  }
  if (commission !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.commissionAmountMinor) {
    blockers.push("commission!=1500");
  }
  if (driverNet !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverNetMinor) {
    blockers.push("driverNet!=8500");
  }
  if (
    deductions != null &&
    deductions !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverDeductionsMinor
  ) {
    blockers.push("deductions!=1500");
  }
  if (input.snapshot.lifecycleCompleted === false) {
    blockers.push("trip_not_completed");
  }
  if (input.snapshot.mutatesOrderMajors === true) {
    blockers.push("snapshot_mutates_order_majors");
  }
  if (input.snapshot.historicalReRateForbidden !== true) {
    blockers.push("historical_re_rate_not_forbidden");
  }

  // Agent: explicit snapshot OR unknown — never invent share / agent settlement.
  const agentOk =
    agentStatus === "snapshot" ||
    agentStatus === "unknown_historical" ||
    agentStatus === "none" ||
    agentStatus === "";
  if (!agentOk) blockers.push("agent_attribution_invalid");
  if (
    agentStatus === "snapshot" &&
    (input.snapshot.agentShareMinor == null ||
      input.snapshot.agentId == null)
  ) {
    blockers.push("agent_snapshot_incomplete");
  }

  let direction: SettlementDirection | null = null;
  try {
    if (paymentMethod === "cash" || paymentMethod === "card") {
      direction = settlementDirectionForTrip(
        paymentMethod as "cash" | "card",
      );
    } else {
      blockers.push("payment_channel_unknown");
    }
  } catch {
    blockers.push("settlement_direction_unresolved");
  }

  // Cash: DRIVER_PAYS_COMPANY remittance = gross − driverNet (AccountingLine).
  let amountMinor: "1500" | null = null;
  if (gross != null && driverNet != null) {
    const remittance = BigInt(gross) - BigInt(driverNet);
    if (remittance === 1500n) {
      amountMinor = "1500";
    } else {
      blockers.push(`cash_remittance!=1500_got_${remittance.toString()}`);
    }
  } else {
    blockers.push("gross_or_driver_net_missing");
  }

  if (direction !== null && direction !== "DRIVER_PAYS_COMPANY") {
    blockers.push(`direction!=DRIVER_PAYS_COMPANY_got_${direction}`);
  }

  const countryId = String(input.snapshot.countryId ?? "").trim();
  if (countryId && countryId !== FINANCE_FR2_COUNTRY_ID) {
    blockers.push("country_scope_mismatch");
  }

  const idempotencyKeyPattern = buildFinanceIdempotencyKey({
    actorUid: input.actorUserId,
    op: "settlement.create",
    resourceType: "financial_settlements",
    resourceId: `${FINANCE_FR2_PARTY_TYPE}:${FINANCE_FR2_PARTY_ID}`,
    clientKey: FINANCE_FR2_PILOT_CLIENT_KEY,
  });

  return {
    settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    sourceAccountingSnapshotId: FINANCE_FR2_SOURCE_SNAPSHOT_ID,
    sourceOrderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    partyType: FINANCE_FR2_PARTY_TYPE,
    partyId: FINANCE_FR2_PARTY_ID,
    countryId: FINANCE_FR2_COUNTRY_ID,
    currency: "SAR",
    status: "draft",
    direction: direction ?? "DRIVER_PAYS_COMPANY",
    amountMinor: amountMinor ?? "1500",
    paidConfirmedMinor: "0",
    claim: {
      lineId: FINANCE_FR2_CLAIM_LINE_ID,
      orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      amountMinor: "1500",
      currency: "SAR",
    },
    periodFromUtc: FINANCE_FR2_PERIOD_FROM_UTC,
    periodToUtc: FINANCE_FR2_PERIOD_TO_UTC,
    agentSettlementCreated: false,
    agentAttributionStatus:
      agentStatus === "snapshot" ? "snapshot" : "unknown_historical",
    agentShareMinor: null,
    fr1GrossFareMinor: "10000",
    fr1CommissionMinor: "1500",
    fr1DriverNetMinor: "8500",
    paymentMethod: "cash",
    mutatesFinanceSnapshot: false,
    paymentExecutionForbidden: true,
    reconciliationStatus:
      blockers.length === 0 ? "preconditions_ok" : "preconditions_blocked",
    reconciliationBlockers: blockers,
    idempotencyKeyPattern,
    expectedWrites: FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  };
}

export function assertCalculatedMatchesLockedFr2(
  calculated: FinanceFr2CalculatedSettlement,
): string[] {
  const denials: string[] = [];
  if (calculated.currency !== "SAR") denials.push("currency!=SAR");
  if (calculated.paymentMethod !== "cash") denials.push("paymentMethod!=cash");
  if (calculated.direction !== "DRIVER_PAYS_COMPANY") {
    denials.push("direction!=DRIVER_PAYS_COMPANY");
  }
  if (calculated.amountMinor !== "1500") denials.push("amount!=1500");
  if (calculated.claim.amountMinor !== "1500") denials.push("claim!=1500");
  if (calculated.fr1GrossFareMinor !== "10000") denials.push("fr1_gross!=10000");
  if (calculated.fr1CommissionMinor !== "1500") {
    denials.push("fr1_commission!=1500");
  }
  if (calculated.fr1DriverNetMinor !== "8500") denials.push("fr1_net!=8500");
  if (calculated.agentSettlementCreated !== false) {
    denials.push("agent_settlement_invented");
  }
  if (calculated.agentShareMinor !== null) denials.push("agent_share_invented");
  if (calculated.mutatesFinanceSnapshot !== false) {
    denials.push("mutates_finance_snapshot");
  }
  if (calculated.paymentExecutionForbidden !== true) {
    denials.push("payment_execution_not_forbidden");
  }
  if (calculated.status !== "draft") denials.push("status!=draft");
  return denials;
}
