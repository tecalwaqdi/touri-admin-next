/**
 * FR3 Reconciliation pilot — pure compare of FR1 snapshot ↔ FR2 Settlement V2.
 * Read/compare only (D-10). Never mutates snapshot or settlement amounts.
 * missing ≠ 0; mismatch → blockers / NO-GO; deterministic.
 */

import { buildFinanceIdempotencyKey } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  FINANCE_FR3_EXPECTED_WRITE_COUNTS,
  FINANCE_FR3_PERSISTENCE_MODE,
  FINANCE_FR3_PILOT_CLIENT_KEY,
  FINANCE_FR3_SETTLEMENT_DOC_ID,
  FINANCE_FR3_SOURCE_ORDER_ID,
  FINANCE_FR3_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import { FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import {
  FINANCE_FR2_CLAIM_LINE_ID,
  FINANCE_FR2_COUNTRY_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { isConsistentFinanceFr1PilotAppliedState } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { isConsistentFinanceFr2PilotAppliedState } from "@/application/finance/pilot/FinanceFr2PilotDocuments";

export type FinanceFr3SourceSnapshot = {
  id?: unknown;
  orderId?: unknown;
  currency?: unknown;
  countryId?: unknown;
  paymentMethod?: unknown;
  grossFareMinor?: unknown;
  eligibleRevenueMinor?: unknown;
  commissionAmountPersistedMinor?: unknown;
  driverDeductionsMinor?: unknown;
  driverNetMinor?: unknown;
  settlementDirection?: unknown;
  mutatesOrderMajors?: unknown;
  historicalReRateForbidden?: unknown;
  lifecycleCompleted?: unknown;
  agentAttributionStatus?: unknown;
  agentShareMinor?: unknown;
};

export type FinanceFr3SettlementInput = {
  id?: unknown;
  currency?: unknown;
  countryId?: unknown;
  status?: unknown;
  direction?: unknown;
  amountMinor?: unknown;
  paidConfirmedMinor?: unknown;
  sourceAccountingSnapshotId?: unknown;
  sourceOrderId?: unknown;
  claims?: unknown;
  mutatesFinanceSnapshot?: unknown;
  paymentExecutionForbidden?: unknown;
  agentSettlementCreated?: unknown;
  partyType?: unknown;
};

export type FinanceFr3ReconciliationResult = {
  persistenceMode: typeof FINANCE_FR3_PERSISTENCE_MODE;
  shadowOnly: true;
  productionWrites: 0;
  settlementId: typeof FINANCE_FR3_SETTLEMENT_DOC_ID | string;
  sourceAccountingSnapshotId: typeof FINANCE_FR3_SOURCE_SNAPSHOT_ID | string;
  sourceOrderId: typeof FINANCE_FR3_SOURCE_ORDER_ID | string;
  /** Proof fields required by FR3 pilot contract. */
  snapshotMatchesSettlement: boolean;
  currencyMatches: boolean;
  directionMatches: boolean;
  claimMatchesCommission: boolean;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  reconciliationStatus: "PASS" | "NO-GO";
  reconciliationBlockers: string[];
  sourceIntegrityPass: boolean;
  idempotencyIntegrityPass: boolean;
  /** Dimension proofs (1–12). */
  dimensions: {
    fr1GrossFareMinor: string | null;
    fr1EligibleRevenueMinor: string | null;
    fr1PlatformCommissionMinor: string | null;
    fr1DriverDeductionsMinor: string | null;
    fr1DriverNetMinor: string | null;
    fr2ClaimAmountMinor: string | null;
    fr2SettlementAmountMinor: string | null;
    settlementDirection: string | null;
    paidConfirmedMinor: string | null;
    outstandingMinor: string | null;
    currency: string | null;
    sourceSnapshotLinkage: string | null;
  };
  expected: {
    commissionMinor: "1500";
    claimMinor: "1500";
    paidConfirmedMinor: "0";
    outstandingMinor: "1500";
    direction: "DRIVER_PAYS_COMPANY";
    currency: "SAR";
  };
  expectedWrites: typeof FINANCE_FR3_EXPECTED_WRITE_COUNTS;
  idempotencyKeyPattern: string;
  rbacDenied: boolean;
};

function asMinorString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return String(v);
}

function claimAmountFromSettlement(
  settlement: FinanceFr3SettlementInput,
): string | null {
  const claims = settlement.claims;
  if (!Array.isArray(claims) || claims.length === 0) return null;
  const first = claims[0] as Record<string, unknown>;
  return asMinorString(first?.amountMinor);
}

function claimLineIdFromSettlement(
  settlement: FinanceFr3SettlementInput,
): string | null {
  const claims = settlement.claims;
  if (!Array.isArray(claims) || claims.length === 0) return null;
  const first = claims[0] as Record<string, unknown>;
  const lineId = first?.lineId;
  if (lineId === null || lineId === undefined) return null;
  return String(lineId);
}

/**
 * Deterministic FR1 ↔ FR2 reconciliation. Never invents zeros for missing values.
 */
export function reconcileFinanceFr3SnapshotToSettlement(input: {
  snapshot: FinanceFr3SourceSnapshot | null;
  settlement: FinanceFr3SettlementInput | null;
  fr1Idempotency?: Record<string, unknown> | null;
  fr2Idempotency?: Record<string, unknown> | null;
  actorUserId: string;
  actorPermissions?: FinancePermission[];
}): FinanceFr3ReconciliationResult {
  const blockers: string[] = [];
  const permissions = input.actorPermissions ?? ["finance:read"];
  const rbacDenied = !permissions.includes("finance:read");
  if (rbacDenied) blockers.push("rbac_denied:finance:read");

  const snap = input.snapshot;
  const sett = input.settlement;

  if (!snap) blockers.push("fr1_snapshot_missing");
  if (!sett) blockers.push("fr2_settlement_missing");

  const gross = asMinorString(snap?.grossFareMinor);
  const eligible = asMinorString(snap?.eligibleRevenueMinor);
  const commission = asMinorString(snap?.commissionAmountPersistedMinor);
  const deductions = asMinorString(snap?.driverDeductionsMinor);
  const driverNet = asMinorString(snap?.driverNetMinor);
  const snapCurrency = snap?.currency
    ? String(snap.currency).trim().toUpperCase()
    : null;
  const snapCountry = snap?.countryId
    ? String(snap.countryId).trim()
    : null;
  const snapDirection = snap?.settlementDirection
    ? String(snap.settlementDirection)
    : null;

  const settCurrency = sett?.currency
    ? String(sett.currency).trim().toUpperCase()
    : null;
  const settCountry = sett?.countryId
    ? String(sett.countryId).trim()
    : null;
  const settDirection = sett?.direction ? String(sett.direction) : null;
  const settAmount = asMinorString(sett?.amountMinor);
  const paidConfirmed = asMinorString(sett?.paidConfirmedMinor);
  const claimAmount = sett ? claimAmountFromSettlement(sett) : null;
  const claimLineId = sett ? claimLineIdFromSettlement(sett) : null;
  const sourceSnapId = sett?.sourceAccountingSnapshotId
    ? String(sett.sourceAccountingSnapshotId)
    : null;
  const sourceOrderId = sett?.sourceOrderId
    ? String(sett.sourceOrderId)
    : snap?.orderId
      ? String(snap.orderId)
      : null;

  // missing ≠ 0
  if (snap && gross === null) blockers.push("missing:fr1_grossFareMinor");
  if (snap && eligible === null) blockers.push("missing:fr1_eligibleRevenueMinor");
  if (snap && commission === null) {
    blockers.push("missing:fr1_commissionAmountPersistedMinor");
  }
  if (snap && deductions === null) {
    blockers.push("missing:fr1_driverDeductionsMinor");
  }
  if (snap && driverNet === null) blockers.push("missing:fr1_driverNetMinor");
  if (snap && !snapCurrency) blockers.push("missing:fr1_currency");
  if (sett && settAmount === null) blockers.push("missing:fr2_amountMinor");
  if (sett && paidConfirmed === null) {
    blockers.push("missing:fr2_paidConfirmedMinor");
  }
  if (sett && claimAmount === null) blockers.push("missing:fr2_claim_amount");
  if (sett && !settCurrency) blockers.push("missing:fr2_currency");
  if (sett && !settDirection) blockers.push("missing:fr2_direction");
  if (sett && !sourceSnapId) blockers.push("missing:fr2_sourceAccountingSnapshotId");

  // Immutable snapshot enforcement — never rewrite to pass
  if (snap && snap.mutatesOrderMajors === true) {
    blockers.push("snapshot_mutates_order_majors");
  }
  if (snap && snap.historicalReRateForbidden !== true) {
    blockers.push("historical_snapshot_not_immutable");
  }
  if (sett && sett.mutatesFinanceSnapshot === true) {
    blockers.push("settlement_mutates_finance_snapshot");
  }

  // Locked expected values for this synthetic pilot (when present)
  if (gross != null && gross !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.grossFareMinor) {
    blockers.push(`fr1_gross!=10000_got_${gross}`);
  }
  if (
    eligible != null &&
    eligible !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.eligibleRevenueMinor
  ) {
    blockers.push(`fr1_eligible!=10000_got_${eligible}`);
  }
  if (
    commission != null &&
    commission !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.commissionAmountMinor
  ) {
    blockers.push(`fr1_commission!=1500_got_${commission}`);
  }
  if (
    deductions != null &&
    deductions !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverDeductionsMinor
  ) {
    blockers.push(`fr1_deductions!=1500_got_${deductions}`);
  }
  if (
    driverNet != null &&
    driverNet !== FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverNetMinor
  ) {
    blockers.push(`fr1_driverNet!=8500_got_${driverNet}`);
  }

  // Currency
  const currencyMatches =
    snapCurrency === "SAR" &&
    settCurrency === "SAR" &&
    snapCurrency === settCurrency;
  if (snapCurrency != null && snapCurrency !== "SAR") {
    blockers.push(`fr1_currency!=SAR_got_${snapCurrency}`);
  }
  if (settCurrency != null && settCurrency !== "SAR") {
    blockers.push(`fr2_currency!=SAR_got_${settCurrency}`);
  }
  if (
    snapCurrency != null &&
    settCurrency != null &&
    snapCurrency !== settCurrency
  ) {
    blockers.push("currency_mismatch_snapshot_vs_settlement");
  }

  // Direction
  const directionMatches =
    settDirection === "DRIVER_PAYS_COMPANY" &&
    (snapDirection === null ||
      snapDirection === "" ||
      snapDirection === "DRIVER_PAYS_COMPANY");
  if (settDirection != null && settDirection !== "DRIVER_PAYS_COMPANY") {
    blockers.push(`direction!=DRIVER_PAYS_COMPANY_got_${settDirection}`);
  }
  if (
    snapDirection &&
    snapDirection !== "DRIVER_PAYS_COMPANY" &&
    settDirection === "DRIVER_PAYS_COMPANY"
  ) {
    blockers.push("direction_mismatch_snapshot_vs_settlement");
  }

  // Claim ↔ commission ↔ settlement amount
  const claimMatchesCommission =
    commission != null &&
    claimAmount != null &&
    commission === claimAmount &&
    commission === "1500" &&
    claimAmount === "1500";
  if (
    commission != null &&
    claimAmount != null &&
    commission !== claimAmount
  ) {
    blockers.push(
      `claim_commission_mismatch:commission=${commission}:claim=${claimAmount}`,
    );
  }
  if (settAmount != null && claimAmount != null && settAmount !== claimAmount) {
    blockers.push(
      `settlement_amount_claim_mismatch:amount=${settAmount}:claim=${claimAmount}`,
    );
  }
  if (
    settAmount != null &&
    settAmount !== FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.amountMinor
  ) {
    blockers.push(`fr2_amount!=1500_got_${settAmount}`);
  }
  if (claimLineId != null && claimLineId !== FINANCE_FR2_CLAIM_LINE_ID) {
    blockers.push(`claim_line_id_mismatch_got_${claimLineId}`);
  }

  // paid / outstanding — never invent paid=0 when missing (already blocked above)
  let outstanding: string | null = null;
  if (settAmount != null && paidConfirmed != null) {
    try {
      const due = BigInt(settAmount);
      const paid = BigInt(paidConfirmed);
      if (paid > due) {
        blockers.push(`paid_exceeds_claim:paid=${paidConfirmed}:claim=${settAmount}`);
      }
      outstanding = (due - paid).toString();
    } catch {
      blockers.push("outstanding_compute_failed");
    }
  }
  if (paidConfirmed != null && paidConfirmed !== "0") {
    // Current pilot expectation is unpaid draft; non-zero is a variance for this FR3.
    blockers.push(`paidConfirmed!=0_got_${paidConfirmed}`);
  }
  if (outstanding != null && outstanding !== "1500") {
    blockers.push(`outstanding!=1500_got_${outstanding}`);
  }

  // Source linkage
  const expectedSourceId = FINANCE_FR3_SOURCE_SNAPSHOT_ID;
  const snapId =
    snap?.id != null
      ? String(snap.id)
      : snap?.orderId != null
        ? String(snap.orderId)
        : null;
  if (sourceSnapId != null && sourceSnapId !== expectedSourceId) {
    blockers.push(`source_snapshot_mismatch_got_${sourceSnapId}`);
  }
  if (
    sourceSnapId != null &&
    snapId != null &&
    sourceSnapId !== snapId
  ) {
    blockers.push("source_linkage_snapshot_id_mismatch");
  }
  if (
    sourceOrderId != null &&
    sourceOrderId !== FINANCE_FR3_SOURCE_ORDER_ID
  ) {
    blockers.push(`source_order_mismatch_got_${sourceOrderId}`);
  }
  if (sett?.id != null && String(sett.id) !== FINANCE_FR3_SETTLEMENT_DOC_ID) {
    blockers.push(`settlement_id_mismatch_got_${sett.id}`);
  }

  // Cross-country isolation
  if (
    snapCountry &&
    settCountry &&
    snapCountry !== settCountry
  ) {
    blockers.push(
      `cross_country_fail_closed:snapshot=${snapCountry}:settlement=${settCountry}`,
    );
  }
  if (settCountry && settCountry !== FINANCE_FR2_COUNTRY_ID) {
    blockers.push(`settlement_country!=${FINANCE_FR2_COUNTRY_ID}`);
  }
  if (snapCountry && snapCountry !== FINANCE_FR2_COUNTRY_ID) {
    blockers.push(`snapshot_country!=${FINANCE_FR2_COUNTRY_ID}`);
  }

  // Source / idempotency integrity (when docs supplied)
  const sourceIntegrityPass =
    snap != null &&
    input.fr1Idempotency != null &&
    isConsistentFinanceFr1PilotAppliedState({
      snapshot: snap as Record<string, unknown>,
      idempotency: input.fr1Idempotency,
    });
  if (input.fr1Idempotency !== undefined && !sourceIntegrityPass) {
    blockers.push("source_integrity_fail");
  }

  const idempotencyIntegrityPass =
    sett != null &&
    input.fr2Idempotency != null &&
    isConsistentFinanceFr2PilotAppliedState({
      settlement: sett as Record<string, unknown>,
      idempotency: input.fr2Idempotency,
    });
  if (input.fr2Idempotency !== undefined && !idempotencyIntegrityPass) {
    blockers.push("idempotency_integrity_fail");
  }

  // Structural snapshot ↔ settlement match (amounts / direction / currency / source)
  const snapshotMatchesSettlement =
    !rbacDenied &&
    snap != null &&
    sett != null &&
    currencyMatches &&
    directionMatches &&
    claimMatchesCommission &&
    sourceSnapId === expectedSourceId &&
    settAmount === "1500" &&
    commission === "1500" &&
    outstanding === "1500" &&
    paidConfirmed === "0";

  const reconciliationStatus: "PASS" | "NO-GO" =
    blockers.length === 0 && snapshotMatchesSettlement ? "PASS" : "NO-GO";

  const idempotencyKeyPattern = buildFinanceIdempotencyKey({
    actorUid: input.actorUserId,
    op: "recon.run",
    resourceType: "finance_reconciliation_runs",
    resourceId: `${FINANCE_FR2_COUNTRY_ID}:SAR:${FINANCE_FR3_SETTLEMENT_DOC_ID}`,
    clientKey: FINANCE_FR3_PILOT_CLIENT_KEY,
  });

  return {
    persistenceMode: FINANCE_FR3_PERSISTENCE_MODE,
    shadowOnly: true,
    productionWrites: 0,
    settlementId: sett?.id != null ? String(sett.id) : FINANCE_FR3_SETTLEMENT_DOC_ID,
    sourceAccountingSnapshotId: sourceSnapId ?? FINANCE_FR3_SOURCE_SNAPSHOT_ID,
    sourceOrderId: sourceOrderId ?? FINANCE_FR3_SOURCE_ORDER_ID,
    snapshotMatchesSettlement,
    currencyMatches,
    directionMatches,
    claimMatchesCommission,
    paidConfirmedMinor: paidConfirmed,
    outstandingMinor: outstanding,
    reconciliationStatus,
    reconciliationBlockers: blockers,
    sourceIntegrityPass:
      input.fr1Idempotency === undefined ? true : sourceIntegrityPass,
    idempotencyIntegrityPass:
      input.fr2Idempotency === undefined ? true : idempotencyIntegrityPass,    dimensions: {
      fr1GrossFareMinor: gross,
      fr1EligibleRevenueMinor: eligible,
      fr1PlatformCommissionMinor: commission,
      fr1DriverDeductionsMinor: deductions,
      fr1DriverNetMinor: driverNet,
      fr2ClaimAmountMinor: claimAmount,
      fr2SettlementAmountMinor: settAmount,
      settlementDirection: settDirection,
      paidConfirmedMinor: paidConfirmed,
      outstandingMinor: outstanding,
      currency: settCurrency ?? snapCurrency,
      sourceSnapshotLinkage: sourceSnapId,
    },
    expected: {
      commissionMinor: "1500",
      claimMinor: "1500",
      paidConfirmedMinor: "0",
      outstandingMinor: "1500",
      direction: "DRIVER_PAYS_COMPANY",
      currency: "SAR",
    },
    expectedWrites: FINANCE_FR3_EXPECTED_WRITE_COUNTS,
    idempotencyKeyPattern,
    rbacDenied,
  };
}

/**
 * Duplicate / idempotent compare: same inputs → identical PASS/NO-GO + blockers.
 */
export function assertFinanceFr3ReconDeterministic(
  a: FinanceFr3ReconciliationResult,
  b: FinanceFr3ReconciliationResult,
): string[] {
  const denials: string[] = [];
  if (a.reconciliationStatus !== b.reconciliationStatus) {
    denials.push("status_nondeterministic");
  }
  if (
    JSON.stringify(a.reconciliationBlockers) !==
    JSON.stringify(b.reconciliationBlockers)
  ) {
    denials.push("blockers_nondeterministic");
  }
  if (a.outstandingMinor !== b.outstandingMinor) {
    denials.push("outstanding_nondeterministic");
  }
  if (a.paidConfirmedMinor !== b.paidConfirmedMinor) {
    denials.push("paid_nondeterministic");
  }
  if (a.claimMatchesCommission !== b.claimMatchesCommission) {
    denials.push("claim_match_nondeterministic");
  }
  return denials;
}
