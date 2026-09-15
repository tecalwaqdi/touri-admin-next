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
import type {
  AgentListItem,
  CustomerListItem,
  DriverListItem,
  TripListItem,
} from "@/application/production-read/listDtos";
import {
  resolveAdminDataSourceLabel,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import { sampleIncludesPilotOrTest } from "@/domain/production-read/RecordClassification";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import type { DashboardFilters } from "@/application/dashboard/DashboardService";
import {
  boundedSampleKpiMeta,
  type DashboardKpiAccuracyMap,
} from "@/domain/dashboard/KpiAccuracy";
import {
  buildGeographyCountryPresentation,
  diagnoseDuplicateActiveAgents,
  diagnoseSuspiciousActiveAgent,
  geographyCountryBucketKey,
} from "@/domain/geography/GeographyPresentation";
import { resolveCountryFilterCanonicalId } from "@/domain/geography/CountryOption";

export type OperationalListMeta = {
  paginationMode: "cursor" | "bounded_page";
  maxPageSize: typeof WIF_NATIVE_MAX_READ_LIMIT;
  searchScope: "none" | "loaded_page" | "server";
  pageFilterScope: "server" | "loaded_page" | "mixed";
  bounded: true;
};

function listMeta(partial: Partial<OperationalListMeta> = {}): OperationalListMeta {
  return {
    paginationMode: "cursor",
    maxPageSize: WIF_NATIVE_MAX_READ_LIMIT,
    searchScope: "none",
    pageFilterScope: "server",
    bounded: true,
    ...partial,
  };
}

function matchesLoadedSearch(
  haystacks: Array<string | null | undefined>,
  search: string | undefined,
): boolean {
  if (!search?.trim()) return true;
  const q = search.trim().toLowerCase();
  return haystacks.some((h) => (h ?? "").toLowerCase().includes(q));
}

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
    cityId?: string;
    paymentMethod?: string;
    search?: string;
    boundedLatestPage?: boolean;
  },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const countryFilter = resolveCountryFilterCanonicalId(input.countryId);
  const page = await runtime.repos.trips.list(
    readCtx,
    {
      countryIds: countryFilter ? [countryFilter] : undefined,
      cityIds: input.cityId ? [input.cityId] : undefined,
      statusCodes: input.status ? [input.status] : undefined,
      boundedLatestPage: input.boundedLatestPage ?? true,
    },
    { limit, cursor: input.cursor ?? null },
  );
  let items: TripListItem[] = page.items.map((e) =>
    mapCanonicalTripToListItem(e.data),
  );
  let pageFilterScope: OperationalListMeta["pageFilterScope"] = "server";
  if (input.paymentMethod) {
    const pm = input.paymentMethod.toLowerCase();
    items = items.filter((i) => (i.paymentMethod ?? "").toLowerCase() === pm);
    pageFilterScope = "mixed";
  }
  if (input.search?.trim()) {
    items = items.filter((i) =>
      matchesLoadedSearch([i.id, i.customerId, i.driverId, i.agentId], input.search),
    );
    pageFilterScope = "mixed";
  }
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    ...listMeta({
      searchScope: input.search?.trim() ? "loaded_page" : "none",
      pageFilterScope,
    }),
    synthetic: false as const,
  };
}

export async function listProductionDriversApi(
  ctx: ApiActorContext,
  input: {
    pageSize?: number;
    cursor?: string | null;
    countryId?: string;
    cityId?: string;
    registrationStatus?: string;
    availabilityStatus?: string;
    search?: string;
  },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const countryFilter = resolveCountryFilterCanonicalId(input.countryId);
  const onlineFilter =
    input.availabilityStatus === "online" ||
    input.availabilityStatus === "available"
      ? true
      : input.availabilityStatus === "offline"
        ? false
        : undefined;
  const page = await runtime.repos.drivers.list(
    readCtx,
    {
      countryIds: countryFilter ? [countryFilter] : undefined,
      cityIds: input.cityId ? [input.cityId] : undefined,
      online: onlineFilter,
    },
    { limit, cursor: input.cursor ?? null },
  );
  let items: DriverListItem[] = page.items.map((e) =>
    mapCanonicalDriverToListItem(e.data),
  );
  let pageFilterScope: OperationalListMeta["pageFilterScope"] = "server";
  if (input.registrationStatus) {
    items = items.filter(
      (i) => i.registrationStatus === input.registrationStatus,
    );
    pageFilterScope = "mixed";
  }
  if (
    input.availabilityStatus &&
    input.availabilityStatus !== "online" &&
    input.availabilityStatus !== "offline" &&
    input.availabilityStatus !== "available"
  ) {
    items = items.filter(
      (i) => i.availabilityStatus === input.availabilityStatus,
    );
    pageFilterScope = "mixed";
  }
  if (input.search?.trim()) {
    items = items.filter((i) =>
      matchesLoadedSearch([i.id, i.displayName, i.vehicleSummary], input.search),
    );
    pageFilterScope = "mixed";
  }
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    ...listMeta({
      searchScope: input.search?.trim() ? "loaded_page" : "none",
      pageFilterScope,
    }),
    synthetic: false as const,
  };
}

export async function listProductionAgentsApi(
  ctx: ApiActorContext,
  input: {
    pageSize?: number;
    cursor?: string | null;
    countryId?: string;
    status?: string;
    search?: string;
  },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const countryFilter = resolveCountryFilterCanonicalId(input.countryId);
  const page = await runtime.repos.agents.list(
    readCtx,
    { countryIds: countryFilter ? [countryFilter] : undefined },
    { limit, cursor: input.cursor ?? null },
  );
  let items: AgentListItem[] = page.items.map((e) =>
    mapCanonicalAgentToListItem(e.data),
  );
  let pageFilterScope: OperationalListMeta["pageFilterScope"] = "server";
  if (input.status === "active" || input.status === "inactive") {
    items = items.filter((i) => i.status === input.status);
    pageFilterScope = "mixed";
  }
  if (input.search?.trim()) {
    items = items.filter((i) =>
      matchesLoadedSearch(
        [i.id, i.displayName, i.countryId, i.countryDisplayName],
        input.search,
      ),
    );
    pageFilterScope = "mixed";
  }
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    ...listMeta({
      searchScope: input.search?.trim() ? "loaded_page" : "none",
      pageFilterScope,
    }),
    synthetic: false as const,
  };
}

export async function listProductionCustomersApi(
  ctx: ApiActorContext,
  input: {
    pageSize?: number;
    cursor?: string | null;
    countryId?: string;
    cityId?: string;
    accountState?: string;
    search?: string;
  },
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const limit = clampLimit(input.pageSize);
  const countryFilter = resolveCountryFilterCanonicalId(input.countryId);
  const page = await runtime.repos.customers.listSummary(
    readCtx,
    {
      countryIds: countryFilter ? [countryFilter] : undefined,
      cityIds: input.cityId ? [input.cityId] : undefined,
    },
    { limit, cursor: input.cursor ?? null },
  );
  let items: CustomerListItem[] = page.items.map((e) =>
    mapCanonicalCustomerToListItem(e.data),
  );
  let pageFilterScope: OperationalListMeta["pageFilterScope"] = "server";
  if (input.accountState) {
    items = items.filter((i) => i.accountState === input.accountState);
    pageFilterScope = "mixed";
  }
  if (input.search?.trim()) {
    items = items.filter((i) =>
      matchesLoadedSearch(
        [i.id, i.displayName, i.emailHint, i.phoneHint],
        input.search,
      ),
    );
    pageFilterScope = "mixed";
  }
  const meta = sourceMeta(items.map((i) => i.id));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: limit,
    totalPages: 1,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...meta,
    ...listMeta({
      searchScope: input.search?.trim() ? "loaded_page" : "none",
      pageFilterScope,
    }),
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
      { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
    ),
    runtime.repos.agents.list(readCtx, {}, { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null }),
  ]);

  const agents = agentsPage.items.map((e) => ({
    id: e.data.id,
    countryId: e.data.countryId.value ?? "",
    bucket: geographyCountryBucketKey(e.data.countryId.value ?? ""),
    status: e.data.isOperationallyActive ? ("active" as const) : ("inactive" as const),
    name: e.data.displayName.value ?? null,
    authoritativeRole: e.data.authoritativeRole,
    isOperationalAgent: e.data.isOperationalAgent,
    mappingStatus: e.data.mappingStatus,
  }));
  const seedAgents = agents.map((a) => ({
    id: a.id,
    name: a.name ?? a.id,
    countryId: a.bucket || a.countryId,
    status: a.status,
    commissionPlaceholder: "—",
    driversCount: 0,
    tripsCount: 0,
    activeFromUtc: null,
    activeToUtc: null,
    createdAtUtc: "",
  }));
  const seedCheck = agentAssignmentPolicy.validateSeed(seedAgents);
  const violationBuckets = new Set(
    seedCheck.violations.map((v) => geographyCountryBucketKey(v.countryId)),
  );

  const byCountry = new Map<string, typeof agents>();
  for (const agent of agents) {
    if (!agent.countryId) continue;
    const list = byCountry.get(agent.bucket) ?? [];
    list.push(agent);
    byCountry.set(agent.bucket, list);
  }

  const items: CountryListItem[] = countriesPage.items.map((env) => {
    const countryId = env.data.id;
    const liveName = env.data.name?.trim() ? env.data.name : null;
    const presentation = buildGeographyCountryPresentation({
      countryId,
      liveName,
    });
    const bucket = geographyCountryBucketKey(countryId);
    const countryAgents = byCountry.get(bucket) ?? [];
    const active = countryAgents.filter((a) => a.status === "active");
    let invariant: CountryListItem["invariant"] = "no_active_agent";
    if (violationBuckets.has(bucket) || active.length > 1) {
      invariant = "fail_multiple_active";
    } else if (active.length === 1) {
      invariant = "pass";
    }
    const warnings = [...presentation.warnings];
    const dup = diagnoseDuplicateActiveAgents(active.length);
    if (dup) warnings.push(dup);
    if (active.length === 1) {
      const suspicious = diagnoseSuspiciousActiveAgent({
        agentName: active[0]?.name,
        authoritativeRole: active[0]?.authoritativeRole,
        isOperationalAgent: active[0]?.isOperationalAgent,
        mappingStatus: active[0]?.mappingStatus,
      });
      if (suspicious) warnings.push(suspicious);
    }
    return {
      countryId,
      displayName: presentation.displayName,
      canonicalCountryId: presentation.canonicalCountryId,
      activeAgentId: active[0]?.id ?? null,
      // Never fabricate — fall back to id only for link label when name missing
      activeAgentName: active[0]?.name ?? active[0]?.id ?? null,
      inactiveAgentCount: countryAgents.filter((a) => a.status !== "active")
        .length,
      invariant,
      currencyHint: env.data.currencyCode ?? null,
      dataQualityWarnings: warnings,
      testOrNoncanonical: presentation.testOrNoncanonical,
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
  /** Per-KPI accuracy — never claim exact total for sample counts. */
  kpiAccuracy: DashboardKpiAccuracyMap;
  sampleIncludesPilotOrTest: boolean;
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

  const countryFilter = resolveCountryFilterCanonicalId(filters.countryId);
  const [tripsPage, driversPage, customersPage] = await Promise.all([
    runtime.repos.trips.list(
      readCtx,
      {
        countryIds: countryFilter ? [countryFilter] : undefined,
        boundedLatestPage: true,
      },
      { limit, cursor: null },
    ),
    runtime.repos.drivers.list(
      readCtx,
      { countryIds: countryFilter ? [countryFilter] : undefined },
      { limit, cursor: null },
    ),
    runtime.repos.customers.listSummary(
      readCtx,
      { countryIds: countryFilter ? [countryFilter] : undefined },
      { limit, cursor: null },
    ),
  ]);

  const trips = tripsPage.items.map((e) => e.data);
  const drivers = driversPage.items.map((e) => e.data);
  const customers = customersPage.items.map((e) => e.data);
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
  if (countryFilter) qs.set("countryId", countryFilter);
  if (filters.currencyCode) qs.set("currencyCode", filters.currencyCode);
  const q = qs.toString();

  const classifiable = [
    ...trips.map((t) => ({
      id: t.id,
      mappingStatus: t.mappingStatus,
    })),
    ...drivers.map((d) => ({
      id: d.id,
      mappingStatus: d.mappingStatus,
    })),
    ...customers.map((c) => ({
      id: c.id,
      mappingStatus: c.mappingStatus,
    })),
  ];
  const includesPilot = sampleIncludesPilotOrTest(classifiable);

  const sourceLabel = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: classifiable.map((r) => r.id),
  });

  const sampleMeta = boundedSampleKpiMeta({
    sampleLimit: limit,
    truncated:
      tripsPage.truncated || driversPage.truncated || customersPage.truncated,
    includesPilotOrTest: includesPilot,
  });
  const kpiAccuracy: DashboardKpiAccuracyMap = {
    totalTrips: sampleMeta,
    completedTrips: sampleMeta,
    cancelledTrips: sampleMeta,
    activeDrivers: sampleMeta,
    customers: sampleMeta,
    pendingDrivers: sampleMeta,
  };

  return {
    totalTrips: trips.length,
    completedTrips: completed,
    cancelledTrips: cancelled,
    activeDrivers,
    customers: customers.length,
    pendingDrivers,
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
    boundedSampleLimit: WIF_NATIVE_MAX_READ_LIMIT,
    metricsAvailability: "bounded_sample",
    kpiAccuracy,
    sampleIncludesPilotOrTest: includesPilot,
    sourceLabel,
  };
}

export { isProductionOperationalReadArmed };
