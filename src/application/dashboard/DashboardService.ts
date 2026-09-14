/**
 * Operational dashboard metrics only.
 * Financial totals MUST come from FR7 FinanceReportingReadService — never recalculated here.
 */

import type { DriverRepository } from "@/repositories/interfaces/DriverRepository";
import type { TripRepository } from "@/repositories/interfaces/TripRepository";
import type { CustomerRepository } from "@/repositories/interfaces/CustomerRepository";

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
  metricsAvailability?: "bounded_sample" | "unavailable" | "synthetic";
};

export class DashboardService {
  constructor(
    private readonly trips: TripRepository,
    private readonly drivers: DriverRepository,
    private readonly customers: CustomerRepository,
  ) {}

  async getMetrics(filters: DashboardFilters = {}): Promise<DashboardMetrics> {
    const [tripPage, driverPage, customerPage] = await Promise.all([
      this.trips.list({ page: 1, pageSize: 500, countryId: filters.countryId }),
      this.drivers.list({ page: 1, pageSize: 500, countryId: filters.countryId }),
      this.customers.list({ page: 1, pageSize: 500, countryId: filters.countryId }),
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
      metricsAvailability: "synthetic",
      sourceLabel: {
        label: "synthetic",
        en: "Synthetic (development only)",
        ar: "بيانات تجريبية (تطوير فقط)",
        synthetic: true,
      },
    };
  }
}
