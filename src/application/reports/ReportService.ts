import { Money } from "@/domain/finance/Money";
import { FinancialCalculationService } from "@/domain/finance/FinancialCalculationService";
import type { TripRepository } from "@/repositories/interfaces/TripRepository";
import type { SettlementRepository } from "@/repositories/interfaces/SettlementRepository";
import type { AgentRepository } from "@/repositories/interfaces/AgentRepository";
import type { DriverRepository } from "@/repositories/interfaces/DriverRepository";
import { AuditService } from "@/audit/AuditService";
import type { AuthUser } from "@/types/auth";
import { assertPermission } from "@/permissions/guards";

export type ReportType =
  | "trip_financial_summary"
  | "settlement_summary"
  | "agent_summary"
  | "driver_earnings_summary"
  | "reconciliation_preview";

export type ReportFilters = {
  fromUtc?: string;
  toUtc?: string;
  countryId?: string;
  currencyCode?: string;
  agentId?: string;
  driverId?: string;
};

export type ReportRow = {
  id: string;
  label: string;
  amountMinor: string;
  currencyCode: string;
  meta?: Record<string, string>;
};

export type ReportResult = {
  reportType: ReportType;
  filters: ReportFilters;
  rows: ReportRow[];
  totalAmountMinor: string;
  currencyCode: string;
  synthetic: true;
  calculationPolicyId: string;
};

/** Protect CSV cells from spreadsheet formula injection. */
export function sanitizeCsvCell(value: string): string {
  const s = value.replace(/\r?\n/g, " ").replace(/"/g, '""');
  if (/^[=+\-@]/.test(s)) {
    return `"'${s}"`;
  }
  if (/[",]/.test(s)) {
    return `"${s}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(sanitizeCsvCell).join(","),
    ...rows.map((r) => r.map(sanitizeCsvCell).join(",")),
  ];
  return lines.join("\n");
}

export class ReportService {
  constructor(
    private readonly trips: TripRepository,
    private readonly settlements: SettlementRepository,
    private readonly agents: AgentRepository,
    private readonly drivers: DriverRepository,
    private readonly calc: FinancialCalculationService,
    private readonly audit: AuditService,
  ) {}

  async build(reportType: ReportType, filters: ReportFilters): Promise<ReportResult> {
    switch (reportType) {
      case "trip_financial_summary":
        return this.tripFinancialSummary(filters);
      case "settlement_summary":
        return this.settlementSummary(filters);
      case "agent_summary":
        return this.agentSummary(filters);
      case "driver_earnings_summary":
        return this.driverEarningsSummary(filters);
      case "reconciliation_preview":
        return this.reconciliationPreview(filters);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  private async tripFinancialSummary(filters: ReportFilters): Promise<ReportResult> {
    const page = await this.trips.list({
      page: 1,
      pageSize: 500,
      countryId: filters.countryId,
    });
    const currency = (filters.currencyCode ?? "SAR").toUpperCase();
    const rows: ReportRow[] = [];
    let total = Money.zero(currency);
    for (const trip of page.items) {
      if (filters.currencyCode && trip.currencyCode.toUpperCase() !== currency) continue;
      if (filters.fromUtc && trip.createdAtUtc < filters.fromUtc) continue;
      if (filters.toUtc && trip.createdAtUtc > filters.toUtc) continue;
      if (filters.agentId && trip.agentId !== filters.agentId) continue;
      if (filters.driverId && trip.driverId !== filters.driverId) continue;
      const ft = this.calc.calculateFromTrip(trip);
      const amount = ft.amounts.grossFare;
      if (!amount || amount.currency !== currency) continue;
      total = total.add(amount);
      rows.push({
        id: trip.id,
        label: `${trip.id} ${trip.status}`,
        amountMinor: amount.amountMinor.toString(),
        currencyCode: currency,
        meta: { confidence: ft.confidence, paymentMethod: trip.paymentMethod },
      });
    }
    return this.result("trip_financial_summary", filters, rows, total);
  }

  private async settlementSummary(filters: ReportFilters): Promise<ReportResult> {
    const page = await this.settlements.list({
      page: 1,
      pageSize: 200,
      countryId: filters.countryId,
      currencyCode: filters.currencyCode,
    });
    const currency = (filters.currencyCode ?? page.items[0]?.currencyCode ?? "SAR").toUpperCase();
    const rows: ReportRow[] = [];
    let total = Money.zero(currency);
    for (const s of page.items) {
      if (s.currencyCode.toUpperCase() !== currency) continue;
      const amount = Money.of(s.summary.grossFareMinor, currency);
      total = total.add(amount);
      rows.push({
        id: s.id,
        label: `${s.id} ${s.status}`,
        amountMinor: amount.amountMinor.toString(),
        currencyCode: currency,
        meta: { partyType: s.partyType, partyId: s.partyId },
      });
    }
    return this.result("settlement_summary", filters, rows, total);
  }

  private async agentSummary(filters: ReportFilters): Promise<ReportResult> {
    const page = await this.agents.list({ page: 1, pageSize: 100, countryId: filters.countryId });
    const currency = (filters.currencyCode ?? "SAR").toUpperCase();
    const rows: ReportRow[] = [];
    let total = Money.zero(currency);
    for (const agent of page.items) {
      const trips = await this.trips.list({ page: 1, pageSize: 500, countryId: agent.countryId });
      let agentTotal = Money.zero(currency);
      for (const trip of trips.items) {
        if (trip.agentId !== agent.id) continue;
        if (filters.currencyCode && trip.currencyCode.toUpperCase() !== currency) continue;
        const ft = this.calc.calculateFromTrip(trip);
        if (ft.amounts.agentCommission && ft.amounts.agentCommission.currency === currency) {
          agentTotal = agentTotal.add(ft.amounts.agentCommission);
        }
      }
      total = total.add(agentTotal);
      rows.push({
        id: agent.id,
        label: agent.name,
        amountMinor: agentTotal.amountMinor.toString(),
        currencyCode: currency,
        meta: { status: agent.status, countryId: agent.countryId },
      });
    }
    return this.result("agent_summary", filters, rows, total);
  }

  private async driverEarningsSummary(filters: ReportFilters): Promise<ReportResult> {
    const page = await this.drivers.list({ page: 1, pageSize: 200, countryId: filters.countryId });
    const currency = (filters.currencyCode ?? "SAR").toUpperCase();
    const rows: ReportRow[] = [];
    let total = Money.zero(currency);
    for (const driver of page.items) {
      if (filters.driverId && driver.id !== filters.driverId) continue;
      const trips = await this.trips.list({ page: 1, pageSize: 500, countryId: driver.countryId });
      let earnings = Money.zero(currency);
      for (const trip of trips.items) {
        if (trip.driverId !== driver.id) continue;
        if (trip.currencyCode.toUpperCase() !== currency) continue;
        const ft = this.calc.calculateFromTrip(trip);
        if (ft.amounts.driverEarnings) earnings = earnings.add(ft.amounts.driverEarnings);
      }
      total = total.add(earnings);
      rows.push({
        id: driver.id,
        label: driver.name,
        amountMinor: earnings.amountMinor.toString(),
        currencyCode: currency,
        meta: { agentId: driver.agentId ?? "" },
      });
    }
    return this.result("driver_earnings_summary", filters, rows, total);
  }

  private async reconciliationPreview(filters: ReportFilters): Promise<ReportResult> {
    const tripReport = await this.tripFinancialSummary(filters);
    const settlementReport = await this.settlementSummary(filters);
    const currency = tripReport.currencyCode;
    const tripTotal = Money.of(tripReport.totalAmountMinor, currency);
    const settlementTotal = Money.of(
      settlementReport.currencyCode === currency ? settlementReport.totalAmountMinor : "0",
      currency,
    );
    const delta = tripTotal.subtract(settlementTotal);
    const rows: ReportRow[] = [
      {
        id: "trips_gross",
        label: "Trip gross (synthetic)",
        amountMinor: tripTotal.amountMinor.toString(),
        currencyCode: currency,
      },
      {
        id: "settlements_gross",
        label: "Settlement gross (synthetic)",
        amountMinor: settlementTotal.amountMinor.toString(),
        currencyCode: currency,
      },
      {
        id: "delta",
        label: "Reconciliation delta (synthetic)",
        amountMinor: delta.amountMinor.toString(),
        currencyCode: currency,
      },
    ];
    const total = rows.reduce(
      (acc, row) => acc.add(Money.of(row.amountMinor, currency)),
      Money.zero(currency),
    );
    return this.result("reconciliation_preview", filters, rows, total);
  }

  private result(
    reportType: ReportType,
    filters: ReportFilters,
    rows: ReportRow[],
    total: Money,
  ): ReportResult {
    return {
      reportType,
      filters,
      rows,
      totalAmountMinor: total.amountMinor.toString(),
      currencyCode: total.currency,
      synthetic: true,
      calculationPolicyId: this.calc.getPolicy().policyId,
    };
  }

  async exportCsv(
    actor: AuthUser,
    reportType: ReportType,
    filters: ReportFilters,
    correlationId: string,
  ): Promise<{ csv: string; report: ReportResult }> {
    assertPermission(actor.permissions, "reports:export");
    const report = await this.build(reportType, filters);
    const headers = ["id", "label", "amountMinor", "currencyCode"];
    const csv = rowsToCsv(
      headers,
      report.rows.map((r) => [r.id, r.label, r.amountMinor, r.currencyCode]),
    );
    await this.audit.record({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: "report_exported",
      resourceType: "report",
      resourceId: reportType,
      afterSnapshot: { filters, rowCount: report.rows.length },
      correlationId,
    });
    return { csv, report };
  }
}
