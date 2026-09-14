/**
 * FR7 — FinanceReportingReadService.
 * Authoritative Admin Next Finance UI read models.
 * Computed from canonical source bundle; no writes; no third book;
 * no UI commission recalc; missing ≠ 0.
 */

import {
  buildAgentSummary,
  buildCountrySummary,
  buildDashboardSummary,
  buildDriverSummary,
  computeReconciliationIndicators,
  listCorrections,
  listSettlements,
  settlementDetail,
} from "@/domain/finance/reporting/FinanceReportingAggregator";
import type {
  AgentFinanceSummary,
  CountryFinanceSummary,
  DriverFinanceSummary,
  FinanceDashboardSummary,
  FinanceReportingDimensionFilters,
  FinanceReportingSourceBundle,
  ReconciliationIndicatorReadModel,
  ReportExportSourceModel,
  SettlementDetailReadModel,
  SettlementListItem,
  CorrectionVisibilityItem,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { assertFinanceReportPayloadSafe } from "@/application/finance/reporting/FinanceReportingPii";
import {
  assertAgentInScope,
  assertCountryInScope,
  assertFinanceReadPermission,
  assertReportsExportPermission,
  resolveReportingScopeLabel,
  type FinanceReportingActor,
} from "@/application/finance/reporting/FinanceReportingScope";
import { rowsToCsv } from "@/application/reports/ReportService";
import {
  canonicalizeCountryIdList,
  requireCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

export class FinanceReportingReadService {
  constructor(private readonly bundle: FinanceReportingSourceBundle) {}

  dashboard(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): FinanceDashboardSummary {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const result = buildDashboardSummary({
      bundle: this.bundle,
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  countrySummary(
    actor: FinanceReportingActor,
    countryId: string,
    filters: FinanceReportingDimensionFilters = {},
  ): CountryFinanceSummary {
    const canonicalCountryId = requireCanonicalCountryId(countryId);
    assertCountryInScope(actor, canonicalCountryId);
    const result = buildCountrySummary({
      bundle: this.bundle,
      countryId: canonicalCountryId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  agentSummary(
    actor: FinanceReportingActor,
    input: { agentId: string; countryId: string },
    filters: FinanceReportingDimensionFilters = {},
  ): AgentFinanceSummary {
    const canonicalCountryId = requireCanonicalCountryId(input.countryId);
    assertAgentInScope(actor, {
      agentId: input.agentId,
      countryId: canonicalCountryId,
    });
    const result = buildAgentSummary({
      bundle: this.bundle,
      agentId: input.agentId,
      countryId: canonicalCountryId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [input.agentId],
    });
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  driverSummary(
    actor: FinanceReportingActor,
    driverId: string,
    filters: FinanceReportingDimensionFilters = {},
  ): DriverFinanceSummary {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const result = buildDriverSummary({
      bundle: this.bundle,
      driverId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  settlements(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): SettlementListItem[] {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const rows = listSettlements(
      this.bundle,
      this.applyScopeFilters(actor, filters),
    );
    assertFinanceReportPayloadSafe(rows);
    return rows;
  }

  settlement(
    actor: FinanceReportingActor,
    settlementId: string,
  ): SettlementDetailReadModel | null {
    assertFinanceReadPermission(actor);
    const detail = settlementDetail(this.bundle, settlementId);
    if (!detail) return null;
    assertCountryInScope(actor, detail.countryId);
    assertFinanceReportPayloadSafe(detail);
    return detail;
  }

  reconciliation(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): ReconciliationIndicatorReadModel {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scoped = this.applyScopeFilters(actor, filters);
    const snaps = this.bundle.snapshots.filter((s) => {
      if (scoped.countryId && s.countryId !== scoped.countryId) return false;
      return true;
    });
    const setts = this.bundle.settlements.filter((s) => {
      if (scoped.countryId && s.countryId !== scoped.countryId) return false;
      return true;
    });
    const result = computeReconciliationIndicators({
      snapshots: snaps,
      settlements: setts,
    });
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  corrections(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): CorrectionVisibilityItem[] {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const rows = listCorrections(
      this.bundle,
      this.applyScopeFilters(actor, filters),
    );
    assertFinanceReportPayloadSafe(rows);
    return rows;
  }

  /**
   * Export source model for CSV/PDF later.
   * Requires reports:export. Does not generate PDF.
   */
  exportSource(
    actor: FinanceReportingActor,
    reportType: ReportExportSourceModel["reportType"],
    filters: FinanceReportingDimensionFilters = {},
  ): ReportExportSourceModel {
    assertReportsExportPermission(actor);
    const dash = this.dashboard(actor, filters);
    const headers = [
      "metric",
      "amountMinor",
      "currency",
      "availability",
      "incompleteReasons",
    ];
    const rows: string[][] = Object.entries(dash.company).map(([k, v]) => [
      k,
      v.amountMinor ?? "",
      v.currency ?? "",
      v.availability,
      v.incompleteReasons.join("|"),
    ]);
    let total: bigint | null = BigInt(0);
    for (const r of rows) {
      if (!r[1]) {
        total = null;
        break;
      }
      total = (total ?? BigInt(0)) + BigInt(r[1]);
    }
    const model: ReportExportSourceModel = {
      meta: dash.meta,
      reportType,
      headers,
      rows,
      totalAmountMinor: total?.toString() ?? null,
      currencyCode: dash.meta.currency,
      requiresReportsExport: true,
    };
    assertFinanceReportPayloadSafe(model);
    return model;
  }

  exportCsv(
    actor: FinanceReportingActor,
    reportType: ReportExportSourceModel["reportType"],
    filters: FinanceReportingDimensionFilters = {},
  ): string {
    const model = this.exportSource(actor, reportType, filters);
    return rowsToCsv(model.headers, model.rows);
  }

  private applyScopeFilters(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters,
  ): FinanceReportingDimensionFilters {
    const next = { ...filters };
    if (next.countryId) {
      next.countryId = requireCanonicalCountryId(next.countryId);
    }
    if (actor.scope.type === "country" && actor.scope.countryIds?.length) {
      const scoped = canonicalizeCountryIdList(actor.scope.countryIds);
      if (next.countryId && !scoped.includes(next.countryId)) {
        throw new Error(`cross_country_denied:${next.countryId}`);
      }
      if (!next.countryId && scoped.length === 1) {
        next.countryId = scoped[0];
      }
    }
    if (actor.scope.type === "agent" && actor.scope.agentIds?.length) {
      if (next.agentId && !actor.scope.agentIds.includes(next.agentId)) {
        throw new Error(`scope_denied:agent:${next.agentId}`);
      }
      if (!next.agentId && actor.scope.agentIds.length === 1) {
        next.agentId = actor.scope.agentIds[0];
      }
      if (actor.scope.countryIds?.length === 1 && !next.countryId) {
        next.countryId = requireCanonicalCountryId(actor.scope.countryIds[0]!);
      }
    }
    return next;
  }
}
