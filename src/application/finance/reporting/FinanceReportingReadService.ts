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
  ReportMoney,
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
      bundle: this.scopedBundle(actor),
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    if ("meta" in result && this.bundle.sourceWarnings?.length) {
      result.meta.sourceCompleteness = "partial";
      result.meta.incompleteReasons = [...new Set([...result.meta.incompleteReasons, ...this.bundle.sourceWarnings])];
    }
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
      bundle: this.scopedBundle(actor),
      countryId: canonicalCountryId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    if ("meta" in result && this.bundle.sourceWarnings?.length) {
      result.meta.sourceCompleteness = "partial";
      result.meta.incompleteReasons = [...new Set([...result.meta.incompleteReasons, ...this.bundle.sourceWarnings])];
    }
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
      bundle: this.scopedBundle(actor),
      agentId: input.agentId,
      countryId: canonicalCountryId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [input.agentId],
    });
    if ("meta" in result && this.bundle.sourceWarnings?.length) {
      result.meta.sourceCompleteness = "partial";
      result.meta.incompleteReasons = [...new Set([...result.meta.incompleteReasons, ...this.bundle.sourceWarnings])];
    }
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
      bundle: this.scopedBundle(actor),
      driverId,
      filters: this.applyScopeFilters(actor, filters),
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    if ("meta" in result && this.bundle.sourceWarnings?.length) {
      result.meta.sourceCompleteness = "partial";
      result.meta.incompleteReasons = [...new Set([...result.meta.incompleteReasons, ...this.bundle.sourceWarnings])];
    }
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
      this.scopedBundle(actor),
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
    const original = this.bundle.settlements.find(s => s.id === settlementId);
    if (original) {
      assertCountryInScope(actor, original.countryId);
      if (actor.scope.type === "agent" && (original.partyType !== "agent" || !actor.scope.agentIds?.includes(original.partyId))) {
        throw new Error("scope_denied:settlement");
      }
    }
    const detail = settlementDetail(this.scopedBundle(actor), settlementId);
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
    const bundle = this.scopedBundle(actor);
    const snaps = bundle.snapshots.filter((s) => {
      if (scoped.countryId && s.countryId !== scoped.countryId) return false;
      return true;
    });
    const setts = bundle.settlements.filter((s) => {
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
      this.scopedBundle(actor),
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
    const scoped = this.applyScopeFilters(actor, filters);
    const dash = this.dashboard(actor, scoped);
    let meta = dash.meta;
    let headers = ["metric", "amountMinor", "currency", "availability", "incompleteReasons"];
    let rows: string[][] = [];
    const metrics = (values: object) => Object.entries(values)
      .filter(([, value]) => value && typeof value === "object" && "availability" in value)
      .map(([key, value]) => {
        const money = value as ReportMoney;
        return [key, money.amountMinor ?? "", money.currency ?? "", money.availability, money.incompleteReasons.join("|")];
      });
    switch (reportType) {
      case "finance_dashboard":
        rows = scoped.currency ? metrics(dash.company) : dash.byCurrency.flatMap(group => metrics(group.company));
        break;
      case "country_finance": {
        if (!scoped.countryId) throw new Error("validation_failed:countryId required");
        const summary = this.countrySummary(actor, scoped.countryId, scoped);
        meta = summary.meta; rows = metrics(summary.company); break;
      }
      case "agent_finance": {
        if (!scoped.countryId || !scoped.agentId) throw new Error("validation_failed:countryId and agentId required");
        const summary = this.agentSummary(actor, { countryId: scoped.countryId, agentId: scoped.agentId }, scoped);
        meta = summary.meta; rows = metrics(summary.metrics); break;
      }
      case "driver_finance": {
        if (!scoped.driverId) throw new Error("validation_failed:driverId required");
        const summary = this.driverSummary(actor, scoped.driverId, scoped);
        meta = summary.meta; rows = metrics(summary.metrics); break;
      }
      case "settlement_summary":
        headers = ["settlementId", "party", "country", "currency", "status", "direction", "amountMinor", "paidConfirmedMinor", "outstandingMinor"];
        rows = this.settlements(actor, scoped).map(s => [s.id, s.partyIdToken, s.countryId, s.currency, s.status, s.direction, s.amountMinor ?? "", s.paidConfirmedMinor ?? "", s.outstandingMinor ?? ""]);
        break;
      case "corrections_visibility":
        headers = ["id", "kind", "status", "currency", "amountMinor", "monetaryEffect", "direction", "relatedSettlementId"];
        rows = this.corrections(actor, scoped).map(c => [c.id, c.kind, c.status, c.currency ?? "", c.amountMinor ?? "", String(c.monetaryEffect), c.directionOrKind, c.relatedSettlementId ?? ""]);
        break;
      case "reconciliation_indicators": {
        const recon = this.reconciliation(actor, scoped);
        headers = ["metric", "status", "value", "incompleteReasons"];
        rows = ["snapshotMatchesSettlement", "claimMatchesCommission", "outstandingConsistent"].map(key => [key, recon.status, String(recon[key as keyof typeof recon] ?? "unknown"), recon.blockers.join("|")]);
        break;
      }
      default: throw new Error("validation_failed:unsupported report type");
    }
    // Unrelated metrics and different currencies must never be added into a financial total.
    const model: ReportExportSourceModel = {
      meta, reportType, headers, rows, totalAmountMinor: null,
      currencyCode: meta.currency, requiresReportsExport: true,
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

  private scopedBundle(actor: FinanceReportingActor): FinanceReportingSourceBundle {
    if (actor.scope.type === "global") return this.bundle;
    if (actor.scope.type !== "country" && actor.scope.type !== "agent") throw new Error("scope_denied:unsupported_finance_scope");
    const countries = canonicalizeCountryIdList(actor.scope.countryIds ?? []);
    const agents = actor.scope.agentIds ?? [];
    if (!countries.length || (actor.scope.type === "agent" && !agents.length)) throw new Error("scope_denied:empty_finance_scope");
    const countryAllowed = (id: string) => countries.includes(requireCanonicalCountryId(id));
    const snapshots = this.bundle.snapshots.filter(s => countryAllowed(s.countryId) && (actor.scope.type !== "agent" || (s.agentId != null && agents.includes(s.agentId))));
    const settlements = this.bundle.settlements.filter(s => countryAllowed(s.countryId) && (actor.scope.type !== "agent" || (s.partyType === "agent" && agents.includes(s.partyId))));
    const orders = new Set(snapshots.map(s => s.orderId));
    const ids = new Set(settlements.map(s => s.id));
    const related = (orderId: string | null, settlementId: string | null = null) => actor.scope.type !== "agent" || (orderId != null && orders.has(orderId)) || (settlementId != null && ids.has(settlementId));
    return {
      ...this.bundle, snapshots, settlements,
      payments: this.bundle.payments.filter(p => ids.has(p.settlementId)),
      adjustments: this.bundle.adjustments.filter(a => countryAllowed(a.countryId) && related(a.relatedOrderId, a.relatedSettlementId)),
      refunds: this.bundle.refunds.filter(a => countryAllowed(a.countryId) && related(a.relatedOrderId)),
      chargebacks: this.bundle.chargebacks.filter(a => countryAllowed(a.countryId) && related(a.relatedOrderId)),
      payouts: this.bundle.payouts.filter(a => countryAllowed(a.countryId) && related(null, a.settlementId)),
      activeAgentByCountry: Object.fromEntries(Object.entries(this.bundle.activeAgentByCountry).filter(([country, agent]) => countryAllowed(country) && (actor.scope.type !== "agent" || agents.includes(agent)))),
    };
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
