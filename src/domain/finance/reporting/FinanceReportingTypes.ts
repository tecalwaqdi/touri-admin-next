/**
 * FR7 Finance reporting / read-model types.
 * Computed from canonical Finance sources only — no third book.
 * Missing/unknown → null + diagnostics; never zero-fill.
 */

import type {
  SettlementDirection,
  SettlementV2Status,
} from "@/domain/finance/v2/FinanceImplementationContracts";
import type { AdjustmentDirection } from "@/domain/finance/v2/Fr6CorrectionIntegrity";
import type { ChargebackAccountingStatus } from "@/domain/finance/v2/policies/ChargebackAccountingPolicyF6";
import type { RefundKind } from "@/domain/finance/v2/Fr6CorrectionIntegrity";

export type ReportMoneyAvailability =
  | "available"
  | "missing"
  | "unknown"
  | "not_represented"
  | "incomplete"
  | "policy_blocked";

export type ReportMoney = {
  amountMinor: string | null;
  currency: string | null;
  availability: ReportMoneyAvailability;
  incompleteReasons: string[];
};

export type FinanceReportingDimensionFilters = {
  countryId?: string | null;
  agentId?: string | null;
  driverId?: string | null;
  currency?: string | null;
  paymentMethod?: "cash" | "card" | "unknown" | null;
  settlementStatus?: SettlementV2Status | null;
  settlementDirection?: SettlementDirection | null;
  periodFromUtc?: string | null;
  periodToUtc?: string | null;
  /**
   * When false/undefined (default), QA/pilot/synthetic finance docs are
   * excluded from totals. Set true only via explicit operator toggle.
   * Does not mutate stored amounts — filters source rows before aggregation.
   */
  includePilotRecords?: boolean | null;
};

export type FinanceReportingMeta = {
  currency: string | null;
  periodFromUtc: string | null;
  periodToUtc: string | null;
  scope: "global" | "country" | "agent" | "denied";
  scopeCountryIds: string[];
  scopeAgentIds: string[];
  sourceCompleteness: "complete" | "partial" | "incomplete";
  incompleteReasons: string[];
  policyBlockers: string[];
  reconciliationStatus: "PASS" | "WARN" | "FAIL" | "UNKNOWN" | null;
  lastAuthoritativeUpdateUtc: string | null;
  productionApproved: false;
  synthetic: boolean;
  containsPilotRecords?: boolean;
  /** True when operator opted into including QA/pilot rows. */
  includePilotRecords?: boolean;
  piiMasked: true;
};

export type CompanyFinanceMetrics = {
  grossBookingValue: ReportMoney;
  eligibleRevenue: ReportMoney;
  platformCommission: ReportMoney;
  companyAllocation: ReportMoney;
  vatTax: ReportMoney;
  gatewayFees: ReportMoney;
  refunds: ReportMoney;
  chargebacks: ReportMoney;
  adjustmentsMonetary: ReportMoney;
  reversals: ReportMoney;
  collectedCash: ReportMoney;
  electronicCardReceipts: ReportMoney;
  receivables: ReportMoney;
  payables: ReportMoney;
  settled: ReportMoney;
  outstanding: ReportMoney;
  disputedSuspense: ReportMoney;
  netRecognizedPosition: ReportMoney;
};

export type DriverFinanceMetrics = {
  grossEarnings: ReportMoney;
  deductions: ReportMoney;
  commission: ReportMoney;
  vat: ReportMoney;
  driverNet: ReportMoney;
  amountOwedToCompany: ReportMoney;
  amountOwedByCompany: ReportMoney;
  settledAmount: ReportMoney;
  outstandingAmount: ReportMoney;
  adjustmentsReversals: ReportMoney;
  currentReconciledPosition: ReportMoney;
};

export type AgentFinanceMetrics = {
  countryId: string | null;
  collectedCash: ReportMoney;
  companyAmountDue: ReportMoney;
  agentEntitlement: ReportMoney;
  adjustments: ReportMoney;
  settlementsDue: ReportMoney;
  paid: ReportMoney;
  outstanding: ReportMoney;
  disputed: ReportMoney;
  attributionStatus: "snapshot" | "unknown_historical" | "active_country" | "missing";
};

export type SettlementListItem = {
  id: string;
  partyType: string;
  partyIdToken: string;
  countryId: string;
  currency: string;
  status: string;
  direction: string;
  amountMinor: string | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  periodFromUtc: string | null;
  periodToUtc: string | null;
  sourceSnapshotId: string | null;
};

export type SettlementDetailReadModel = SettlementListItem & {
  claims: Array<{
    lineId: string;
    orderIdToken: string;
    amountMinor: string | null;
    currency: string;
  }>;
  payments: Array<{
    id: string;
    amountMinor: string | null;
    status: string;
    currency: string;
    /** P1 payment UX — optional when source provides */
    method?: string | null;
    reference?: string | null;
    createdBy?: string | null;
    confirmedBy?: string | null;
    createdAtUtc?: string | null;
    confirmedAtUtc?: string | null;
    reversalOfPaymentId?: string | null;
  }>;
  approvedAdjustments: Array<{
    id: string;
    direction: string;
    amountMinor: string | null;
    monetaryEffect: boolean;
    signedCompanyClaimImpactMinor: string | null;
  }>;
};

export type ReconciliationIndicatorReadModel = {
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  blockers: string[];
  snapshotMatchesSettlement: boolean | null;
  claimMatchesCommission: boolean | null;
  outstandingConsistent: boolean | null;
  currencyGroupedOnly: true;
};

export type CorrectionVisibilityItem = {
  kind: "adjustment" | "reversal" | "refund" | "chargeback";
  id: string;
  status: string;
  currency: string | null;
  amountMinor: string | null;
  monetaryEffect: boolean;
  directionOrKind: string;
  relatedOrderIdToken: string | null;
  relatedSettlementId: string | null;
};

export type FinanceDashboardSummary = {
  meta: FinanceReportingMeta;
  company: CompanyFinanceMetrics;
  settlementCount: number;
  incompleteTripCount: number | null;
  reconVarianceCount: number | null;
  byCurrency: Array<{ currency: string; company: CompanyFinanceMetrics }>;
};

export type CountryFinanceSummary = {
  meta: FinanceReportingMeta;
  countryId: string;
  activeAgentIdToken: string | null;
  activeAgentInvariant: "pass" | "fail_multiple_active" | "unknown";
  company: CompanyFinanceMetrics;
  agent: AgentFinanceMetrics;
};

export type AgentFinanceSummary = {
  meta: FinanceReportingMeta;
  agentIdToken: string;
  metrics: AgentFinanceMetrics;
};

export type DriverFinanceSummary = {
  meta: FinanceReportingMeta;
  driverIdToken: string;
  metrics: DriverFinanceMetrics;
};

export type ReportExportSourceModel = {
  meta: FinanceReportingMeta;
  reportType:
    | "finance_dashboard"
    | "country_finance"
    | "agent_finance"
    | "driver_finance"
    | "settlement_summary"
    | "reconciliation_indicators"
    | "corrections_visibility";
  headers: string[];
  rows: string[][];
  /** Only a defined same-currency additive business total; otherwise null. */
  totalAmountMinor: string | null;
  currencyCode: string | null;
  requiresReportsExport: true;
};

/** Canonical source row shapes consumed by the aggregator (read-only). */
export type ReportingSnapshotSource = {
  id: string;
  orderId: string;
  countryId: string;
  currency: string;
  paymentMethod: "cash" | "card" | "unknown";
  grossFareMinor: bigint | null;
  eligibleRevenueMinor: bigint | null;
  commissionAmountPersistedMinor: bigint | null;
  vatAmountMinor: bigint | null;
  driverDeductionsMinor: bigint | null;
  driverNetMinor: bigint | null;
  gatewayFeeMinor: bigint | null;
  driverId: string | null;
  agentId: string | null;
  agentShareMinor: bigint | null;
  agentAttributionStatus:
    | "snapshot"
    | "unknown_historical"
    | "active_country"
    | "missing";
  lifecycleCompleted: boolean;
  createdAtUtc: string | null;
  /** Historical persisted commission rate — never re-rate. */
  commissionRatePercent: number | null;
};

export type ReportingSettlementSource = {
  id: string;
  partyType: "driver" | "agent";
  partyId: string;
  countryId: string;
  currency: string;
  status: SettlementV2Status | string;
  direction: SettlementDirection | string;
  amountMinor: bigint | null;
  paidConfirmedMinor: bigint | null;
  periodFromUtc: string | null;
  periodToUtc: string | null;
  sourceAccountingSnapshotId: string | null;
  sourceOrderId: string | null;
  claims: Array<{
    lineId: string;
    orderId: string;
    amountMinor: bigint | null;
    currency: string;
  }>;
  updatedAtUtc: string | null;
};

export type ReportingPaymentSource = {
  id: string;
  settlementId: string;
  amountMinor: bigint | null;
  currency: string;
  status: "pending" | "confirmed" | "reversed" | string;
  createdAtUtc: string | null;
  method?: string | null;
  reference?: string | null;
  createdBy?: string | null;
  confirmedBy?: string | null;
  confirmedAtUtc?: string | null;
  reversalOfPaymentId?: string | null;
};

export type ReportingAdjustmentSource = {
  id: string;
  status: "draft" | "approved" | "rejected" | string;
  countryId: string;
  currency: string;
  amountMinor: bigint | null;
  direction: AdjustmentDirection | string;
  relatedOrderId: string | null;
  relatedSettlementId: string | null;
  createdAtUtc: string | null;
  approvedAtUtc: string | null;
};

export type ReportingRefundSource = {
  id: string;
  kind: RefundKind | string;
  relatedOrderId: string;
  countryId: string;
  currency: string;
  amountMinor: bigint | null;
  status: "recorded" | "reversed" | string;
  createdAtUtc: string | null;
};

export type ReportingChargebackSource = {
  id: string;
  relatedOrderId: string;
  countryId: string;
  currency: string;
  amountMinor: bigint | null;
  feeAmountMinor: bigint | null;
  status: ChargebackAccountingStatus | string;
  createdAtUtc: string | null;
};

export type ReportingPayoutSource = {
  id: string;
  settlementId: string | null;
  countryId: string;
  currency: string;
  amountMinor: bigint | null;
  status: string;
  createdAtUtc: string | null;
};

export type FinanceReportingSourceBundle = {
  snapshots: ReportingSnapshotSource[];
  settlements: ReportingSettlementSource[];
  payments: ReportingPaymentSource[];
  adjustments: ReportingAdjustmentSource[];
  refunds: ReportingRefundSource[];
  chargebacks: ReportingChargebackSource[];
  payouts: ReportingPayoutSource[];
  /** ONE COUNTRY = ONE ACTIVE AGENT — map countryId → active agentId. */
  activeAgentByCountry: Record<string, string>;
  synthetic?: boolean;
  sourceWarnings?: string[];
};
