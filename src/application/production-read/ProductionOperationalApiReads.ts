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
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import type { DashboardFilters } from "@/application/dashboard/DashboardService";
import type { DashboardKpiAccuracyMap } from "@/domain/dashboard/KpiAccuracy";
import { resolveCountryFilterCanonicalId } from "@/domain/geography/CountryOption";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import { computeProductionDashboardAggregates } from "@/application/production-read/ProductionDashboardAggregates";
import { enrichTripListParties } from "@/application/production-read/enrichTripListParties";

export { listProductionCountriesApi } from "@/application/production-read/ProductionGeographyApiReads";

/**
 * Customer list/detail invariant: only operational customers are listable.
 * Shared `user` collection rows that are agent/driver/admin/unknown are excluded
 * so every list item.id resolves via GET /api/customers/{id}.
 */
export function isListableOperationalCustomer(
  model: Pick<
    CanonicalCustomerReadModel,
    "isOperationalCustomer" | "mappingStatus"
  >,
): boolean {
  if (model.isOperationalCustomer !== true) return false;
  if (
    model.mappingStatus === "excludedNonCustomer" ||
    model.mappingStatus === "excludedUnknownIdentity"
  ) {
    return false;
  }
  return true;
}

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
  items = await enrichTripListParties(ctx, items);
  let pageFilterScope: OperationalListMeta["pageFilterScope"] = "server";
  if (input.paymentMethod) {
    const pm = input.paymentMethod.toLowerCase();
    items = items.filter((i) => (i.paymentMethod ?? "").toLowerCase() === pm);
    pageFilterScope = "mixed";
  }
  if (input.search?.trim()) {
    items = items.filter((i) =>
      matchesLoadedSearch(
        [
          i.id,
          i.customerId,
          i.customerDisplayName,
          i.driverId,
          i.driverDisplayName,
          i.agentId,
          i.pickupLandmarkName,
          i.destinationLandmarkName,
        ],
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
  let items: CustomerListItem[] = page.items
    .filter((e) => isListableOperationalCustomer(e.data))
    .map((e) => mapCanonicalCustomerToListItem(e.data));
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

export type ProductionDashboardMetrics = {
  totalTrips: number | null;
  completedTrips: number | null;
  cancelledTrips: number | null;
  activeTrips: number | null;
  activeDrivers: number | null;
  customers: number | null;
  pendingDrivers: number | null;
  activeAgents: number | null;
  supportOpen: number | null;
  partners: number | null;
  guides: number | null;
  fleet: number | null;
  landmarks: number | null;
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
  metricsAvailability: "exact" | "incomplete" | "unavailable" | "bounded_sample";
  /** Per-KPI accuracy — never claim exact total for incomplete scans. */
  kpiAccuracy: DashboardKpiAccuracyMap;
  sampleIncludesPilotOrTest: boolean;
  includeTestRecords?: boolean;
  sourceLabel: AdminDataSourceLabelView;
  /** Progressive load group when requested via ?group=. */
  dashboardGroup?: "core" | "extended" | "all";
  /** Per-source wall timings (ms) for ops profiling. */
  sourceTimingsMs?: Record<string, number>;
};

/**
 * Production dashboard KPIs from server-side counts + count-gated scans.
 * Never fabricates synthetic totals; never treats missing as zero via mock fallback.
 * Incomplete when the scan budget/deadline is exhausted — value is null (not a partial total).
 */
export async function getProductionDashboardMetrics(
  ctx: ApiActorContext,
  filters: DashboardFilters = {},
  options?: { group?: "core" | "extended" | "all" },
): Promise<ProductionDashboardMetrics> {
  return computeProductionDashboardAggregates(ctx, filters, options);
}

export { isProductionOperationalReadArmed };
