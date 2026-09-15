/**
 * Operational dashboard metrics only.
 * Financial totals MUST come from FR7 FinanceReportingReadService — never recalculated here.
 */

import type { DriverRepository } from "@/repositories/interfaces/DriverRepository";
import type { TripRepository } from "@/repositories/interfaces/TripRepository";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";
import {
  boundedSampleKpiMeta,
  exactKpiMeta,
  type DashboardKpiAccuracyMap,
} from "@/domain/dashboard/KpiAccuracy";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";

export type DashboardFilters = {
  fromUtc?: string;
  toUtc?: string;
  countryId?: string;
  currencyCode?: string;
};

export type DashboardMetrics = {
  totalTrips: number | null;
  completedTrips: number | null;
  cancelledTrips: number | null;
  activeDrivers: number | null;
  customers: number | null;
  pendingDrivers: number | null;
  /** Always null — finance money is FR7-only. */
  cashCollected: null;
  /** Always null — finance money is FR7-only. */
  onlineCollected: null;
  /** Always null — finance money is FR7-only. */
  platformCommission: null;
  currencyCode: string | null;
  filters: DashboardFilters;
  drilldowns: {
    trips: string;
    drivers: string;
    completedTrips: string;
    finance: string;
  };
  synthetic: boolean;
  financeSource: "fr7_reporting_read_service";
  sourceLabel?: {
    label: string;
    en: string;
    ar: string;
    synthetic: boolean;
  };
  metricsAvailability?:
    | "bounded_sample"
    | "unavailable"
    | "development_synthetic"
    | "exact";
  kpiAccuracy?: DashboardKpiAccuracyMap;
  sampleIncludesPilotOrTest?: boolean;
  boundedSampleLimit?: number;
};

export class DashboardService {
  constructor(
    private readonly trips: TripRepository,
    private readonly drivers: DriverRepository,
    private readonly customers: CustomerRepository,
  ) {}

  async getMetrics(filters: DashboardFilters = {}): Promise<DashboardMetrics> {
    const limit = WIF_NATIVE_MAX_READ_LIMIT;
    const [tripPage, driverPage, customerPage] = await Promise.all([
      this.trips.list({ page: 1, pageSize: limit, countryId: filters.countryId }),
      this.drivers.list({
        page: 1,
        pageSize: limit,
        countryId: filters.countryId,
      }),
      this.customers.list({
        page: 1,
        pageSize: limit,
        countryId: filters.countryId,
      }),
    ]);

    let trips = tripPage.items;
    if (filters.fromUtc) trips = trips.filter((t) => t.createdAtUtc >= filters.fromUtc!);
    if (filters.toUtc) trips = trips.filter((t) => t.createdAtUtc <= filters.toUtc!);
    if (filters.currencyCode) {
      trips = trips.filter(
        (t) => t.currencyCode.toUpperCase() === filters.currencyCode!.toUpperCase(),
      );
    }

    const cancelled = trips.filter((t) => t.status.startsWith("cancelled_")).length;
    const completed = trips.filter((t) => t.status === "completed").length;
    const activeDrivers = driverPage.items.filter(
      (d) => d.availabilityStatus === "online" || d.availabilityStatus === "busy",
    ).length;
    const pendingDrivers = driverPage.items.filter(
      (d) => d.registrationStatus === "pending_review",
    ).length;

    const currency =
      filters.currencyCode?.toUpperCase() ??
      trips.find((t) => t.currencyCode)?.currencyCode?.toUpperCase() ??
      null;

    const qs = new URLSearchParams();
    if (filters.countryId) qs.set("countryId", filters.countryId);
    if (filters.currencyCode) qs.set("currencyCode", filters.currencyCode);
    if (filters.fromUtc) qs.set("from", filters.fromUtc);
    if (filters.toUtc) qs.set("to", filters.toUtc);
    const q = qs.toString();

    const truncated =
      tripPage.items.length >= limit ||
      driverPage.items.length >= limit ||
      customerPage.items.length >= limit;
    // Dev fixtures are the full known set when under the cap — mark exact; else bounded.
    const meta = truncated
      ? boundedSampleKpiMeta({ sampleLimit: limit, truncated: true })
      : exactKpiMeta();
    const kpiAccuracy: DashboardKpiAccuracyMap = {
      totalTrips: meta,
      completedTrips: meta,
      cancelledTrips: meta,
      activeDrivers: meta,
      customers: meta,
      pendingDrivers: meta,
    };

    return {
      totalTrips: trips.length,
      completedTrips: completed,
      cancelledTrips: cancelled,
      activeDrivers,
      customers: customerPage.total,
      pendingDrivers,
      cashCollected: null,
      onlineCollected: null,
      platformCommission: null,
      currencyCode: currency,
      filters,
      drilldowns: {
        trips: `/trips${q ? `?${q}` : ""}`,
        drivers: `/drivers${filters.countryId ? `?countryId=${filters.countryId}` : ""}`,
        completedTrips: `/trips?status=completed${filters.countryId ? `&countryId=${filters.countryId}` : ""}`,
        finance: `/finance${q ? `?${q}` : ""}`,
      },
      synthetic: true,
      financeSource: "fr7_reporting_read_service",
      metricsAvailability: truncated ? "bounded_sample" : "development_synthetic",
      kpiAccuracy,
      sampleIncludesPilotOrTest: false,
      boundedSampleLimit: limit,
      sourceLabel: {
        label: "development_synthetic",
        en: "Development synthetic",
        ar: "بيانات تطوير اصطناعية",
        synthetic: true,
      },
    };
  }
}
