/**
 * Production dashboard aggregates — server-side counts + count-gated scans.
 * Exact when a source finishes within budget; null + incomplete when truncated
 * or deadline exceeded. Never presents a ≤50 sample page as an authoritative total.
 *
 * Progressive groups:
 * - core: trips + drivers (critical ops)
 * - extended: customers, agents, catalog, support
 * - all: both (backward compatible)
 *
 * A slow optional source must not block the entire KPI area.
 */

import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import {
  DASHBOARD_AGGREGATE_MAX_PAGES,
  DASHBOARD_COUNT_SCAN_MAX_DOCS,
  DASHBOARD_PAGE_SIZE,
  DASHBOARD_SOURCE_DEADLINE_MS,
  finalizeAggregateCount,
  type DashboardAggregateScanResult,
} from "@/domain/dashboard/DashboardAggregateScan";
import { includeRowInDashboardKpi } from "@/domain/dashboard/DashboardQaPolicy";
import {
  DASHBOARD_CORE_KPI_KEYS,
  DASHBOARD_EXTENDED_KPI_KEYS,
  exactKpiMeta,
  type DashboardKpiAccuracyMap,
  type DashboardOpsKpiKey,
} from "@/domain/dashboard/KpiAccuracy";
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
import type { FirestoreQueryFilter } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { tripWindowBoundToFirestoreDate, PHASE_4A4_TRIP_TIMESTAMP_FIELD } from "@/infrastructure/production/repositories/FirebaseProductionTripReadRepository";

const ACTIVE_TRIP_STATUSES = new Set([
  "pending_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "trip_started",
  "trip_in_progress",
]);

const COMPLETED_STATUS_CODES = ["completed", "trip_completed"] as const;
const CANCELLED_STATUS_CODES = [
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_admin",
  "cancelled",
  "canceled",
  "expired",
] as const;
const ACTIVE_STATUS_CODES = [
  "pending_driver",
  "awaiting_driver",
  "pending",
  "payment_pending",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "trip_started",
  "trip_in_progress",
] as const;

export type DashboardAggregateGroup = "core" | "extended" | "all";

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

function incompleteScan(pagesScanned = 0): DashboardAggregateScanResult {
  return finalizeAggregateCount({
    count: 0,
    truncated: true,
    pagesScanned,
    excludedQaCount: 0,
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

function tripDateFilters(filters: DashboardFilters): FirestoreQueryFilter[] {
  if (!filters.fromUtc && !filters.toUtc) return [];
  const out: FirestoreQueryFilter[] = [];
  if (filters.fromUtc) {
    out.push({
      field: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
      op: ">=",
      value: tripWindowBoundToFirestoreDate(filters.fromUtc),
    });
  }
  if (filters.toUtc) {
    out.push({
      field: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
      op: "<=",
      value: tripWindowBoundToFirestoreDate(filters.toUtc),
    });
  }
  return out;
}

async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function timed<T>(
  timings: Record<string, number>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    return await work();
  } finally {
    timings[key] = Date.now() - t0;
  }
}

export async function computeProductionDashboardAggregates(
  ctx: ApiActorContext,
  filters: DashboardFilters = {},
  options: { group?: DashboardAggregateGroup } = {},
): Promise<ProductionDashboardMetrics & {
  dashboardGroup: DashboardAggregateGroup;
  sourceTimingsMs: Record<string, number>;
}> {
  const group: DashboardAggregateGroup = options.group ?? "all";
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = DASHBOARD_PAGE_SIZE;
  const countryFilter = resolveCountryFilterCanonicalId(filters.countryId);
  const includeTest = filters.includeTestRecords === true;
  const hasPeriod = Boolean(filters.fromUtc || filters.toUtc);
  const needsTripPostMap = Boolean(countryFilter || filters.currencyCode);
  const classifiable: Classifiable[] = [];
  const timings: Record<string, number> = {};
  const maxScanPages = Math.ceil(
    DASHBOARD_COUNT_SCAN_MAX_DOCS / DASHBOARD_PAGE_SIZE,
  );

  async function serverCount(
    collection: string,
    countFilters: FirestoreQueryFilter[] = [],
  ): Promise<number | null> {
    if (typeof runtime.client.count !== "function") return null;
    try {
      return await runtime.client.count({
        collection,
        filters: countFilters,
      });
    } catch {
      return null;
    }
  }

  async function scanTrips(): Promise<{
    total: DashboardAggregateScanResult;
    completed: DashboardAggregateScanResult;
    cancelled: DashboardAggregateScanResult;
    active: DashboardAggregateScanResult;
  }> {
    return withDeadline(
      (async () => {
        // Fast path: no country/currency post-map — count-gate then QA scan if small.
        if (!needsTripPostMap) {
          const dateFilters = tripDateFilters(filters);
          const totalCount = await serverCount("order", dateFilters);
          if (totalCount != null && totalCount <= DASHBOARD_COUNT_SCAN_MAX_DOCS) {
            // Fall through to bounded scan below (exact + QA).
          } else if (totalCount != null && totalCount > DASHBOARD_COUNT_SCAN_MAX_DOCS) {
            // Too large for QA-aware page scan — use status aggregation counts.
            // QA id/mapping exclusion is not expressible in Firestore filters; residual
            // pilot/test docs matching equality filters may be included (reported).
            const [completedN, cancelledN, activeN] = await Promise.all([
              serverCount("order", [
                ...dateFilters,
                { field: "status_code", op: "in", value: [...COMPLETED_STATUS_CODES] },
              ]),
              serverCount("order", [
                ...dateFilters,
                { field: "status_code", op: "in", value: [...CANCELLED_STATUS_CODES] },
              ]),
              serverCount("order", [
                ...dateFilters,
                { field: "status_code", op: "in", value: [...ACTIVE_STATUS_CODES] },
              ]),
            ]);
            const exactFromCount = (n: number | null) =>
              n == null
                ? unavailableScan()
                : {
                    value: n,
                    truncated: false,
                    pagesScanned: 0,
                    excludedQaCount: 0,
                    meta: exactKpiMeta(),
                  };
            return {
              total: exactFromCount(totalCount),
              completed: exactFromCount(completedN),
              cancelled: exactFromCount(cancelledN),
              active: exactFromCount(activeN),
            };
          } else if (totalCount === 0) {
            const z = finalizeAggregateCount({
              count: 0,
              truncated: false,
              pagesScanned: 0,
              excludedQaCount: 0,
            });
            return { total: z, completed: z, cancelled: z, active: z };
          }
        }

        let tripTotal = 0;
        let tripCompleted = 0;
        let tripCancelled = 0;
        let tripActive = 0;
        let tripExcluded = 0;
        let tripPages = 0;
        let tripTruncated = false;
        let cursor: string | null = null;
        const pageBudget = Math.min(
          DASHBOARD_AGGREGATE_MAX_PAGES,
          maxScanPages,
        );
        while (tripPages < pageBudget) {
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
          if (tripPages >= pageBudget) tripTruncated = true;
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
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => {
        const u = incompleteScan();
        return { total: u, completed: u, cancelled: u, active: u };
      },
    );
  }

  async function scanDrivers(): Promise<{
    active: DashboardAggregateScanResult;
    pending: DashboardAggregateScanResult;
  }> {
    return withDeadline(
      (async () => {
        const driverTotal = await serverCount("user", [
          { field: "ismndob", op: "==", value: true },
        ]);
        if (driverTotal != null && driverTotal > DASHBOARD_COUNT_SCAN_MAX_DOCS) {
          return {
            active: incompleteScan(0),
            pending: incompleteScan(0),
          };
        }
        let driverActive = 0;
        let driverPending = 0;
        let driverExcluded = 0;
        let driverPages = 0;
        let driverTruncated = false;
        let cursor: string | null = null;
        const pageBudget = Math.min(
          DASHBOARD_AGGREGATE_MAX_PAGES,
          maxScanPages,
        );
        while (driverPages < pageBudget) {
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
          if (driverPages >= pageBudget) driverTruncated = true;
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
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => {
        const u = incompleteScan();
        return { active: u, pending: u };
      },
    );
  }

  async function scanCustomers(): Promise<DashboardAggregateScanResult> {
    return withDeadline(
      (async () => {
        const userTotal = await serverCount("user", []);
        if (userTotal == null) return unavailableScan();
        if (userTotal > DASHBOARD_COUNT_SCAN_MAX_DOCS) {
          // No positive customer discriminator — cannot count without full scan.
          return incompleteScan(0);
        }
        let customerCount = 0;
        let customerExcluded = 0;
        let customerPages = 0;
        let customerTruncated = false;
        let cursor: string | null = null;
        const pageBudget = Math.min(
          DASHBOARD_AGGREGATE_MAX_PAGES,
          maxScanPages,
        );
        while (customerPages < pageBudget) {
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
          if (customerPages >= pageBudget) customerTruncated = true;
        }
        return finalizeAggregateCount({
          count: customerCount,
          truncated: customerTruncated,
          pagesScanned: customerPages,
          excludedQaCount: customerExcluded,
        });
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => incompleteScan(),
    );
  }

  async function scanAgents(): Promise<DashboardAggregateScanResult> {
    return withDeadline(
      (async () => {
        const agentTotal = await serverCount("user", [
          { field: "Isagent", op: "==", value: true },
        ]);
        if (agentTotal != null && agentTotal > DASHBOARD_COUNT_SCAN_MAX_DOCS) {
          return incompleteScan(0);
        }
        let agentCount = 0;
        let agentExcluded = 0;
        let agentPages = 0;
        let agentTruncated = false;
        let cursor: string | null = null;
        const pageBudget = Math.min(
          DASHBOARD_AGGREGATE_MAX_PAGES,
          maxScanPages,
        );
        while (agentPages < pageBudget) {
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
          if (agentPages >= pageBudget) agentTruncated = true;
        }
        return finalizeAggregateCount({
          count: agentCount,
          truncated: agentTruncated,
          pagesScanned: agentPages,
          excludedQaCount: agentExcluded,
        });
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => incompleteScan(),
    );
  }

  async function scanCatalog(input: {
    name: string;
    countFilters?: FirestoreQueryFilter[];
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
    return withDeadline(
      (async () => {
        const n = await serverCount(
          input.name === "partners" || input.name === "landmarks"
            ? "mkan"
            : input.name === "fleet"
              ? "transport_company"
              : input.name === "guides"
                ? "user"
                : "mkan",
          input.countFilters ?? [],
        );
        if (n != null && n > DASHBOARD_COUNT_SCAN_MAX_DOCS) {
          return incompleteScan(0);
        }
        let count = 0;
        let excluded = 0;
        let pages = 0;
        let truncated = false;
        let cursor: string | null = null;
        const pageBudget = Math.min(
          DASHBOARD_AGGREGATE_MAX_PAGES,
          maxScanPages,
        );
        while (pages < pageBudget) {
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
          if (pages >= pageBudget) truncated = true;
        }
        return finalizeAggregateCount({
          count,
          truncated,
          pagesScanned: pages,
          excludedQaCount: excluded,
        });
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => incompleteScan(),
    );
  }

  async function scanSupport(): Promise<DashboardAggregateScanResult> {
    return withDeadline(
      (async () => {
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
      })(),
      DASHBOARD_SOURCE_DEADLINE_MS,
      () => incompleteScan(),
    );
  }

  const runCore = group === "core" || group === "all";
  const runExtended = group === "extended" || group === "all";

  const pending = unavailableScan();

  let trips = {
    total: pending,
    completed: pending,
    cancelled: pending,
    active: pending,
  };
  let drivers = { active: pending, pending: pending };
  let customers = pending;
  let activeAgents = pending;
  let partners = pending;
  let guides = pending;
  let fleet = pending;
  let landmarks = pending;
  let supportOpen = pending;

  const tasks: Promise<void>[] = [];

  if (runCore) {
    tasks.push(
      timed(timings, "trips", async () => {
        trips = await scanTrips();
      }),
    );
    tasks.push(
      timed(timings, "drivers", async () => {
        drivers = await scanDrivers();
      }),
    );
  }
  if (runExtended) {
    tasks.push(
      timed(timings, "customers", async () => {
        customers = await scanCustomers();
      }),
    );
    tasks.push(
      timed(timings, "agents", async () => {
        activeAgents = await scanAgents();
      }),
    );
    tasks.push(
      timed(timings, "partners", async () => {
        partners = await scanCatalog({
          name: "partners",
          countFilters: [{ field: "isShrek", op: "==", value: true }],
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
        });
      }),
    );
    tasks.push(
      timed(timings, "guides", async () => {
        guides = await scanCatalog({
          name: "guides",
          countFilters: [{ field: "is_tour_guide", op: "==", value: true }],
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
        });
      }),
    );
    tasks.push(
      timed(timings, "fleet", async () => {
        fleet = await scanCatalog({
          name: "fleet",
          countFilters: [],
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
        });
      }),
    );
    tasks.push(
      timed(timings, "landmarks", async () => {
        landmarks = await scanCatalog({
          name: "landmarks",
          countFilters: [],
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
        });
      }),
    );
    tasks.push(
      timed(timings, "support", async () => {
        supportOpen = await scanSupport();
      }),
    );
  }

  await Promise.all(tasks);

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

  const consideredKeys: DashboardOpsKpiKey[] =
    group === "core"
      ? [...DASHBOARD_CORE_KPI_KEYS]
      : group === "extended"
        ? [...DASHBOARD_EXTENDED_KPI_KEYS]
        : [...DASHBOARD_CORE_KPI_KEYS, ...DASHBOARD_EXTENDED_KPI_KEYS];

  const considered = consideredKeys.map((k) => kpiAccuracy[k]);
  const allExact = considered.every((m) => m.accuracy === "exact");
  const anyIncomplete = considered.some((m) => m.accuracy === "incomplete");
  const allUnavailable = considered.every((m) => m.accuracy === "unavailable");

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
    dashboardGroup: group,
    sourceTimingsMs: timings,
  };
}
