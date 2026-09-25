/**
 * Distinct agent parties from certified FR7 bundle for accountant agent-accounts directory.
 */

import type {
  FinanceReportingDimensionFilters,
  FinanceReportingSourceBundle,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { buildAgentSummary } from "@/domain/finance/reporting/FinanceReportingAggregator";

export type AgentAccountListItem = {
  agentId: string;
  countryId: string;
  currency: string | null;
  collectedCashMinor: string | null;
  outstandingMinor: string | null;
  paidMinor: string | null;
  settlementsDueMinor: string | null;
  agentEntitlementMinor: string | null;
  companyAmountDueMinor: string | null;
  attributionStatus: string;
};

export function listAgentAccountDirectory(
  bundle: FinanceReportingSourceBundle,
  filters: FinanceReportingDimensionFilters = {},
): AgentAccountListItem[] {
  const countryId = filters.countryId;
  if (!countryId) return [];

  const agentIds = new Set<string>();
  for (const s of bundle.snapshots) {
    if (s.countryId !== countryId) continue;
    if (filters.currency && s.currency.toUpperCase() !== filters.currency.toUpperCase())
      continue;
    if (s.agentId) agentIds.add(s.agentId);
  }
  for (const s of bundle.settlements) {
    if (s.countryId !== countryId) continue;
    if (s.partyType === "agent") agentIds.add(s.partyId);
  }
  if (filters.agentId) {
    if (!agentIds.has(filters.agentId)) return [];
    agentIds.clear();
    agentIds.add(filters.agentId);
  }

  const rows: AgentAccountListItem[] = [];
  for (const agentId of [...agentIds].sort()) {
    const summary = buildAgentSummary({
      bundle,
      agentId,
      countryId,
      filters,
    });
    const m = summary.metrics;
    rows.push({
      agentId,
      countryId,
      currency: summary.meta.currency,
      collectedCashMinor: m.collectedCash.amountMinor,
      outstandingMinor: m.outstanding.amountMinor,
      paidMinor: m.paid.amountMinor,
      settlementsDueMinor: m.settlementsDue.amountMinor,
      agentEntitlementMinor: m.agentEntitlement.amountMinor,
      companyAmountDueMinor: m.companyAmountDue.amountMinor,
      attributionStatus: m.attributionStatus,
    });
  }
  return rows;
}
