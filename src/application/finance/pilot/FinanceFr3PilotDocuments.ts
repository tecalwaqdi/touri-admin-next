/**
 * FR3 Reconciliation pilot — locked fixtures / expectations.
 * Read-only; never mutates FR1 snapshot or FR2 settlement amounts.
 */

import {
  FINANCE_FR3_SETTLEMENT_DOC_ID,
  FINANCE_FR3_SOURCE_ORDER_ID,
  FINANCE_FR3_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import {
  FINANCE_FR2_CLAIM_LINE_ID,
  FINANCE_FR2_COUNTRY_ID,
  FINANCE_FR2_PARTY_ID,
  FINANCE_FR2_PARTY_TYPE,
  FINANCE_FR2_PERIOD_FROM_UTC,
  FINANCE_FR2_PERIOD_TO_UTC,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import type {
  FinanceFr3SettlementInput,
  FinanceFr3SourceSnapshot,
} from "@/application/finance/pilot/FinanceFr3PilotCalculator";

/** Locked FR1 snapshot shape for offline FR3 recon (PASS case). */
export const FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE: FinanceFr3SourceSnapshot &
  Record<string, unknown> = {
  id: FINANCE_FR3_SOURCE_SNAPSHOT_ID,
  orderId: FINANCE_FR3_SOURCE_ORDER_ID,
  currency: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.currency,
  countryId: FINANCE_FR2_COUNTRY_ID,
  paymentMethod: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.paymentMethod,
  grossFareMinor: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.grossFareMinor,
  eligibleRevenueMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.eligibleRevenueMinor,
  commissionAmountPersistedMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.commissionAmountMinor,
  driverDeductionsMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverDeductionsMinor,
  driverNetMinor: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverNetMinor,
  settlementDirection: "DRIVER_PAYS_COMPANY",
  mutatesOrderMajors: false,
  historicalReRateForbidden: true,
  lifecycleCompleted: true,
  agentAttributionStatus: "unknown_historical",
  agentShareMinor: null,
  commissionRatePercent: 15,
};

/** Locked FR2 Settlement V2 draft shape for offline FR3 recon (PASS case). */
export const FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE: FinanceFr3SettlementInput &
  Record<string, unknown> = {
  id: FINANCE_FR3_SETTLEMENT_DOC_ID,
  partyType: FINANCE_FR2_PARTY_TYPE,
  partyId: FINANCE_FR2_PARTY_ID,
  countryId: FINANCE_FR2_COUNTRY_ID,
  currency: "SAR",
  status: "draft",
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: 1500,
  paidConfirmedMinor: 0,
  periodFromUtc: FINANCE_FR2_PERIOD_FROM_UTC,
  periodToUtc: FINANCE_FR2_PERIOD_TO_UTC,
  claims: [
    {
      lineId: FINANCE_FR2_CLAIM_LINE_ID,
      orderId: FINANCE_FR3_SOURCE_ORDER_ID,
      amountMinor: 1500,
      currency: "SAR",
    },
  ],
  sourceAccountingSnapshotId: FINANCE_FR3_SOURCE_SNAPSHOT_ID,
  sourceOrderId: FINANCE_FR3_SOURCE_ORDER_ID,
  mutatesFinanceSnapshot: false,
  paymentExecutionForbidden: true,
  agentSettlementCreated: false,
};

/** Exact expected proof result for the current synthetic FR1↔FR2 pair. */
export const FINANCE_FR3_LOCKED_RECON_EXPECTATIONS = {
  persistenceMode: "read_only_shadow" as const,
  shadowOnly: true as const,
  productionWrites: 0 as const,
  settlementId: FINANCE_FR3_SETTLEMENT_DOC_ID,
  sourceAccountingSnapshotId: FINANCE_FR3_SOURCE_SNAPSHOT_ID,
  snapshotMatchesSettlement: true,
  currencyMatches: true,
  directionMatches: true,
  claimMatchesCommission: true,
  paidConfirmedMinor: "0",
  outstandingMinor: "1500",
  reconciliationStatus: "PASS" as const,
  reconciliationBlockers: [] as string[],
  sourceIntegrityPass: true,
  idempotencyIntegrityPass: true,
  fr1CommissionMinor: "1500",
  fr2ClaimMinor: "1500",
  direction: "DRIVER_PAYS_COMPANY",
  currency: "SAR",
  fr1Locked: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS,
  fr2Locked: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS,
} as const;
