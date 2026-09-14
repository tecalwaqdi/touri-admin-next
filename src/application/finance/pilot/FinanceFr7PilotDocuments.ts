/**
 * FR7 Reporting pilot — golden FR1→FR6 synthetic source fixtures.
 * Settled cash DRIVER_PAYS_COMPANY chain + FR6 neutral_memo adjustment.
 */

import {
  FINANCE_FR2_CLAIM_LINE_ID,
  FINANCE_FR2_COUNTRY_ID,
  FINANCE_FR2_PARTY_ID,
  FINANCE_FR2_PARTY_TYPE,
  FINANCE_FR2_PERIOD_FROM_UTC,
  FINANCE_FR2_PERIOD_TO_UTC,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import {
  FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR,
  FINANCE_FR6_ADJUSTMENT_CURRENCY,
  FINANCE_FR6_ADJUSTMENT_DIRECTION,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
  FINANCE_FR6_ADJUSTMENT_REASON,
  FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import {
  FINANCE_FR7_ADJUSTMENT_DOC_ID,
  FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
  FINANCE_FR7_PAYMENT_DOC_ID,
  FINANCE_FR7_SETTLEMENT_DOC_ID,
  FINANCE_FR7_SOURCE_ORDER_ID,
  FINANCE_FR7_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import type { FinanceReportingSourceBundle } from "@/domain/finance/reporting/FinanceReportingTypes";
import { adjustmentHasMonetaryEffect } from "@/domain/finance/reporting/FinanceAdjustmentMonetarySemantics";
import {
  requireCanonicalCountryId,
  tryCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

export const FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT = {
  direction: FINANCE_FR6_ADJUSTMENT_DIRECTION,
  amountMinorPersisted: FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR,
  monetaryEffect: adjustmentHasMonetaryEffect(FINANCE_FR6_ADJUSTMENT_DIRECTION),
  signedCompanyClaimImpactMinor: "0",
  altersGrossCommissionDriverNet: false,
  altersSettlementPaidOutstanding: false,
  reason: FINANCE_FR6_ADJUSTMENT_REASON,
} as const;

/** Offline golden source bundle matching Production FR1→FR6 synthetic chain. */
export function buildFinanceFr7GoldenSourceBundle(overrides?: {
  settlementStatus?: string;
  paidConfirmedMinor?: bigint;
  amountMinor?: bigint;
  includeFr6Adjustment?: boolean;
}): FinanceReportingSourceBundle {
  const paid = overrides?.paidConfirmedMinor ?? BigInt(1500);
  const amount = overrides?.amountMinor ?? BigInt(1500);
  const status = overrides?.settlementStatus ?? "settled";
  const includeAdj = overrides?.includeFr6Adjustment !== false;

  const bundle: FinanceReportingSourceBundle = {
    synthetic: true,
    activeAgentByCountry: {
      [FINANCE_FR2_COUNTRY_ID]: "agent_saudi_active_001",
    },
    snapshots: [
      {
        id: FINANCE_FR7_SOURCE_SNAPSHOT_ID,
        orderId: FINANCE_FR7_SOURCE_ORDER_ID,
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        paymentMethod: "cash",
        grossFareMinor: BigInt(10000),
        eligibleRevenueMinor: BigInt(10000),
        commissionAmountPersistedMinor: BigInt(1500),
        vatAmountMinor: null,
        driverDeductionsMinor: BigInt(1500),
        driverNetMinor: BigInt(8500),
        gatewayFeeMinor: null,
        driverId: FINANCE_FR2_PARTY_ID,
        agentId: null,
        agentShareMinor: null,
        agentAttributionStatus: "unknown_historical",
        lifecycleCompleted: true,
        createdAtUtc: "2026-09-13T21:00:00.000Z",
        commissionRatePercent: 15,
      },
    ],
    settlements: [
      {
        id: FINANCE_FR7_SETTLEMENT_DOC_ID,
        partyType: FINANCE_FR2_PARTY_TYPE,
        partyId: FINANCE_FR2_PARTY_ID,
        countryId: FINANCE_FR2_COUNTRY_ID,
        currency: "SAR",
        status,
        direction: "DRIVER_PAYS_COMPANY",
        amountMinor: amount,
        paidConfirmedMinor: paid,
        periodFromUtc: FINANCE_FR2_PERIOD_FROM_UTC,
        periodToUtc: FINANCE_FR2_PERIOD_TO_UTC,
        sourceAccountingSnapshotId: FINANCE_FR7_SOURCE_SNAPSHOT_ID,
        sourceOrderId: FINANCE_FR7_SOURCE_ORDER_ID,
        claims: [
          {
            lineId: FINANCE_FR2_CLAIM_LINE_ID,
            orderId: FINANCE_FR7_SOURCE_ORDER_ID,
            amountMinor: amount,
            currency: "SAR",
          },
        ],
        updatedAtUtc: "2026-09-14T00:30:00.000Z",
      },
    ],
    payments: [
      {
        id: FINANCE_FR7_PAYMENT_DOC_ID,
        settlementId: FINANCE_FR7_SETTLEMENT_DOC_ID,
        amountMinor: paid,
        currency: "SAR",
        status: paid > BigInt(0) ? "confirmed" : "pending",
        createdAtUtc: "2026-09-14T00:30:00.000Z",
      },
    ],
    adjustments: includeAdj
      ? [
          {
            id: FINANCE_FR7_ADJUSTMENT_DOC_ID,
            status: "approved",
            countryId: FINANCE_FR2_COUNTRY_ID,
            currency: FINANCE_FR6_ADJUSTMENT_CURRENCY,
            amountMinor: BigInt(FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR),
            direction: FINANCE_FR6_ADJUSTMENT_DIRECTION,
            relatedOrderId: FINANCE_FR7_SOURCE_ORDER_ID,
            relatedSettlementId: FINANCE_FR7_SETTLEMENT_DOC_ID,
            createdAtUtc: "2026-09-14T01:00:00.000Z",
            approvedAtUtc: "2026-09-14T01:00:00.000Z",
          },
        ]
      : [],
    refunds: [],
    chargebacks: [],
    payouts: [],
  };
  return bundle;
}

function canonicalizeSourceCountryId(raw: unknown, fallback: string): string {
  const candidate =
    typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
  return (
    tryCanonicalCountryId(candidate) ??
    requireCanonicalCountryId(fallback)
  );
}

export function mapProductionDocsToFr7Bundle(input: {
  snapshot: Record<string, unknown> | null;
  settlement: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  adjustment: Record<string, unknown> | null;
  /** false when loaded from Production RO adapters. */
  synthetic?: boolean;
  refunds?: Array<Record<string, unknown>>;
  chargebacks?: Array<Record<string, unknown>>;
  payouts?: Array<Record<string, unknown>>;
  activeAgentByCountry?: Record<string, string>;
}): FinanceReportingSourceBundle {
  const snap = input.snapshot;
  const sett = input.settlement;
  const pay = input.payment;
  const adj = input.adjustment;
  const synthetic = input.synthetic !== false;

  const toBig = (v: unknown): bigint | null => {
    if (v === null || v === undefined || v === "") return null;
    try {
      return BigInt(String(v));
    } catch {
      return null;
    }
  };

  const canonicalCountry = canonicalizeSourceCountryId(
    snap?.countryId ?? sett?.countryId ?? adj?.countryId,
    FINANCE_FR2_COUNTRY_ID,
  );

  const activeAgentByCountry: Record<string, string> = {};
  for (const [k, v] of Object.entries(
    input.activeAgentByCountry ?? {
      [FINANCE_FR2_COUNTRY_ID]: "agent_saudi_active_001",
    },
  )) {
    const ck = tryCanonicalCountryId(k);
    if (ck) activeAgentByCountry[ck] = v;
  }

  return {
    synthetic,
    activeAgentByCountry,
    snapshots: snap
      ? [
          {
            id: String(snap.id ?? FINANCE_FR7_SOURCE_SNAPSHOT_ID),
            orderId: String(snap.orderId ?? FINANCE_FR7_SOURCE_ORDER_ID),
            countryId: canonicalizeSourceCountryId(
              snap.countryId,
              canonicalCountry,
            ),
            currency: String(snap.currency ?? "SAR").toUpperCase(),
            paymentMethod:
              snap.paymentMethod === "card"
                ? "card"
                : snap.paymentMethod === "unknown"
                  ? "unknown"
                  : "cash",
            grossFareMinor: toBig(snap.grossFareMinor),
            eligibleRevenueMinor: toBig(snap.eligibleRevenueMinor),
            commissionAmountPersistedMinor: toBig(
              snap.commissionAmountPersistedMinor ??
                snap.companyCommissionMinor,
            ),
            vatAmountMinor: toBig(snap.vatAmountMinor),
            driverDeductionsMinor: toBig(snap.driverDeductionsMinor),
            driverNetMinor: toBig(snap.driverNetMinor),
            gatewayFeeMinor: toBig(snap.gatewayFeeMinor),
            driverId:
              typeof snap.driverId === "string" ? snap.driverId : FINANCE_FR2_PARTY_ID,
            agentId: typeof snap.agentId === "string" ? snap.agentId : null,
            agentShareMinor: toBig(snap.agentShareMinor),
            agentAttributionStatus:
              (snap.agentAttributionStatus as
                | "snapshot"
                | "unknown_historical"
                | "active_country"
                | "missing") ?? "unknown_historical",
            lifecycleCompleted: snap.lifecycleCompleted !== false,
            createdAtUtc:
              typeof snap.createdAtUtc === "string" ? snap.createdAtUtc : null,
            commissionRatePercent:
              typeof snap.commissionRatePercent === "number"
                ? snap.commissionRatePercent
                : null,
          },
        ]
      : [],
    settlements: sett
      ? [
          {
            id: String(sett.id ?? FINANCE_FR7_SETTLEMENT_DOC_ID),
            partyType: (sett.partyType as "driver" | "agent") ?? "driver",
            partyId: String(sett.partyId ?? FINANCE_FR2_PARTY_ID),
            countryId: canonicalizeSourceCountryId(
              sett.countryId,
              canonicalCountry,
            ),
            currency: String(sett.currency ?? "SAR").toUpperCase(),
            status: String(sett.status ?? "draft"),
            direction: String(sett.direction ?? "DRIVER_PAYS_COMPANY"),
            amountMinor: toBig(sett.amountMinor),
            paidConfirmedMinor: toBig(sett.paidConfirmedMinor),
            periodFromUtc:
              typeof sett.periodFromUtc === "string" ? sett.periodFromUtc : null,
            periodToUtc:
              typeof sett.periodToUtc === "string" ? sett.periodToUtc : null,
            sourceAccountingSnapshotId:
              typeof sett.sourceAccountingSnapshotId === "string"
                ? sett.sourceAccountingSnapshotId
                : FINANCE_FR7_SOURCE_SNAPSHOT_ID,
            sourceOrderId:
              typeof sett.sourceOrderId === "string"
                ? sett.sourceOrderId
                : FINANCE_FR7_SOURCE_ORDER_ID,
            claims: Array.isArray(sett.claims)
              ? (sett.claims as Array<Record<string, unknown>>).map((c) => ({
                  lineId: String(c.lineId ?? ""),
                  orderId: String(c.orderId ?? ""),
                  amountMinor: toBig(c.amountMinor),
                  currency: String(c.currency ?? "SAR"),
                }))
              : [],
            updatedAtUtc:
              typeof sett.updatedAtUtc === "string" ? sett.updatedAtUtc : null,
          },
        ]
      : [],
    payments: pay
      ? [
          {
            id: String(pay.id ?? FINANCE_FR7_PAYMENT_DOC_ID),
            settlementId: String(
              pay.settlementId ?? FINANCE_FR7_SETTLEMENT_DOC_ID,
            ),
            amountMinor: toBig(pay.amountMinor),
            currency: String(pay.currency ?? "SAR").toUpperCase(),
            status: String(pay.status ?? "pending"),
            createdAtUtc:
              typeof pay.createdAtUtc === "string" ? pay.createdAtUtc : null,
          },
        ]
      : [],
    adjustments: adj
      ? [
          {
            id: String(adj.id ?? FINANCE_FR6_ADJUSTMENT_DOC_ID),
            status: String(adj.status ?? "draft"),
            countryId: canonicalizeSourceCountryId(
              adj.countryId,
              canonicalCountry,
            ),
            currency: String(adj.currency ?? "SAR").toUpperCase(),
            amountMinor: toBig(adj.amountMinor),
            direction: String(adj.direction ?? "neutral_memo"),
            relatedOrderId:
              typeof adj.relatedOrderId === "string" ? adj.relatedOrderId : null,
            relatedSettlementId:
              typeof adj.relatedSettlementId === "string"
                ? adj.relatedSettlementId
                : null,
            createdAtUtc:
              typeof adj.createdAtUtc === "string" ? adj.createdAtUtc : null,
            approvedAtUtc:
              typeof adj.approvedAtUtc === "string" ? adj.approvedAtUtc : null,
          },
        ]
      : [],
    refunds: (input.refunds ?? []).map((r) => ({
      id: String(r.id ?? ""),
      kind: String(r.kind ?? "full"),
      relatedOrderId: String(r.relatedOrderId ?? ""),
      countryId: canonicalizeSourceCountryId(r.countryId, canonicalCountry),
      currency: String(r.currency ?? "SAR").toUpperCase(),
      amountMinor: toBig(r.amountMinor),
      status: String(r.status ?? "recorded"),
      createdAtUtc:
        typeof r.createdAtUtc === "string" ? r.createdAtUtc : null,
    })),
    chargebacks: (input.chargebacks ?? []).map((c) => ({
      id: String(c.id ?? ""),
      relatedOrderId: String(c.relatedOrderId ?? ""),
      countryId: canonicalizeSourceCountryId(c.countryId, canonicalCountry),
      currency: String(c.currency ?? "SAR").toUpperCase(),
      amountMinor: toBig(c.amountMinor),
      feeAmountMinor: toBig(c.feeAmountMinor),
      status: String(c.status ?? "recorded"),
      createdAtUtc:
        typeof c.createdAtUtc === "string" ? c.createdAtUtc : null,
    })),
    payouts: (input.payouts ?? []).map((p) => ({
      id: String(p.id ?? ""),
      settlementId:
        typeof p.settlementId === "string" ? p.settlementId : null,
      countryId: canonicalizeSourceCountryId(p.countryId, canonicalCountry),
      currency: String(p.currency ?? "SAR").toUpperCase(),
      amountMinor: toBig(p.amountMinor),
      status: String(p.status ?? "prepared"),
      createdAtUtc:
        typeof p.createdAtUtc === "string" ? p.createdAtUtc : null,
    })),
  };
}

export const FINANCE_FR7_LOCKED_GOLDEN_EXPECTATIONS = {
  ...FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS,
  fr6Adjustment: FINANCE_FR7_LOCKED_ADJUSTMENT_IMPACT,
  responsibleParty: FINANCE_FR6_ADJUSTMENT_RESPONSIBLE_PARTY,
} as const;
