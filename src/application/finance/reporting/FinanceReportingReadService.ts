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
  countDriverAccountingTrips,
  countDriverAccountingTripsBatch,
  computeReconciliationIndicators,
  listCorrections,
  listSettlements,
  listSettlementPartyRefs,
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

import { anyPilotDocumentIds } from "@/domain/production-read/SourceLabel";
import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";

export class FinanceReportingReadService {
  constructor(private readonly bundle: FinanceReportingSourceBundle) {}

  dashboard(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): FinanceDashboardSummary {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const fullSource = this.scopedBundle(actor);
    const source = this.applyPilotExclusion(fullSource, scopedFilters);
    const result = buildDashboardSummary({
      bundle: source,
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    result.meta.containsPilotRecords = this.bundleHasPilotRecords(source);
    result.meta.includePilotRecords = scopedFilters.includePilotRecords === true;
    if (this.bundle.sourceWarnings?.length) {
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
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const fullSource = this.scopedBundle(actor);
    const source = this.applyPilotExclusion(fullSource, scopedFilters);
    const result = buildCountrySummary({
      bundle: source,
      countryId: canonicalCountryId,
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    result.meta.containsPilotRecords = this.bundleHasPilotRecords(source);
    result.meta.includePilotRecords = scopedFilters.includePilotRecords === true;
    if (this.bundle.sourceWarnings?.length) {
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
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const fullSource = this.scopedBundle(actor);
    const source = this.applyPilotExclusion(fullSource, scopedFilters);
    const result = buildAgentSummary({
      bundle: source,
      agentId: input.agentId,
      countryId: canonicalCountryId,
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [canonicalCountryId],
      scopeAgentIds: actor.scope.agentIds ?? [input.agentId],
    });
    result.meta.containsPilotRecords = this.bundleHasPilotRecords(source);
    result.meta.includePilotRecords = scopedFilters.includePilotRecords === true;
    if (this.bundle.sourceWarnings?.length) {
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
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const fullSource = this.scopedBundle(actor);
    const source = this.applyPilotExclusion(fullSource, scopedFilters);
    const result = buildDriverSummary({
      bundle: source,
      driverId,
      filters: scopedFilters,
      scope: resolveReportingScopeLabel(actor.scope),
      scopeCountryIds: actor.scope.countryIds ?? [],
      scopeAgentIds: actor.scope.agentIds ?? [],
    });
    result.meta.containsPilotRecords = this.bundleHasPilotRecords(source);
    result.meta.includePilotRecords = scopedFilters.includePilotRecords === true;
    if (this.bundle.sourceWarnings?.length) {
      result.meta.sourceCompleteness = "partial";
      result.meta.incompleteReasons = [...new Set([...result.meta.incompleteReasons, ...this.bundle.sourceWarnings])];
    }
    assertFinanceReportPayloadSafe(result);
    return result;
  }

  /**
   * Exact unique-order count from finance accounting snapshots for one driver.
   * Requires finance:read. 0 means no snapshots (honest empty), not unavailable.
   */
  driverAccountingTripCount(
    actor: FinanceReportingActor,
    driverId: string,
    filters: FinanceReportingDimensionFilters = {},
  ): number {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const source = this.applyPilotExclusion(
      this.scopedBundle(actor),
      scopedFilters,
    );
    return countDriverAccountingTrips({
      bundle: source,
      driverId,
      filters: scopedFilters,
    });
  }

  driverAccountingTripCounts(
    actor: FinanceReportingActor,
    driverIds: readonly string[],
    filters: FinanceReportingDimensionFilters = {},
  ): Map<string, number> {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const source = this.applyPilotExclusion(
      this.scopedBundle(actor),
      scopedFilters,
    );
    return countDriverAccountingTripsBatch({
      bundle: source,
      driverIds,
      filters: scopedFilters,
    });
  }

  settlements(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): SettlementListItem[] {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const rows = listSettlements(
      this.applyPilotExclusion(this.scopedBundle(actor), scopedFilters),
      scopedFilters,
    );
    assertFinanceReportPayloadSafe(rows);
    return rows;
  }

  /** Server-only refs for party display enrichment — never serialize to clients. */
  settlementPartyRefs(
    actor: FinanceReportingActor,
    filters: FinanceReportingDimensionFilters = {},
  ): Array<{ settlementId: string; partyType: "driver" | "agent"; partyId: string }> {
    assertFinanceReadPermission(actor);
    if (filters.countryId) assertCountryInScope(actor, filters.countryId);
    const scopedFilters = this.applyScopeFilters(actor, filters);
    return listSettlementPartyRefs(
      this.applyPilotExclusion(this.scopedBundle(actor), scopedFilters),
      scopedFilters,
    );
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
    const scopedFilters = this.applyScopeFilters(actor, filters);
    const rows = listCorrections(
      this.applyPilotExclusion(this.scopedBundle(actor), scopedFilters),
      scopedFilters,
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

  private applyPilotExclusion(
    bundle: FinanceReportingSourceBundle,
    filters: FinanceReportingDimensionFilters,
  ): FinanceReportingSourceBundle {
    // Explicit false (API/UI default) excludes QA/pilot rows.
    // Undefined keeps full bundle for offline/golden unit tests.
    if (filters.includePilotRecords !== false) return bundle;
    const keepById = <T extends { id: string }>(rows: T[]) =>
      rows.filter((r) => !isFinanceQaOrPilotRecordId(r.id));
    const settlements = bundle.settlements.filter(
      (s) => !this.isPilotSettlementRow(s),
    );
    const settlementIds = new Set(settlements.map((s) => s.id));
    return {
      ...bundle,
      snapshots: keepById(bundle.snapshots),
      settlements,
      payments: bundle.payments.filter(
        (p) =>
          !isFinanceQaOrPilotRecordId(p.id) &&
          settlementIds.has(p.settlementId),
      ),
      adjustments: keepById(bundle.adjustments).filter(
        (a) =>
          !a.relatedSettlementId || settlementIds.has(a.relatedSettlementId),
      ),
      refunds: keepById(bundle.refunds),
      chargebacks: keepById(bundle.chargebacks),
      payouts: keepById(bundle.payouts),
    };
  }

  private isPilotSettlementRow(s: {
    id: string;
    partyId: string;
    sourceOrderId: string | null;
    sourceAccountingSnapshotId: string | null;
    claims: Array<{ lineId: string; orderId: string }>;
  }): boolean {
    if (isFinanceQaOrPilotRecordId(s.id)) return true;
    if (isFinanceQaOrPilotRecordId(s.partyId)) return true;
    if (isFinanceQaOrPilotRecordId(s.sourceOrderId)) return true;
    if (isFinanceQaOrPilotRecordId(s.sourceAccountingSnapshotId)) return true;
    return s.claims.some(
      (c) =>
        isFinanceQaOrPilotRecordId(c.lineId) ||
        isFinanceQaOrPilotRecordId(c.orderId),
    );
  }

  private bundleHasPilotRecords(bundle: FinanceReportingSourceBundle): boolean {
    if (
      bundle.settlements.some((s) => this.isPilotSettlementRow(s))
    ) {
      return true;
    }
    const ids = [
      ...bundle.snapshots,
      ...bundle.settlements,
      ...bundle.payments,
      ...bundle.adjustments,
      ...bundle.refunds,
      ...bundle.chargebacks,
      ...bundle.payouts,
    ].map((r) => r.id);
    return (
      anyPilotDocumentIds(ids) ||
      ids.some((id) => isFinanceQaOrPilotRecordId(id))
    );
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
