/**
 * Production dashboard aggregates — capped multi-page scans.
 * Exact when scan completes; null + incomplete when budget exhausted.
 * Never presents a ≤50 sample page as an authoritative total.
 *
 * Scans run in parallel so one slow collection does not serialize the
 * whole request past serverless limits. Optional catalog/support failures
 * isolate to that KPI only.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import {
  DASHBOARD_AGGREGATE_MAX_PAGES,
  DASHBOARD_PAGE_SIZE,
  finalizeAggregateCount,
  type DashboardAggregateScanResult,
} from "@/domain/dashboard/DashboardAggregateScan";
import { includeRowInDashboardKpi } from "@/domain/dashboard/DashboardQaPolicy";
import type { DashboardKpiAccuracyMap } from "@/domain/dashboard/KpiAccuracy";
import type { DashboardFilters } from "@/application/dashboard/DashboardService";
import { resolveCountryFilterCanonicalId } from "@/domain/geography/CountryOption";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import { sampleIncludesPilotOrTest } from "@/domain/production-read/RecordClassification";
import {
  listFleetCompanies,
  listPartnerLandmarks,
  listTourGuides,
} from "@/application/production-read/P0CatalogApiReads";
import { FirebaseProductionSupportReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionSupportReadRepository";
import { enforceLiveShadowResource } from "@/infrastructure/production/repositories/productionReadHelpers";
import type { ProductionDashboardMetrics } from "@/application/production-read/ProductionOperationalApiReads";
import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";

const ACTIVE_TRIP_STATUSES = new Set([
  "pending_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "trip_started",
  "trip_in_progress",
]);

type Classifiable = { id: string; mappingStatus?: string | null };

function unavailableScan(): DashboardAggregateScanResult {
  return finalizeAggregateCount({
    count: 0,
    truncated: false,
    pagesScanned: 0,
    excludedQaCount: 0,
    unavailable: true,
  });
}

function inPeriod(
  iso: string | null | undefined,
  fromUtc?: string,
  toUtc?: string,
): boolean {
  if (!fromUtc && !toUtc) return true;
  if (!iso) return false;
  if (fromUtc && iso < fromUtc) return false;
  if (toUtc && iso > toUtc) return false;
  return true;
}

function tripPassesFilters(
  t: CanonicalTripReadModel,
  filters: DashboardFilters,
  hasPeriod: boolean,
): boolean {
  const tripCurrency = t.currencyCode?.value ?? null;
  if (
    filters.currencyCode &&
    tripCurrency &&
    tripCurrency.toUpperCase() !== filters.currencyCode.toUpperCase()
  ) {
    return false;
  }
  if (filters.currencyCode && !tripCurrency) {
    return false;
  }
  const created = t.createdAtUtc?.value ?? null;
  if (!hasPeriod && !inPeriod(created, filters.fromUtc, filters.toUtc)) {
    return false;
  }
  return true;
}

export async function computeProductionDashboardAggregates(
  ctx: ApiActorContext,
  filters: DashboardFilters = {},
): Promise<ProductionDashboardMetrics> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = DASHBOARD_PAGE_SIZE;
  const countryFilter = resolveCountryFilterCanonicalId(filters.countryId);
  const includeTest = filters.includeTestRecords === true;
  const hasPeriod = Boolean(filters.fromUtc || filters.toUtc);
  const classifiable: Classifiable[] = [];

  async function scanTrips(): Promise<{
    total: DashboardAggregateScanResult;
    completed: DashboardAggregateScanResult;
    cancelled: DashboardAggregateScanResult;
    active: DashboardAggregateScanResult;
  }> {
    try {
      let tripTotal = 0;
      let tripCompleted = 0;
      let tripCancelled = 0;
      let tripActive = 0;
      let tripExcluded = 0;
      let tripPages = 0;
      let tripTruncated = false;
      let cursor: string | null = null;
      while (tripPages < DASHBOARD_AGGREGATE_MAX_PAGES) {
        const page = await runtime.repos.trips.list(
          readCtx,
          {
            countryIds: countryFilter ? [countryFilter] : undefined,
            createdFromUtc: filters.fromUtc,
            createdToUtc: filters.toUtc,
            boundedLatestPage: !hasPeriod,
          },
          { limit, cursor },
        );
        tripPages += 1;
        for (const env of page.items) {
          const t = env.data;
          classifiable.push({ id: t.id, mappingStatus: t.mappingStatus });
          if (
            !includeRowInDashboardKpi(
              { id: t.id, mappingStatus: t.mappingStatus },
              includeTest,
            )
          ) {
            tripExcluded += 1;
            continue;
          }
          if (!tripPassesFilters(t, filters, hasPeriod)) continue;
          tripTotal += 1;
          const st = String(t.lifecycleStatus ?? "");
          if (st === "completed") tripCompleted += 1;
          else if (st.startsWith("cancelled") || st === "expired")
            tripCancelled += 1;
          else if (ACTIVE_TRIP_STATUSES.has(st)) tripActive += 1;
        }
        if (!page.nextCursor) {
          tripTruncated = false;
          break;
        }
        cursor = page.nextCursor;
        if (tripPages >= DASHBOARD_AGGREGATE_MAX_PAGES) tripTruncated = true;
      }
      const tripScan = finalizeAggregateCount({
        count: tripTotal,
        truncated: tripTruncated,
        pagesScanned: tripPages,
        excludedQaCount: tripExcluded,
      });
      const completed = tripTruncated
        ? tripScan
        : finalizeAggregateCount({
            count: tripCompleted,
            truncated: false,
            pagesScanned: tripPages,
            excludedQaCount: tripExcluded,
          });
      const cancelled = tripTruncated
        ? tripScan
        : finalizeAggregateCount({
            count: tripCancelled,
            truncated: false,
            pagesScanned: tripPages,
            excludedQaCount: tripExcluded,
          });
      const active = tripTruncated
        ? tripScan
        : finalizeAggregateCount({
            count: tripActive,
            truncated: false,
            pagesScanned: tripPages,
            excludedQaCount: tripExcluded,
          });
      return { total: tripScan, completed, cancelled, active };
    } catch {
      const u = unavailableScan();
      return { total: u, completed: u, cancelled: u, active: u };
    }
  }

  async function scanDrivers(): Promise<{
    active: DashboardAggregateScanResult;
    pending: DashboardAggregateScanResult;
  }> {
    try {
      let driverActive = 0;
      let driverPending = 0;
      let driverExcluded = 0;
      let driverPages = 0;
      let driverTruncated = false;
      let cursor: string | null = null;
      while (driverPages < DASHBOARD_AGGREGATE_MAX_PAGES) {
        const page = await runtime.repos.drivers.list(
          readCtx,
          { countryIds: countryFilter ? [countryFilter] : undefined },
          { limit, cursor },
        );
        driverPages += 1;
        for (const env of page.items) {
          const d = env.data;
          classifiable.push({ id: d.id, mappingStatus: d.mappingStatus });
          if (
            !includeRowInDashboardKpi(
              { id: d.id, mappingStatus: d.mappingStatus },
              includeTest,
            )
          ) {
            driverExcluded += 1;
            continue;
          }
          if (
            d.availabilityStatus === "available" ||
            d.availabilityStatus === "busy"
          ) {
            driverActive += 1;
          }
          if (d.registrationStatus === "pending_review") driverPending += 1;
        }
        if (!page.nextCursor) {
          driverTruncated = false;
          break;
        }
        cursor = page.nextCursor;
        if (driverPages >= DASHBOARD_AGGREGATE_MAX_PAGES)
          driverTruncated = true;
      }
      return {
        active: finalizeAggregateCount({
          count: driverActive,
          truncated: driverTruncated,
          pagesScanned: driverPages,
          excludedQaCount: driverExcluded,
        }),
        pending: finalizeAggregateCount({
          count: driverPending,
          truncated: driverTruncated,
          pagesScanned: driverPages,
          excludedQaCount: driverExcluded,
        }),
      };
    } catch {
      const u = unavailableScan();
      return { active: u, pending: u };
    }
  }

  async function scanCustomers(): Promise<DashboardAggregateScanResult> {
    try {
      let customerCount = 0;
      let customerExcluded = 0;
      let customerPages = 0;
      let customerTruncated = false;
      let cursor: string | null = null;
      while (customerPages < DASHBOARD_AGGREGATE_MAX_PAGES) {
        const page = await runtime.repos.customers.listSummary(
          readCtx,
          { countryIds: countryFilter ? [countryFilter] : undefined },
          { limit, cursor },
        );
        customerPages += 1;
        for (const env of page.items) {
          const c = env.data;
          if (c.isOperationalCustomer !== true) continue;
          if (
            c.mappingStatus === "excludedNonCustomer" ||
            c.mappingStatus === "excludedUnknownIdentity"
          ) {
            continue;
          }
          classifiable.push({ id: c.id, mappingStatus: c.mappingStatus });
          if (
            !includeRowInDashboardKpi(
              { id: c.id, mappingStatus: c.mappingStatus },
              includeTest,
            )
          ) {
            customerExcluded += 1;
            continue;
          }
          customerCount += 1;
        }
        if (!page.nextCursor) {
          customerTruncated = false;
          break;
        }
        cursor = page.nextCursor;
        if (customerPages >= DASHBOARD_AGGREGATE_MAX_PAGES)
          customerTruncated = true;
      }
      return finalizeAggregateCount({
        count: customerCount,
        truncated: customerTruncated,
        pagesScanned: customerPages,
        excludedQaCount: customerExcluded,
      });
    } catch {
      return unavailableScan();
    }
  }

  async function scanAgents(): Promise<DashboardAggregateScanResult> {
    try {
      let agentCount = 0;
      let agentExcluded = 0;
      let agentPages = 0;
      let agentTruncated = false;
      let cursor: string | null = null;
      while (agentPages < DASHBOARD_AGGREGATE_MAX_PAGES) {
        const page = await runtime.repos.agents.list(
          readCtx,
          { countryIds: countryFilter ? [countryFilter] : undefined },
          { limit, cursor },
        );
        agentPages += 1;
        for (const env of page.items) {
          const a = env.data;
          classifiable.push({ id: a.id, mappingStatus: a.mappingStatus });
          if (
            !includeRowInDashboardKpi(
              { id: a.id, mappingStatus: a.mappingStatus },
              includeTest,
            )
          ) {
            agentExcluded += 1;
            continue;
          }
          if (a.isOperationallyActive === true) agentCount += 1;
        }
        if (!page.nextCursor) {
          agentTruncated = false;
          break;
        }
        cursor = page.nextCursor;
        if (agentPages >= DASHBOARD_AGGREGATE_MAX_PAGES) agentTruncated = true;
      }
      return finalizeAggregateCount({
        count: agentCount,
        truncated: agentTruncated,
        pagesScanned: agentPages,
        excludedQaCount: agentExcluded,
      });
    } catch {
      return unavailableScan();
    }
  }

  async function scanCatalog(input: {
    fetch: (
      cursor: string | null,
    ) => Promise<{
      items: Array<{
        id: string;
        mappingStatus?: string | null;
        keep: boolean;
      }>;
      nextCursor: string | null;
    }>;
  }): Promise<DashboardAggregateScanResult> {
    let count = 0;
    let excluded = 0;
    let pages = 0;
    let truncated = false;
    let cursor: string | null = null;
    try {
      while (pages < DASHBOARD_AGGREGATE_MAX_PAGES) {
        const page = await input.fetch(cursor);
        pages += 1;
        for (const item of page.items) {
          classifiable.push({
            id: item.id,
            mappingStatus: item.mappingStatus,
          });
          if (
            !includeRowInDashboardKpi(
              { id: item.id, mappingStatus: item.mappingStatus },
              includeTest,
            )
          ) {
            excluded += 1;
            continue;
          }
          if (item.keep) count += 1;
        }
        if (!page.nextCursor) {
          truncated = false;
          break;
        }
        cursor = page.nextCursor;
        if (pages >= DASHBOARD_AGGREGATE_MAX_PAGES) truncated = true;
      }
      return finalizeAggregateCount({
        count,
        truncated,
        pagesScanned: pages,
        excludedQaCount: excluded,
      });
    } catch {
      return unavailableScan();
    }
  }

  async function scanSupport(): Promise<DashboardAggregateScanResult> {
    try {
      enforceLiveShadowResource(runtime.liveShadowAllowedResources, "support");
      const repo = new FirebaseProductionSupportReadRepository(runtime.client);
      const result = await repo.list({ scope: ctx.user.scope });
      let count = 0;
      let excluded = 0;
      for (const item of result.items) {
        classifiable.push({ id: item.id });
        if (!includeRowInDashboardKpi({ id: item.id }, includeTest)) {
          excluded += 1;
          continue;
        }
        if (item.status === "open" || item.status === "in_progress") count += 1;
      }
      return finalizeAggregateCount({
        count,
        truncated: result.truncated,
        pagesScanned: 1,
        excludedQaCount: excluded,
      });
    } catch {
      return unavailableScan();
    }
  }

  const [
    trips,
    drivers,
    customers,
    activeAgents,
    partners,
    guides,
    fleet,
    landmarks,
    supportOpen,
  ] = await Promise.all([
    scanTrips(),
    scanDrivers(),
    scanCustomers(),
    scanAgents(),
    scanCatalog({
      fetch: async (cursor) => {
        const page = await listPartnerLandmarks(runtime.client, {
          limit,
          cursor,
          countryId: countryFilter ?? undefined,
        });
        return {
          items: page.items.map((i) => ({
            id: i.partnerLandmarkId,
            keep: i.activeStatus === "active" || i.activeStatus === "unknown",
          })),
          nextCursor: page.nextCursor ?? null,
        };
      },
    }),
    scanCatalog({
      fetch: async (cursor) => {
        const page = await listTourGuides(runtime.client, {
          limit,
          cursor,
        });
        return {
          items: page.items.map((i) => ({
            id: i.sourceDocumentId,
            keep: i.status === "approved",
          })),
          nextCursor: page.nextCursor ?? null,
        };
      },
    }),
    scanCatalog({
      fetch: async (cursor) => {
        const page = await listFleetCompanies(runtime.client, {
          limit,
          cursor,
        });
        return {
          items: page.items
            .filter(
              (i) =>
                !countryFilter ||
                !i.countryId ||
                i.countryId === countryFilter,
            )
            .map((i) => ({
              id: i.sourceDocumentId,
              keep:
                i.activeStatus === "active" || i.activeStatus === "unknown",
            })),
          nextCursor: page.nextCursor ?? null,
        };
      },
    }),
    scanCatalog({
      fetch: async (cursor) => {
        const page = await runtime.repos.geography.listLandmarks(
          readCtx,
          {
            countryIds: countryFilter ? [countryFilter] : undefined,
            countryId: countryFilter ?? undefined,
          },
          { limit, cursor },
        );
        return {
          items: page.items.map((e) => ({
            id: e.data.id,
            mappingStatus: e.data.mappingStatus,
            keep: e.data.activeStatus === "active",
          })),
          nextCursor: page.nextCursor ?? null,
        };
      },
    }),
    scanSupport(),
  ]);

  // Dedupe classifiable snapshot after parallel scans (order not significant).
  const seen = new Set<string>();
  const uniqueClassifiable = classifiable.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  const kpiAccuracy: DashboardKpiAccuracyMap = {
    totalTrips: trips.total.meta,
    completedTrips: trips.completed.meta,
    cancelledTrips: trips.cancelled.meta,
    activeTrips: trips.active.meta,
    activeDrivers: drivers.active.meta,
    customers: customers.meta,
    pendingDrivers: drivers.pending.meta,
    activeAgents: activeAgents.meta,
    supportOpen: supportOpen.meta,
    partners: partners.meta,
    guides: guides.meta,
    fleet: fleet.meta,
    landmarks: landmarks.meta,
  };

  const allExact = Object.values(kpiAccuracy).every(
    (m) => m.accuracy === "exact",
  );
  const anyIncomplete = Object.values(kpiAccuracy).some(
    (m) => m.accuracy === "incomplete",
  );
  const allUnavailable = Object.values(kpiAccuracy).every(
    (m) => m.accuracy === "unavailable",
  );

  const qs = new URLSearchParams();
  if (countryFilter) qs.set("countryId", countryFilter);
  if (filters.currencyCode) qs.set("currencyCode", filters.currencyCode);
  if (filters.fromUtc) qs.set("from", filters.fromUtc);
  if (filters.toUtc) qs.set("to", filters.toUtc);
  const q = qs.toString();

  return {
    totalTrips: trips.total.value,
    completedTrips: trips.completed.value,
    cancelledTrips: trips.cancelled.value,
    activeTrips: trips.active.value,
    activeDrivers: drivers.active.value,
    customers: customers.value,
    pendingDrivers: drivers.pending.value,
    activeAgents: activeAgents.value,
    supportOpen: supportOpen.value,
    partners: partners.value,
    guides: guides.value,
    fleet: fleet.value,
    landmarks: landmarks.value,
    cashCollected: null,
    onlineCollected: null,
    platformCommission: null,
    currencyCode: filters.currencyCode?.toUpperCase() ?? null,
    filters,
    drilldowns: {
      trips: `/trips${q ? `?${q}` : ""}`,
      drivers: `/drivers${countryFilter ? `?countryId=${countryFilter}` : ""}`,
      completedTrips: `/trips?status=completed${countryFilter ? `&countryId=${countryFilter}` : ""}`,
      finance: `/finance${q ? `?${q}` : ""}`,
    },
    synthetic: false,
    financeSource: "fr7_reporting_read_service",
    boundedSampleLimit: DASHBOARD_PAGE_SIZE,
    metricsAvailability: allUnavailable
      ? "unavailable"
      : allExact
        ? "exact"
        : anyIncomplete
          ? "incomplete"
          : "exact",
    kpiAccuracy,
    sampleIncludesPilotOrTest: includeTest
      ? sampleIncludesPilotOrTest(uniqueClassifiable)
      : false,
    includeTestRecords: includeTest,
    sourceLabel: resolveAdminDataSourceLabel({
      productionFirestore: !allUnavailable,
      unavailable: allUnavailable,
      documentIds: uniqueClassifiable.map((r) => r.id),
    }),
  };
}
