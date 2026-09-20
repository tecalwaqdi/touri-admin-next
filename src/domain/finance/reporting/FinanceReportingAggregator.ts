/**
 * FR7 — Pure Finance reporting aggregator.
 * Sources ONLY: snapshots, settlements, payments, adj/reversals,
 * refund/chargeback accounting, payout lifecycle.
 * No UI calc of commission; historical persisted amounts win;
 * missing ≠ 0; currencies never FX-merged.
 */

import {
  adjustmentHasMonetaryEffect,
  signedCompanyClaimImpactMinor,
} from "@/domain/finance/reporting/FinanceAdjustmentMonetarySemantics";
import type {
  AgentFinanceMetrics,
  AgentFinanceSummary,
  CompanyFinanceMetrics,
  CorrectionVisibilityItem,
  CountryFinanceSummary,
  DriverFinanceMetrics,
  DriverFinanceSummary,
  FinanceDashboardSummary,
  FinanceReportingDimensionFilters,
  FinanceReportingMeta,
  FinanceReportingSourceBundle,
  ReconciliationIndicatorReadModel,
  ReportMoney,
  ReportingAdjustmentSource,
  ReportingSettlementSource,
  ReportingSnapshotSource,
  SettlementDetailReadModel,
  SettlementListItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { financeRecordToken } from "@/domain/finance/shadow/financeShadowPii";

function money(
  amount: bigint | null | undefined,
  currency: string | null | undefined,
  reasons: string[] = [],
): ReportMoney {
  if (amount === null || amount === undefined) {
    return {
      amountMinor: null,
      currency: currency ? currency.toUpperCase() : null,
      availability: reasons.includes("not_represented")
        ? "not_represented"
        : reasons.includes("policy_blocked")
          ? "policy_blocked"
          : reasons.includes("unknown")
            ? "unknown"
            : "missing",
      incompleteReasons: reasons.length ? reasons : ["missing_value"],
    };
  }
  if (!currency || !String(currency).trim()) {
    return {
      amountMinor: amount.toString(),
      currency: null,
      availability: "incomplete",
      incompleteReasons: ["currency_required", ...reasons],
    };
  }
  return {
    amountMinor: amount.toString(),
    currency: currency.toUpperCase(),
    availability: "available",
    incompleteReasons: reasons,
  };
}

function addNullable(
  a: bigint | null,
  b: bigint | null,
): bigint | null {
  if (a === null || b === null) return null;
  return a + b;
}

function inPeriod(
  at: string | null | undefined,
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  if (!from && !to) return true;
  if (!at) return false;
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

function filterSnapshots(
  snaps: ReportingSnapshotSource[],
  f: FinanceReportingDimensionFilters,
): ReportingSnapshotSource[] {
  return snaps.filter((s) => {
    if (f.countryId && s.countryId !== f.countryId) return false;
    if (f.agentId && s.agentId !== f.agentId) return false;
    if (f.driverId && s.driverId !== f.driverId) return false;
    if (f.currency && s.currency.toUpperCase() !== f.currency.toUpperCase()) {
      return false;
    }
    if (f.paymentMethod && s.paymentMethod !== f.paymentMethod) return false;
    if (!inPeriod(s.createdAtUtc, f.periodFromUtc, f.periodToUtc)) return false;
    return true;
  });
}

function filterSettlements(
  rows: ReportingSettlementSource[],
  f: FinanceReportingDimensionFilters,
): ReportingSettlementSource[] {
  return rows.filter((s) => {
    if (f.countryId && s.countryId !== f.countryId) return false;
    if (f.currency && s.currency.toUpperCase() !== f.currency.toUpperCase()) {
      return false;
    }
    if (f.settlementStatus && s.status !== f.settlementStatus) return false;
    if (f.settlementDirection && s.direction !== f.settlementDirection) {
      return false;
    }
    if (f.driverId && s.partyType === "driver" && s.partyId !== f.driverId) {
      return false;
    }
    if (f.agentId && s.partyType === "agent" && s.partyId !== f.agentId) {
      return false;
    }
    const periodAnchor = s.periodFromUtc ?? s.updatedAtUtc;
    if (!inPeriod(periodAnchor, f.periodFromUtc, f.periodToUtc)) return false;
    return true;
  });
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function sumField(
  rows: Array<bigint | null>,
): { sum: bigint | null; incomplete: string[] } {
  let sum: bigint | null = BigInt(0);
  const incomplete: string[] = [];
  for (const v of rows) {
    if (v === null) {
      sum = null;
      incomplete.push("missing_component");
      break;
    }
    sum = (sum ?? BigInt(0)) + v;
  }
  return { sum, incomplete };
}

function buildCompanyMetrics(input: {
  currency: string | null;
  snapshots: ReportingSnapshotSource[];
  settlements: ReportingSettlementSource[];
  adjustments: ReportingAdjustmentSource[];
  refunds: Array<{ amountMinor: bigint | null; status: string; currency: string }>;
  chargebacks: Array<{
    amountMinor: bigint | null;
    feeAmountMinor: bigint | null;
    status: string;
    currency: string;
  }>;
  payments: Array<{ amountMinor: bigint | null; status: string; currency: string }>;
}): CompanyFinanceMetrics {
  const c = input.currency;
  const snaps = input.snapshots.filter((s) => !c || s.currency === c);
  const setts = input.settlements.filter((s) => !c || s.currency === c);

  // Empty scope: do not invent SAR 0.00 — missing ≠ 0.
  if (snaps.length === 0 && setts.length === 0) {
    const empty = (reason: string) => money(null, c, [reason]);
    return {
      grossBookingValue: empty("no_snapshots_in_scope"),
      eligibleRevenue: empty("no_snapshots_in_scope"),
      platformCommission: empty("no_snapshots_in_scope"),
      companyAllocation: empty("no_snapshots_in_scope"),
      vatTax: empty("no_snapshots_in_scope"),
      gatewayFees: empty("no_snapshots_in_scope"),
      refunds: empty("no_snapshots_in_scope"),
      chargebacks: empty("no_snapshots_in_scope"),
      adjustmentsMonetary: empty("no_snapshots_in_scope"),
      reversals: empty("no_snapshots_in_scope"),
      collectedCash: empty("no_snapshots_in_scope"),
      electronicCardReceipts: empty("no_snapshots_in_scope"),
      receivables: empty("no_settlements_in_scope"),
      payables: empty("no_settlements_in_scope"),
      settled: empty("no_settlements_in_scope"),
      outstanding: empty("no_settlements_in_scope"),
      disputedSuspense: empty("no_snapshots_in_scope"),
      netRecognizedPosition: empty("no_snapshots_in_scope"),
    };
  }

  const gross = sumField(snaps.map((s) => s.grossFareMinor));
  const eligible = sumField(snaps.map((s) => s.eligibleRevenueMinor));
  const commission = sumField(snaps.map((s) => s.commissionAmountPersistedMinor));
  const vat = sumField(snaps.map((s) => s.vatAmountMinor));
  const gateway = sumField(snaps.map((s) => s.gatewayFeeMinor));

  let cash: bigint | null = BigInt(0);
  let card: bigint | null = BigInt(0);
  for (const s of snaps) {
    if (s.paymentMethod === "cash") {
      if (s.grossFareMinor == null) cash = null;
      else if (cash != null) cash += s.grossFareMinor;
    } else if (s.paymentMethod === "card") {
      if (s.grossFareMinor == null) card = null;
      else if (card != null) card += s.grossFareMinor;
    }
  }

  let adjMonetary: bigint | null = BigInt(0);
  for (const a of input.adjustments) {
    if (c && a.currency !== c) continue;
    const impact = signedCompanyClaimImpactMinor({
      direction: a.direction,
      amountMinor: a.amountMinor,
      status: a.status,
    });
    if (impact === null) {
      adjMonetary = null;
      break;
    }
    if (adjMonetary != null) adjMonetary += impact;
  }

  let refundsSum: bigint | null = BigInt(0);
  for (const r of input.refunds) {
    if (c && r.currency !== c) continue;
    if (r.status === "reversed") continue;
    if (r.amountMinor == null) {
      refundsSum = null;
      break;
    }
    if (refundsSum != null) refundsSum += r.amountMinor;
  }

  let chargebacksSum: bigint | null = BigInt(0);
  let disputed: bigint | null = BigInt(0);
  for (const cb of input.chargebacks) {
    if (c && cb.currency !== c) continue;
    if (cb.status === "disputed_suspense") {
      if (cb.amountMinor == null) disputed = null;
      else if (disputed != null) disputed += cb.amountMinor;
      continue;
    }
    if (cb.status === "reversed") continue;
    if (cb.amountMinor == null) {
      chargebacksSum = null;
      break;
    }
    if (chargebacksSum != null) chargebacksSum += cb.amountMinor;
  }

  let settled: bigint | null = BigInt(0);
  let outstanding: bigint | null = BigInt(0);
  let receivables: bigint | null = BigInt(0);
  let payables: bigint | null = BigInt(0);
  for (const s of setts) {
    if (s.amountMinor == null || s.paidConfirmedMinor == null) {
      settled = null;
      outstanding = null;
      receivables = null;
      payables = null;
      break;
    }
    const out = s.amountMinor - s.paidConfirmedMinor;
    if (s.status === "settled") {
      if (settled != null) settled += s.paidConfirmedMinor;
    } else if (settled != null) {
      settled += s.paidConfirmedMinor;
    }
    if (outstanding != null) outstanding += out;
    const inbound =
      s.direction === "DRIVER_PAYS_COMPANY" ||
      s.direction === "AGENT_PAYS_COMPANY";
    if (inbound) {
      if (receivables != null) receivables += out;
    } else if (payables != null) {
      payables += out;
    }
  }

  // Reversals = confirmed payments later reversed (payment status).
  let reversals: bigint | null = BigInt(0);
  for (const p of input.payments) {
    if (c && p.currency !== c) continue;
    if (p.status !== "reversed") continue;
    if (p.amountMinor == null) {
      reversals = null;
      break;
    }
    if (reversals != null) reversals += p.amountMinor;
  }

  const gatewayForNet =
    snaps.length > 0 && snaps.every((s) => s.gatewayFeeMinor == null)
      ? BigInt(0)
      : gateway.sum === null
        ? null
        : -gateway.sum;

  const companyAllocation = commission.sum;
  const net = addNullable(
    addNullable(commission.sum, adjMonetary),
    addNullable(
      addNullable(
        refundsSum === null ? null : -refundsSum,
        chargebacksSum === null ? null : -chargebacksSum,
      ),
      gatewayForNet,
    ),
  );

  return {
    grossBookingValue: money(gross.sum, c, gross.incomplete),
    eligibleRevenue: money(eligible.sum, c, eligible.incomplete),
    platformCommission: money(commission.sum, c, commission.incomplete),
    companyAllocation: money(companyAllocation, c, commission.incomplete),
    vatTax: money(vat.sum, c, vat.incomplete.length ? vat.incomplete : snaps.some((s) => s.vatAmountMinor == null) ? ["vat_missing"] : []),
    gatewayFees: money(
      gateway.sum,
      c,
      snaps.every((s) => s.gatewayFeeMinor == null)
        ? ["gateway_fee_not_represented"]
        : gateway.incomplete,
    ),
    refunds: money(refundsSum, c, refundsSum === null ? ["refund_amount_missing"] : []),
    chargebacks: money(
      chargebacksSum,
      c,
      chargebacksSum === null ? ["chargeback_amount_missing"] : [],
    ),
    adjustmentsMonetary: money(
      adjMonetary,
      c,
      adjMonetary === null ? ["adjustment_impact_unknown"] : [],
    ),
    reversals: money(reversals, c, reversals === null ? ["reversal_amount_missing"] : []),
    collectedCash: money(cash, c),
    electronicCardReceipts: money(card, c),
    receivables: money(receivables, c, receivables === null ? ["settlement_amounts_missing"] : []),
    payables: money(payables, c, payables === null ? ["settlement_amounts_missing"] : []),
    settled: money(settled, c, settled === null ? ["settlement_amounts_missing"] : []),
    outstanding: money(
      outstanding,
      c,
      outstanding === null ? ["settlement_amounts_missing"] : [],
    ),
    disputedSuspense: money(
      disputed,
      c,
      disputed === null ? ["disputed_amount_missing"] : [],
    ),
    netRecognizedPosition: money(
      net,
      c,
      net === null ? ["net_position_incomplete"] : [],
    ),
  };
}

function buildDriverMetrics(input: {
  currency: string | null;
  snapshots: ReportingSnapshotSource[];
  settlements: ReportingSettlementSource[];
  adjustments: ReportingAdjustmentSource[];
}): DriverFinanceMetrics {
  const c = input.currency;
  const snaps = input.snapshots;
  const setts = input.settlements.filter((s) => s.partyType === "driver");

  const gross = sumField(snaps.map((s) => s.grossFareMinor));
  const deductions = sumField(snaps.map((s) => s.driverDeductionsMinor));
  const commission = sumField(snaps.map((s) => s.commissionAmountPersistedMinor));
  const vat = sumField(snaps.map((s) => s.vatAmountMinor));
  const driverNet = sumField(snaps.map((s) => s.driverNetMinor));

  let owedToCompany: bigint | null = BigInt(0);
  let owedByCompany: bigint | null = BigInt(0);
  let settledAmount: bigint | null = BigInt(0);
  let outstandingAmount: bigint | null = BigInt(0);
  for (const s of setts) {
    if (s.amountMinor == null || s.paidConfirmedMinor == null) {
      owedToCompany = null;
      owedByCompany = null;
      settledAmount = null;
      outstandingAmount = null;
      break;
    }
    const out = s.amountMinor - s.paidConfirmedMinor;
    if (s.direction === "DRIVER_PAYS_COMPANY") {
      if (owedToCompany != null) owedToCompany += out;
    } else if (s.direction === "COMPANY_PAYS_DRIVER") {
      if (owedByCompany != null) owedByCompany += out;
    }
    if (settledAmount != null) settledAmount += s.paidConfirmedMinor;
    if (outstandingAmount != null) outstandingAmount += out;
  }

  let adj: bigint | null = BigInt(0);
  for (const a of input.adjustments) {
    const impact = signedCompanyClaimImpactMinor({
      direction: a.direction,
      amountMinor: a.amountMinor,
      status: a.status,
    });
    if (impact === null) {
      adj = null;
      break;
    }
    if (adj != null) adj += impact;
  }

  const position = addNullable(driverNet.sum, adj === null ? null : -adj);

  return {
    grossEarnings: money(gross.sum, c, gross.incomplete),
    deductions: money(deductions.sum, c, deductions.incomplete),
    commission: money(commission.sum, c, commission.incomplete),
    vat: money(vat.sum, c, vat.incomplete),
    driverNet: money(driverNet.sum, c, driverNet.incomplete),
    amountOwedToCompany: money(owedToCompany, c),
    amountOwedByCompany: money(owedByCompany, c),
    settledAmount: money(settledAmount, c),
    outstandingAmount: money(outstandingAmount, c),
    adjustmentsReversals: money(adj, c, adj === null ? ["adjustment_impact_unknown"] : []),
    currentReconciledPosition: money(
      position,
      c,
      position === null ? ["position_incomplete"] : [],
    ),
  };
}

function buildAgentMetrics(input: {
  currency: string | null;
  countryId: string | null;
  snapshots: ReportingSnapshotSource[];
  settlements: ReportingSettlementSource[];
  adjustments: ReportingAdjustmentSource[];
  chargebacks: Array<{ amountMinor: bigint | null; status: string; currency: string }>;
}): AgentFinanceMetrics {
  const c = input.currency;
  const snaps = input.snapshots;
  const setts = input.settlements.filter((s) => s.partyType === "agent");

  let attribution: AgentFinanceMetrics["attributionStatus"] = "missing";
  if (snaps.some((s) => s.agentAttributionStatus === "unknown_historical")) {
    attribution = "unknown_historical";
  } else if (snaps.some((s) => s.agentAttributionStatus === "snapshot")) {
    attribution = "snapshot";
  } else if (snaps.some((s) => s.agentAttributionStatus === "active_country")) {
    attribution = "active_country";
  }

  let cash: bigint | null = BigInt(0);
  for (const s of snaps) {
    if (s.paymentMethod !== "cash") continue;
    // Card never counted as agent-collected cash (FC-03).
    if (attribution === "unknown_historical" || attribution === "missing") {
      cash = null;
      break;
    }
    if (s.grossFareMinor == null) {
      cash = null;
      break;
    }
    if (cash != null) cash += s.grossFareMinor;
  }

  const entitlementShare = sumField(snaps.map((s) => s.agentShareMinor));
  const entitlement =
    attribution === "unknown_historical" || attribution === "missing"
      ? money(null, c, ["unknown_agent_attribution"])
      : money(entitlementShare.sum, c, entitlementShare.incomplete);

  let due: bigint | null = BigInt(0);
  let paid: bigint | null = BigInt(0);
  let outstanding: bigint | null = BigInt(0);
  for (const s of setts) {
    if (s.amountMinor == null || s.paidConfirmedMinor == null) {
      due = null;
      paid = null;
      outstanding = null;
      break;
    }
    if (due != null) due += s.amountMinor;
    if (paid != null) paid += s.paidConfirmedMinor;
    if (outstanding != null) outstanding += s.amountMinor - s.paidConfirmedMinor;
  }

  let adj: bigint | null = BigInt(0);
  for (const a of input.adjustments) {
    const impact = signedCompanyClaimImpactMinor({
      direction: a.direction,
      amountMinor: a.amountMinor,
      status: a.status,
    });
    if (impact === null) {
      adj = null;
      break;
    }
    if (adj != null) adj += impact;
  }

  let disputed: bigint | null = BigInt(0);
  for (const cb of input.chargebacks) {
    if (c && cb.currency !== c) continue;
    if (cb.status !== "disputed_suspense") continue;
    if (cb.amountMinor == null) {
      disputed = null;
      break;
    }
    if (disputed != null) disputed += cb.amountMinor;
  }

  const companyAmountDue =
    attribution === "unknown_historical"
      ? money(null, c, ["unknown_agent_attribution"])
      : money(due, c);

  return {
    countryId: input.countryId,
    collectedCash:
      attribution === "unknown_historical" || attribution === "missing"
        ? money(null, c, ["unknown_agent_attribution"])
        : money(cash, c),
    companyAmountDue,
    agentEntitlement: entitlement,
    adjustments: money(adj, c),
    settlementsDue: money(due, c),
    paid: money(paid, c),
    outstanding: money(outstanding, c),
    disputed: money(disputed, c),
    attributionStatus: attribution,
  };
}

function lastUpdate(bundle: FinanceReportingSourceBundle): string | null {
  const stamps: string[] = [];
  for (const s of bundle.snapshots) if (s.createdAtUtc) stamps.push(s.createdAtUtc);
  for (const s of bundle.settlements) if (s.updatedAtUtc) stamps.push(s.updatedAtUtc);
  for (const a of bundle.adjustments) {
    if (a.approvedAtUtc) stamps.push(a.approvedAtUtc);
    else if (a.createdAtUtc) stamps.push(a.createdAtUtc);
  }
  for (const p of bundle.payments) if (p.createdAtUtc) stamps.push(p.createdAtUtc);
  if (!stamps.length) return null;
  return stamps.sort().at(-1) ?? null;
}

function buildMeta(input: {
  currency: string | null;
  filters: FinanceReportingDimensionFilters;
  incompleteReasons: string[];
  policyBlockers: string[];
  reconciliationStatus: FinanceReportingMeta["reconciliationStatus"];
  synthetic: boolean;
  lastAuthoritativeUpdateUtc: string | null;
  scope: FinanceReportingMeta["scope"];
  scopeCountryIds: string[];
  scopeAgentIds: string[];
}): FinanceReportingMeta {
  const completeness =
    input.incompleteReasons.length === 0
      ? "complete"
      : input.incompleteReasons.some((r) => r.includes("missing"))
        ? "incomplete"
        : "partial";
  return {
    currency: input.currency,
    periodFromUtc: input.filters.periodFromUtc ?? null,
    periodToUtc: input.filters.periodToUtc ?? null,
    scope: input.scope,
    scopeCountryIds: input.scopeCountryIds,
    scopeAgentIds: input.scopeAgentIds,
    sourceCompleteness: completeness,
    incompleteReasons: input.incompleteReasons,
    policyBlockers: input.policyBlockers,
    reconciliationStatus: input.reconciliationStatus,
    lastAuthoritativeUpdateUtc: input.lastAuthoritativeUpdateUtc,
    productionApproved: false,
    synthetic: input.synthetic,
    piiMasked: true,
  };
}

export function computeReconciliationIndicators(input: {
  snapshots: ReportingSnapshotSource[];
  settlements: ReportingSettlementSource[];
}): ReconciliationIndicatorReadModel {
  const blockers: string[] = [];
  if (input.snapshots.length === 0 || input.settlements.length === 0) {
    return {
      status: "UNKNOWN",
      blockers: ["missing_sources"],
      snapshotMatchesSettlement: null,
      claimMatchesCommission: null,
      outstandingConsistent: null,
      currencyGroupedOnly: true,
    };
  }

  let snapshotMatchesSettlement: boolean | null = true;
  let claimMatchesCommission: boolean | null = true;
  let outstandingConsistent: boolean | null = true;

  for (const sett of input.settlements) {
    const snap = input.snapshots.find(
      (s) =>
        s.id === sett.sourceAccountingSnapshotId ||
        s.orderId === sett.sourceOrderId,
    );
    if (!snap) {
      snapshotMatchesSettlement = false;
      blockers.push(`missing_snapshot_for_settlement:${sett.id}`);
      continue;
    }
    if (snap.currency !== sett.currency) {
      snapshotMatchesSettlement = false;
      blockers.push(`currency_mismatch:${sett.id}`);
    }
    if (
      sett.amountMinor != null &&
      snap.commissionAmountPersistedMinor != null &&
      sett.amountMinor !== snap.commissionAmountPersistedMinor &&
      sett.direction === "DRIVER_PAYS_COMPANY"
    ) {
      claimMatchesCommission = false;
      blockers.push(`claim_ne_commission:${sett.id}`);
    }
    if (sett.amountMinor != null && sett.paidConfirmedMinor != null) {
      const out = sett.amountMinor - sett.paidConfirmedMinor;
      if (sett.status === "settled" && out !== BigInt(0)) {
        outstandingConsistent = false;
        blockers.push(`settled_outstanding_nonzero:${sett.id}`);
      }
    } else {
      outstandingConsistent = null;
      blockers.push(`settlement_amounts_missing:${sett.id}`);
    }
  }

  const status =
    blockers.length === 0
      ? "PASS"
      : blockers.some((b) => b.startsWith("claim_ne") || b.startsWith("currency"))
        ? "FAIL"
        : "WARN";

  return {
    status,
    blockers,
    snapshotMatchesSettlement,
    claimMatchesCommission,
    outstandingConsistent,
    currencyGroupedOnly: true,
  };
}

export function listSettlements(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
): SettlementListItem[] {
  return filterSettlements(dedupeById(bundle.settlements), filters).map(
    (s) => ({
      id: s.id,
      partyType: s.partyType,
      partyIdToken: financeRecordToken("party", s.partyId),
      countryId: s.countryId,
      currency: s.currency,
      status: s.status,
      direction: s.direction,
      amountMinor: s.amountMinor?.toString() ?? null,
      paidConfirmedMinor: s.paidConfirmedMinor?.toString() ?? null,
      outstandingMinor:
        s.amountMinor != null && s.paidConfirmedMinor != null
          ? (s.amountMinor - s.paidConfirmedMinor).toString()
          : null,
      periodFromUtc: s.periodFromUtc,
      periodToUtc: s.periodToUtc,
      sourceSnapshotId: s.sourceAccountingSnapshotId,
    }),
  );
}

export function settlementDetail(
  bundle: FinanceReportingSourceBundle,
  settlementId: string,
): SettlementDetailReadModel | null {
  const s = bundle.settlements.find((x) => x.id === settlementId);
  if (!s) return null;
  const list = listSettlements(bundle).find((x) => x.id === settlementId)!;
  const payments = bundle.payments.filter((p) => p.settlementId === settlementId);
  const adjs = bundle.adjustments.filter(
    (a) => a.relatedSettlementId === settlementId && a.status === "approved",
  );
  return {
    ...list,
    claims: s.claims.map((c) => ({
      lineId: c.lineId,
      orderIdToken: financeRecordToken("order", c.orderId),
      amountMinor: c.amountMinor?.toString() ?? null,
      currency: c.currency,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amountMinor: p.amountMinor?.toString() ?? null,
      status: p.status,
      currency: p.currency,
      method: p.method ?? null,
      reference: p.reference ?? null,
      createdBy: p.createdBy ?? null,
      confirmedBy: p.confirmedBy ?? null,
      createdAtUtc: p.createdAtUtc ?? null,
      confirmedAtUtc: p.confirmedAtUtc ?? null,
      reversalOfPaymentId: p.reversalOfPaymentId ?? null,
    })),
    approvedAdjustments: adjs.map((a) => {
      const impact = signedCompanyClaimImpactMinor({
        direction: a.direction,
        amountMinor: a.amountMinor,
        status: a.status,
      });
      return {
        id: a.id,
        direction: String(a.direction),
        amountMinor: a.amountMinor?.toString() ?? null,
        monetaryEffect: adjustmentHasMonetaryEffect(a.direction),
        signedCompanyClaimImpactMinor: impact?.toString() ?? null,
      };
    }),
  };
}

export function listCorrections(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
): CorrectionVisibilityItem[] {
  const out: CorrectionVisibilityItem[] = [];
  for (const a of dedupeById(bundle.adjustments)) {
    if (filters.countryId && a.countryId !== filters.countryId) continue;
    out.push({
      kind: a.direction === "neutral_memo" ? "adjustment" : "adjustment",
      id: a.id,
      status: a.status,
      currency: a.currency,
      amountMinor: a.amountMinor?.toString() ?? null,
      monetaryEffect: adjustmentHasMonetaryEffect(a.direction),
      directionOrKind: String(a.direction),
      relatedOrderIdToken: a.relatedOrderId
        ? financeRecordToken("order", a.relatedOrderId)
        : null,
      relatedSettlementId: a.relatedSettlementId,
    });
  }
  for (const r of dedupeById(bundle.refunds)) {
    if (filters.countryId && r.countryId !== filters.countryId) continue;
    out.push({
      kind: "refund",
      id: r.id,
      status: r.status,
      currency: r.currency,
      amountMinor: r.amountMinor?.toString() ?? null,
      monetaryEffect: r.status === "recorded" && r.amountMinor != null,
      directionOrKind: String(r.kind),
      relatedOrderIdToken: financeRecordToken("order", r.relatedOrderId),
      relatedSettlementId: null,
    });
  }
  for (const cb of dedupeById(bundle.chargebacks)) {
    if (filters.countryId && cb.countryId !== filters.countryId) continue;
    out.push({
      kind: "chargeback",
      id: cb.id,
      status: cb.status,
      currency: cb.currency,
      amountMinor: cb.amountMinor?.toString() ?? null,
      monetaryEffect:
        cb.status !== "disputed_suspense" &&
        cb.status !== "reversed" &&
        cb.amountMinor != null,
      directionOrKind: String(cb.status),
      relatedOrderIdToken: financeRecordToken("order", cb.relatedOrderId),
      relatedSettlementId: null,
    });
  }
  return out;
}

export function assertOneActiveAgentInvariant(input: {
  countryId: string;
  activeAgentByCountry: Record<string, string>;
  snapshots: ReportingSnapshotSource[];
}): "pass" | "fail_multiple_active" | "unknown" {
  const mapped = input.activeAgentByCountry[input.countryId];
  if (!mapped) return "unknown";
  const distinctActive = new Set(
    input.snapshots
      .filter(
        (s) =>
          s.countryId === input.countryId &&
          s.agentAttributionStatus === "active_country" &&
          s.agentId,
      )
      .map((s) => s.agentId as string),
  );
  if (distinctActive.size > 1) return "fail_multiple_active";
  if (
    distinctActive.size === 1 &&
    ![...distinctActive].includes(mapped)
  ) {
    return "fail_multiple_active";
  }
  return "pass";
}

export function buildDashboardSummary(input: {
  bundle: FinanceReportingSourceBundle;
  filters?: FinanceReportingDimensionFilters;
  scope?: FinanceReportingMeta["scope"];
  scopeCountryIds?: string[];
  scopeAgentIds?: string[];
}): FinanceDashboardSummary {
  const filters = input.filters ?? {};
  const bundle = {
    ...input.bundle,
    snapshots: filterSnapshots(dedupeById(input.bundle.snapshots), filters),
    settlements: filterSettlements(dedupeById(input.bundle.settlements), filters),
    adjustments: dedupeById(input.bundle.adjustments),
    payments: dedupeById(input.bundle.payments),
    refunds: dedupeById(input.bundle.refunds),
    chargebacks: dedupeById(input.bundle.chargebacks),
  };

  const currencies = [
    ...new Set([
      ...bundle.snapshots.map((s) => s.currency),
      ...bundle.settlements.map((s) => s.currency),
    ]),
  ].sort();

  const recon = computeReconciliationIndicators({
    snapshots: bundle.snapshots,
    settlements: bundle.settlements,
  });

  const incomplete: string[] = [];
  if (bundle.snapshots.some((s) => s.grossFareMinor == null)) {
    incomplete.push("gross_fare_missing");
  }
  if (bundle.snapshots.some((s) => !s.lifecycleCompleted)) {
    incomplete.push("incomplete_trip");
  }

  const primaryCurrency =
    filters.currency?.toUpperCase() ?? currencies[0] ?? null;

  const company = buildCompanyMetrics({
    currency: primaryCurrency,
    snapshots: bundle.snapshots,
    settlements: bundle.settlements,
    adjustments: bundle.adjustments,
    refunds: bundle.refunds,
    chargebacks: bundle.chargebacks,
    payments: bundle.payments,
  });

  const byCurrency = currencies.map((currency) => ({
    currency,
    company: buildCompanyMetrics({
      currency,
      snapshots: bundle.snapshots.filter((s) => s.currency === currency),
      settlements: bundle.settlements.filter((s) => s.currency === currency),
      adjustments: bundle.adjustments.filter((a) => a.currency === currency),
      refunds: bundle.refunds.filter((r) => r.currency === currency),
      chargebacks: bundle.chargebacks.filter((c) => c.currency === currency),
      payments: bundle.payments.filter((p) => p.currency === currency),
    }),
  }));

  const incompleteTripCount = bundle.snapshots.filter(
    (s) => !s.lifecycleCompleted,
  ).length;

  return {
    meta: buildMeta({
      currency: primaryCurrency,
      filters,
      incompleteReasons: incomplete,
      policyBlockers: [],
      reconciliationStatus: recon.status,
      synthetic: input.bundle.synthetic === true,
      lastAuthoritativeUpdateUtc: lastUpdate(bundle),
      scope: input.scope ?? "global",
      scopeCountryIds: input.scopeCountryIds ?? [],
      scopeAgentIds: input.scopeAgentIds ?? [],
    }),
    company,
    settlementCount: bundle.settlements.length,
    incompleteTripCount,
    reconVarianceCount: recon.blockers.length,
    byCurrency,
  };
}

export function buildCountrySummary(input: {
  bundle: FinanceReportingSourceBundle;
  countryId: string;
  filters?: FinanceReportingDimensionFilters;
  scope?: FinanceReportingMeta["scope"];
  scopeCountryIds?: string[];
  scopeAgentIds?: string[];
}): CountryFinanceSummary {
  const filters = { ...(input.filters ?? {}), countryId: input.countryId };
  const dash = buildDashboardSummary({
    bundle: input.bundle,
    filters,
    scope: input.scope ?? "country",
    scopeCountryIds: input.scopeCountryIds ?? [input.countryId],
    scopeAgentIds: input.scopeAgentIds,
  });
  const snaps = filterSnapshots(input.bundle.snapshots, filters);
  const invariant = assertOneActiveAgentInvariant({
    countryId: input.countryId,
    activeAgentByCountry: input.bundle.activeAgentByCountry,
    snapshots: snaps,
  });
  const activeAgentId = input.bundle.activeAgentByCountry[input.countryId] ?? null;
  const agent = buildAgentMetrics({
    currency: dash.meta.currency,
    countryId: input.countryId,
    snapshots: snaps,
    settlements: filterSettlements(input.bundle.settlements, filters),
    adjustments: input.bundle.adjustments.filter(
      (a) => a.countryId === input.countryId,
    ),
    chargebacks: input.bundle.chargebacks.filter(
      (c) => c.countryId === input.countryId,
    ),
  });
  return {
    meta: dash.meta,
    countryId: input.countryId,
    activeAgentIdToken: activeAgentId
      ? financeRecordToken("agents", activeAgentId)
      : null,
    activeAgentInvariant: invariant,
    company: dash.company,
    agent,
  };
}

export function buildDriverSummary(input: {
  bundle: FinanceReportingSourceBundle;
  driverId: string;
  filters?: FinanceReportingDimensionFilters;
  scope?: FinanceReportingMeta["scope"];
  scopeCountryIds?: string[];
  scopeAgentIds?: string[];
}): DriverFinanceSummary {
  const filters = { ...(input.filters ?? {}), driverId: input.driverId };
  const snaps = filterSnapshots(input.bundle.snapshots, filters);
  const setts = filterSettlements(input.bundle.settlements, filters);
  const currency =
    filters.currency?.toUpperCase() ?? snaps[0]?.currency ?? setts[0]?.currency ?? null;
  const metrics = buildDriverMetrics({
    currency,
    snapshots: snaps,
    settlements: setts,
    adjustments: input.bundle.adjustments.filter(
      (a) =>
        !a.relatedOrderId ||
        snaps.some((s) => s.orderId === a.relatedOrderId) ||
        setts.some((s) => s.id === a.relatedSettlementId),
    ),
  });
  const recon = computeReconciliationIndicators({
    snapshots: snaps,
    settlements: setts,
  });
  return {
    meta: buildMeta({
      currency,
      filters,
      incompleteReasons: [],
      policyBlockers: [],
      reconciliationStatus: recon.status,
      synthetic: input.bundle.synthetic === true,
      lastAuthoritativeUpdateUtc: lastUpdate(input.bundle),
      scope: input.scope ?? "global",
      scopeCountryIds: input.scopeCountryIds ?? [],
      scopeAgentIds: input.scopeAgentIds ?? [],
    }),
    driverIdToken: financeRecordToken("drivers", input.driverId),
    metrics,
  };
}

export function buildAgentSummary(input: {
  bundle: FinanceReportingSourceBundle;
  agentId: string;
  countryId: string;
  filters?: FinanceReportingDimensionFilters;
  scope?: FinanceReportingMeta["scope"];
  scopeCountryIds?: string[];
  scopeAgentIds?: string[];
}): AgentFinanceSummary {
  const filters = {
    ...(input.filters ?? {}),
    agentId: input.agentId,
    countryId: input.countryId,
  };
  const snaps = filterSnapshots(input.bundle.snapshots, filters);
  const setts = filterSettlements(input.bundle.settlements, filters);
  const currency =
    filters.currency?.toUpperCase() ?? snaps[0]?.currency ?? setts[0]?.currency ?? null;
  const metrics = buildAgentMetrics({
    currency,
    countryId: input.countryId,
    snapshots: snaps,
    settlements: setts,
    adjustments: input.bundle.adjustments.filter(
      (a) => a.countryId === input.countryId,
    ),
    chargebacks: input.bundle.chargebacks.filter(
      (c) => c.countryId === input.countryId,
    ),
  });
  return {
    meta: buildMeta({
      currency,
      filters,
      incompleteReasons:
        metrics.attributionStatus === "unknown_historical"
          ? ["unknown_agent_attribution"]
          : [],
      policyBlockers: [],
      reconciliationStatus: null,
      synthetic: input.bundle.synthetic === true,
      lastAuthoritativeUpdateUtc: lastUpdate(input.bundle),
      scope: input.scope ?? "agent",
      scopeCountryIds: input.scopeCountryIds ?? [input.countryId],
      scopeAgentIds: input.scopeAgentIds ?? [input.agentId],
    }),
    agentIdToken: financeRecordToken("agents", input.agentId),
    metrics,
  };
}

/** Never re-rate historical commission from current policy percent. */
export function assertHistoricalCommissionNotRerated(input: {
  persistedCommissionMinor: bigint | null;
  grossFareMinor: bigint | null;
  currentPolicyRatePercent: number;
}): { ok: boolean; reason?: string } {
  if (input.persistedCommissionMinor == null || input.grossFareMinor == null) {
    return { ok: true };
  }
  const recomputed =
    (input.grossFareMinor * BigInt(Math.round(input.currentPolicyRatePercent * 100))) /
    BigInt(10000);
  // Reporting must use persisted; flag if caller tries to substitute recomputed.
  if (recomputed !== input.persistedCommissionMinor) {
    return {
      ok: true,
      reason: "historical_persisted_wins_ignore_recomputed",
    };
  }
  return { ok: true };
}
