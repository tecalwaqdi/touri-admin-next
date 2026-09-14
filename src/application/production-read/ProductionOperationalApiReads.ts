/**
 * Production operational API reads — WIF-native repos → UI list payloads.
 * Fail-closed: no synthetic fallback when Production read is armed.
 */

import {
  getProductionOperationalReadRuntime,
  isProductionOperationalReadArmed,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  mapCanonicalAgentToListItem,
  mapCanonicalCustomerToListItem,
  mapCanonicalDriverToListItem,
  mapCanonicalTripToListItem,
} from "@/application/production-read/mapCanonicalToListItems";
import {
  resolveAdminDataSourceLabel,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import type { DashboardFilters } from "@/application/dashboard/DashboardService";

function sourceMeta(
  documentIds: string[],
): AdminDataSourceLabelView & {
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  readMode: "shadow";
  transport: "wif_native";
} {
  const label = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds,
  });
  return {
    ...label,
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    readMode: "shadow",
    transport: "wif_native",
  };
}

function clampLimit(raw: number | undefined): number {
  const n = Number.isFinite(raw) ? Number(raw) : 20;
  return Math.min(Math.max(1, Math.floor(n)), WIF_NATIVE_MAX_READ_LIMIT);
}

export async function listProductionTripsApi(
  ctx: ApiActorContext,
  input: {
    pageSize?: number;
    cursor?: string | null;
    status?: string;
    countryId?: string;
    boundedLatestPage?: boolean;
  },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const page = await runtime.repos.trips.list(
    readCtx,
    {
      countryIds: input.countryId ? [input.countryId] : undefined,
      statusCodes: input.status ? [input.status] : undefined,
      boundedLatestPage: input.boundedLatestPage ?? true,
    },
    { limit, cursor: input.cursor ?? null },
  );
  const items = page.items.map((e) => mapCanonicalTripToListItem(e.data));
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    synthetic: false as const,
  };
}

export async function listProductionDriversApi(
  ctx: ApiActorContext,
  input: { pageSize?: number; cursor?: string | null; countryId?: string },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const page = await runtime.repos.drivers.list(
    readCtx,
    { countryIds: input.countryId ? [input.countryId] : undefined },
    { limit, cursor: input.cursor ?? null },
  );
  const items = page.items.map((e) => mapCanonicalDriverToListItem(e.data));
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    synthetic: false as const,
  };
}

export async function listProductionAgentsApi(
  ctx: ApiActorContext,
  input: { pageSize?: number; cursor?: string | null; countryId?: string },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const page = await runtime.repos.agents.list(
    readCtx,
    { countryIds: input.countryId ? [input.countryId] : undefined },
    { limit, cursor: input.cursor ?? null },
  );
  const items = page.items.map((e) => mapCanonicalAgentToListItem(e.data));
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    synthetic: false as const,
  };
}

export async function listProductionCustomersApi(
  ctx: ApiActorContext,
  input: { pageSize?: number; cursor?: string | null; countryId?: string },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const page = await runtime.repos.customers.listSummary(
    readCtx,
    { countryIds: input.countryId ? [input.countryId] : undefined },
    { limit, cursor: input.cursor ?? null },
  );
  const items = page.items.map((e) => mapCanonicalCustomerToListItem(e.data));
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    synthetic: false as const,
  };
}

export async function listProductionCountriesApi(ctx: ApiActorContext) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const [countriesPage, agentsPage] = await Promise.all([
    runtime.repos.geography.listCountries(
      readCtx,
      {},
      { limit: 20, cursor: null },
    ),
    runtime.repos.agents.list(readCtx, {}, { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null }),
  ]);

  const agents = agentsPage.items.map((e) => ({
    id: e.data.id,
    countryId: e.data.countryId.value ?? "",
    status: e.data.isOperationallyActive ? ("active" as const) : ("inactive" as const),
    name: e.data.displayName.value ?? e.data.id,
  }));
  const seedCheck = agentAssignmentPolicy.validateSeed(
    agents.map((a) => ({
      id: a.id,
      name: a.name,
      countryId: a.countryId,
      status: a.status,
      commissionPlaceholder: "—",
      driversCount: 0,
      tripsCount: 0,
      activeFromUtc: null,
      activeToUtc: null,
      createdAtUtc: "",
    })),
  );
  const violationSet = new Set(seedCheck.violations.map((v) => v.countryId));

  const byCountry = new Map<string, typeof agents>();
  for (const agent of agents) {
    if (!agent.countryId) continue;
    const list = byCountry.get(agent.countryId) ?? [];
    list.push(agent);
    byCountry.set(agent.countryId, list);
  }

  const items: CountryListItem[] = countriesPage.items.map((env) => {
    const countryId = env.data.id;
    const countryAgents = byCountry.get(countryId) ?? [];
    const active = countryAgents.filter((a) => a.status === "active");
    let invariant: CountryListItem["invariant"] = "no_active_agent";
    if (violationSet.has(countryId) || active.length > 1) {
      invariant = "fail_multiple_active";
    } else if (active.length === 1) {
      invariant = "pass";
    }
    return {
      countryId,
      activeAgentId: active[0]?.id ?? null,
      activeAgentName: active[0]?.name ?? null,
      inactiveAgentCount: countryAgents.filter((a) => a.status !== "active")
        .length,
      invariant,
      currencyHint: env.data.currencyCode,
    };
  });

  const meta = sourceMeta(items.map((i) => i.countryId));
  return {
    items,
    nextCursor: countriesPage.nextCursor,
    truncated: countriesPage.truncated,
    ...meta,
    synthetic: false as const,
  };
}

export type ProductionDashboardMetrics = {
  totalTrips: number | null;
  completedTrips: number | null;
  cancelledTrips: number | null;
  activeDrivers: number | null;
  customers: number | null;
  pendingDrivers: number | null;
  cashCollected: null;
  onlineCollected: null;
  platformCommission: null;
  currencyCode: string | null;
  filters: DashboardFilters;
  drilldowns: {
    trips: string;
    drivers: string;
    completedTrips: string;
    finance: string;
  };
  synthetic: false;
  financeSource: "fr7_reporting_read_service";
  boundedSampleLimit: typeof WIF_NATIVE_MAX_READ_LIMIT;
  metricsAvailability: "bounded_sample" | "unavailable";
  sourceLabel: AdminDataSourceLabelView;
};

/**
 * Production dashboard KPIs from bounded Production reads.
 * Never fabricates synthetic totals; never treats missing as zero via mock fallback.
 * Counts are from a ≤50 sample window (honest bounded sample).
 */
export async function getProductionDashboardMetrics(
  ctx: ApiActorContext,
  filters: DashboardFilters = {},
): Promise<ProductionDashboardMetrics> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = WIF_NATIVE_MAX_READ_LIMIT;

  const [tripsPage, driversPage, customersPage] = await Promise.all([
    runtime.repos.trips.list(
      readCtx,
      {
        countryIds: filters.countryId ? [filters.countryId] : undefined,
        boundedLatestPage: true,
      },
      { limit, cursor: null },
    ),
    runtime.repos.drivers.list(
      readCtx,
      { countryIds: filters.countryId ? [filters.countryId] : undefined },
      { limit, cursor: null },
    ),
    runtime.repos.customers.listSummary(
      readCtx,
      { countryIds: filters.countryId ? [filters.countryId] : undefined },
      { limit, cursor: null },
    ),
  ]);

  const trips = tripsPage.items.map((e) => e.data);
  const drivers = driversPage.items.map((e) => e.data);
  const completed = trips.filter((t) => t.lifecycleStatus === "completed").length;
  const cancelled = trips.filter((t) =>
    String(t.lifecycleStatus).startsWith("cancelled"),
  ).length;
  const activeDrivers = drivers.filter(
    (d) =>
      d.availabilityStatus === "available" || d.availabilityStatus === "busy",
  ).length;
  const pendingDrivers = drivers.filter(
    (d) => d.registrationStatus === "pending_review",
  ).length;

  const qs = new URLSearchParams();
  if (filters.countryId) qs.set("countryId", filters.countryId);
  if (filters.currencyCode) qs.set("currencyCode", filters.currencyCode);
  const q = qs.toString();

  const sourceLabel = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: [
      ...trips.map((t) => t.id),
      ...drivers.map((d) => d.id),
      ...customersPage.items.map((c) => c.data.id),
    ],
  });

  return {
    totalTrips: trips.length,
    completedTrips: completed,
    cancelledTrips: cancelled,
    activeDrivers,
    customers: customersPage.items.length,
    pendingDrivers,
    cashCollected: null,
    onlineCollected: null,
    platformCommission: null,
    currencyCode: filters.currencyCode?.toUpperCase() ?? null,
    filters,
    drilldowns: {
      trips: `/trips${q ? `?${q}` : ""}`,
      drivers: `/drivers${filters.countryId ? `?countryId=${filters.countryId}` : ""}`,
      completedTrips: `/trips?status=completed${filters.countryId ? `&countryId=${filters.countryId}` : ""}`,
      finance: `/finance${q ? `?${q}` : ""}`,
    },
    synthetic: false,
    financeSource: "fr7_reporting_read_service",
    boundedSampleLimit: WIF_NATIVE_MAX_READ_LIMIT,
    metricsAvailability: "bounded_sample",
    sourceLabel,
  };
}

export { isProductionOperationalReadArmed };
