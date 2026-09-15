/**
 * PC-6 — Production geography list/detail/DQ reads (WIF-native, read-only).
 * No N+1 fan-out for city/landmark counts. Related detail reads ≤20.
 */

import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import {
  resolveAdminDataSourceLabel,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import {
  buildGeographyCountryPresentation,
  geographyCountryBucketKey,
  resolveCountryDisplayName,
} from "@/domain/geography/GeographyPresentation";
import { classifyCountryIdentity } from "@/domain/geography/CountryIdentityClassification";
import { auditCountryCurrencyAlignment } from "@/domain/geography/CurrencyAlignment";
import { diagnoseCountryAgentInvariant } from "@/domain/geography/CountryAgentInvariant";
import {
  detectCityDataQualityIssues,
  detectDuplicateCityNamesInCountry,
} from "@/domain/geography/CityDataQuality";
import { detectLandmarkDataQualityIssues } from "@/domain/geography/LandmarkDataQuality";
import { classifyGeographyRecordClass } from "@/domain/geography/GeographyRecordClass";
import {
  buildGeographyDqSummary,
  type GeographyDqSummary,
} from "@/domain/geography/GeographyDqSummary";
import {
  maxGeographyDqSeverity,
  geographyDqSeverityMeetsMinimum,
  type GeographyDqIssue,
  type GeographyDqSeverity,
} from "@/domain/geography/GeographyDataQuality";
import { resolveCountryFilterCanonicalId } from "@/domain/geography/CountryOption";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import {
  assertDetailResourceInScope,
  PRODUCTION_DETAIL_RELATED_READ_LIMIT,
} from "@/application/production-read/detailScope";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";
import type { CountryListItem } from "@/application/geography/CountriesReadService";
import {
  UNAVAILABLE_COUNT,
  type GeographyCityDetail,
  type GeographyCityListItem,
  type GeographyCountryDetail,
  type GeographyCountryListItem,
  type GeographyLandmarkDetail,
  type GeographyLandmarkListItem,
} from "@/application/geography/geographyListDtos";
import type { CanonicalCityReadModel } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { CanonicalLandmarkReadModel } from "@/infrastructure/production/contracts/ProductionReadRepositories";

function sourceMeta(
  documentIds: string[],
): AdminDataSourceLabelView & {
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  readMode: "shadow";
  transport: "wif_native";
} {
  const view = resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds,
  });
  return {
    ...view,
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    readMode: "shadow",
    transport: "wif_native",
  };
}

function listMeta() {
  return {
    paginationMode: "cursor" as const,
    maxPageSize: WIF_NATIVE_MAX_READ_LIMIT,
    searchScope: "none" as const,
    pageFilterScope: "server" as const,
    bounded: true as const,
  };
}

function clampLimit(raw: string | null): number {
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(1, Math.floor(n)), WIF_NATIVE_MAX_READ_LIMIT);
}

type AgentRow = {
  id: string;
  countryId: string;
  bucket: string;
  status: "active" | "inactive";
  name: string | null;
  authoritativeRole: string;
  isOperationalAgent: boolean;
  mappingStatus: string;
};

async function loadAgentsByBucket(ctx: ApiActorContext): Promise<{
  byCountry: Map<string, AgentRow[]>;
  violationBuckets: Set<string>;
}> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const agentsPage = await runtime.repos.agents.list(
    readCtx,
    {},
    { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
  );
  const agents: AgentRow[] = agentsPage.items.map((e) => ({
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
  const byCountry = new Map<string, AgentRow[]>();
  for (const agent of agents) {
    if (!agent.countryId) continue;
    const list = byCountry.get(agent.bucket) ?? [];
    list.push(agent);
    byCountry.set(agent.bucket, list);
  }
  return { byCountry, violationBuckets };
}

function mapCountryListItem(input: {
  countryId: string;
  sourceDocumentId?: string | null;
  liveName?: string | null;
  liveNameAr?: string | null;
  liveNameEn?: string | null;
  currencyCode?: string | null;
  countryAgents: AgentRow[];
  forceViolation?: boolean;
}): GeographyCountryListItem {
  const identity = classifyCountryIdentity(input.countryId);
  const presentation = buildGeographyCountryPresentation({
    countryId: input.countryId,
    liveName: input.liveName,
    liveNameAr: input.liveNameAr,
    liveNameEn: input.liveNameEn,
  });
  const bucket = geographyCountryBucketKey(input.countryId);
  const invariant = diagnoseCountryAgentInvariant({
    countryId: input.countryId,
    countryBucket: bucket,
    agents: input.countryAgents.map((a) => ({
      agentId: a.id,
      agentName: a.name,
      countryId: a.countryId,
      countryBucket: a.bucket,
      status: a.status,
      authoritativeRole: a.authoritativeRole,
      isOperationalAgent: a.isOperationalAgent,
      mappingStatus: a.mappingStatus,
    })),
  });
  if (input.forceViolation && invariant.state !== "VIOLATION") {
    // seed policy may mark bucket even when page agents collapsed
    invariant.state = "VIOLATION";
    invariant.invariant = "fail_multiple_active";
  }

  const currency = auditCountryCurrencyAlignment({
    countryId: presentation.canonicalCountryId ?? input.countryId,
    storedCurrency: input.currencyCode,
  });

  const issues: GeographyDqIssue[] = [
    ...presentation.warnings.map((w) => ({
      code: w.code,
      severity:
        w.code === "malformed_legacy_country_id"
          ? ("ERROR" as const)
          : w.code === "test_or_noncanonical_country"
            ? ("WARNING" as const)
            : ("WARNING" as const),
      messageEn: w.messageEn,
      messageAr: w.messageAr,
      entityKind: "country" as const,
      entityId: input.countryId,
    })),
    ...invariant.issues,
  ];
  if (currency.issue) issues.push(currency.issue);

  if (identity.identityClass === "legacy" || identity.identityClass === "known_alias") {
    issues.push({
      code: "country_alias_or_legacy_normalized",
      severity: "INFO",
      messageEn: `Country identity class: ${identity.identityClass}`,
      messageAr: `تصنيف هوية الدولة: ${identity.identityClass}`,
      entityKind: "country",
      entityId: input.countryId,
    });
  }

  const recordClass = classifyGeographyRecordClass({
    entityKind: "country",
    documentId: input.sourceDocumentId ?? input.countryId,
    mappingStatus: presentation.testOrNoncanonical
      ? "testOrNoncanonical"
      : null,
  }).recordClass;

  let status: GeographyCountryListItem["status"] = "available";
  if (!presentation.displayName) status = "unavailable";
  else if (!presentation.displayNameAr || !presentation.displayNameEn) {
    status = "partial";
  }

  return {
    countryId: input.sourceDocumentId ?? input.countryId,
    canonicalCountryId: presentation.canonicalCountryId,
    identityClass: identity.identityClass,
    displayName: presentation.displayName,
    displayNameAr: presentation.displayNameAr,
    displayNameEn: presentation.displayNameEn,
    iso2: presentation.iso2 ?? identity.iso2,
    currencyCode: currency.storedCurrency,
    currencyExpected: currency.expectedCurrency,
    currencyAlignment: currency.status,
    status,
    citiesCount: UNAVAILABLE_COUNT,
    landmarksCount: UNAVAILABLE_COUNT,
    activeAgentId: invariant.activeAgentId,
    activeAgentName: invariant.activeAgentName,
    inactiveAgentCount: invariant.inactiveAgentCount,
    invariant: invariant.invariant,
    agentInvariantState: invariant.state,
    dqSeverity: maxGeographyDqSeverity(issues),
    dataQualityIssues: issues,
    dataQualityWarnings: issues.map((i) => ({
      code: i.code,
      messageEn: i.messageEn,
      messageAr: i.messageAr,
    })),
    testOrNoncanonical: presentation.testOrNoncanonical,
    recordClass,
  };
}

function toCompatCountryListItem(
  row: GeographyCountryListItem,
): CountryListItem {
  return {
    countryId: row.countryId,
    displayName: row.displayName,
    displayNameAr: row.displayNameAr,
    displayNameEn: row.displayNameEn,
    canonicalCountryId: row.canonicalCountryId,
    activeAgentId: row.activeAgentId,
    activeAgentName: row.activeAgentName,
    inactiveAgentCount: row.inactiveAgentCount,
    invariant: row.invariant,
    agentInvariantState: row.agentInvariantState,
    currencyHint: row.currencyCode,
    currencyCode: row.currencyCode,
    dataQualityWarnings: row.dataQualityWarnings,
    dataQualityIssues: row.dataQualityIssues,
    dqSeverity: row.dqSeverity,
    testOrNoncanonical: row.testOrNoncanonical,
    identityClass: row.identityClass,
    recordClass: row.recordClass,
    citiesCount: row.citiesCount,
    landmarksCount: row.landmarksCount,
  };
}

export async function listProductionCountriesApi(
  ctx: ApiActorContext,
  request?: Request,
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const url = request ? new URL(request.url) : null;
  const limit = clampLimit(url?.searchParams.get("limit") ?? null);
  const cursor = url?.searchParams.get("cursor") || null;
  const statusFilter = url?.searchParams.get("status")?.trim() || "";
  const agentStateFilter =
    url?.searchParams.get("agentInvariant")?.trim().toUpperCase() || "";
  const dqFilter =
    (url?.searchParams.get("dqSeverity")?.trim().toUpperCase() as
      | GeographyDqSeverity
      | "") || "";

  const [{ byCountry, violationBuckets }, countriesPage] = await Promise.all([
    loadAgentsByBucket(ctx),
    runtime.repos.geography.listCountries(
      readCtx,
      {},
      { limit, cursor },
    ),
  ]);

  let items: GeographyCountryListItem[] = countriesPage.items.map((env) => {
    const countryId = env.data.sourceDocumentId ?? env.data.id;
    const bucket = geographyCountryBucketKey(env.data.id);
    return mapCountryListItem({
      countryId: env.data.id,
      sourceDocumentId: countryId,
      liveName: env.data.name?.trim() ? env.data.name : null,
      liveNameAr: env.data.nameAr ?? null,
      liveNameEn: env.data.nameEn ?? null,
      currencyCode: env.data.currencyCode,
      countryAgents: byCountry.get(bucket) ?? [],
      forceViolation: violationBuckets.has(bucket),
    });
  });

  // Loaded-page filters for status / agent invariant / DQ (labeled mixed when used).
  let pageFilterScope: "server" | "loaded_page" | "mixed" = "server";
  if (statusFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) => i.status === statusFilter);
  }
  if (agentStateFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) => i.agentInvariantState === agentStateFilter);
  }
  if (dqFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) =>
      geographyDqSeverityMeetsMinimum(i.dqSeverity, dqFilter as GeographyDqSeverity),
    );
  }

  const meta = sourceMeta(items.map((i) => i.countryId));
  return {
    items: items.map(toCompatCountryListItem),
    geographyItems: items,
    nextCursor: countriesPage.nextCursor,
    truncated: countriesPage.truncated,
    ...listMeta(),
    pageFilterScope,
    ...meta,
    synthetic: false as const,
  };
}

function mapCityListItem(
  model: CanonicalCityReadModel,
  extraIssues: GeographyDqIssue[] = [],
): GeographyCityListItem {
  const displayNameAr = model.nameAr?.trim() || null;
  const displayNameEn = model.nameEn?.trim() || null;
  const displayName =
    displayNameEn ??
    displayNameAr ??
    (model.safeName && model.safeName !== model.sourceDocumentId
      ? model.safeName
      : null);
  const issues = [
    ...detectCityDataQualityIssues({
      cityId: model.sourceDocumentId,
      sourceDocumentId: model.sourceDocumentId,
      safeName: model.safeName,
      nameAr: displayNameAr,
      nameEn: displayNameEn,
      countryId: model.countryId || null,
      mappingStatus: model.mappingStatus,
      activeStatus: model.activeStatus,
      warnings: model.warnings,
    }),
    ...extraIssues,
  ];
  const recordClass = classifyGeographyRecordClass({
    entityKind: "city",
    documentId: model.sourceDocumentId,
    mappingStatus: model.mappingStatus,
    countryDocId: model.countryId,
  }).recordClass;

  return {
    cityId: model.sourceDocumentId,
    sourceDocumentId: model.sourceDocumentId,
    canonicalCityId: model.canonicalCityId,
    displayName,
    displayNameAr,
    displayNameEn,
    countryId: model.countryId || null,
    canonicalCountryId: tryCanonicalCountryId(model.countryId),
    countryDisplayName: model.countryId
      ? resolveCountryDisplayName({ countryId: model.countryId })
      : null,
    activeStatus: model.activeStatus,
    mappingStatus: model.mappingStatus,
    landmarksCount: UNAVAILABLE_COUNT,
    dqSeverity: maxGeographyDqSeverity(issues),
    dataQualityIssues: issues,
    recordClass,
  };
}

export async function listProductionCitiesApi(
  ctx: ApiActorContext,
  request: Request,
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || null;
  const countryId = resolveCountryFilterCanonicalId(
    url.searchParams.get("countryId"),
  );
  const statusFilter = url.searchParams.get("status")?.trim() || "";
  const dqFilter =
    (url.searchParams.get("dqSeverity")?.trim().toUpperCase() as
      | GeographyDqSeverity
      | "") || "";

  const page = await runtime.repos.geography.listCities(
    readCtx,
    { countryId: countryId ?? undefined },
    { limit, cursor },
  );

  const dupIssues = detectDuplicateCityNamesInCountry(
    page.items.map((e) => ({
      cityId: e.data.sourceDocumentId,
      safeName: e.data.safeName,
      nameAr: e.data.nameAr,
      nameEn: e.data.nameEn,
      countryId: e.data.countryId,
    })),
  );

  let items = page.items.map((env) =>
    mapCityListItem(
      env.data,
      dupIssues.filter(
        (i) => i.entityId === env.data.sourceDocumentId,
      ),
    ),
  );

  let pageFilterScope: "server" | "loaded_page" | "mixed" = countryId
    ? "server"
    : "server";
  if (statusFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) => i.activeStatus === statusFilter);
  }
  if (dqFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) =>
      geographyDqSeverityMeetsMinimum(i.dqSeverity, dqFilter as GeographyDqSeverity),
    );
  }

  const meta = sourceMeta(items.map((i) => i.cityId));
  return {
    items,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...listMeta(),
    pageFilterScope,
    ...meta,
    synthetic: false as const,
  };
}

function mapLandmarkListItem(
  model: CanonicalLandmarkReadModel,
): GeographyLandmarkListItem {
  const displayNameAr = model.nameAr?.trim() || null;
  const displayNameEn = model.nameEn?.trim() || null;
  const displayName =
    displayNameEn ??
    displayNameAr ??
    (model.safeName && model.safeName !== model.sourceDocumentId
      ? model.safeName
      : null);
  const hasImage = model.imageSummary?.hasImage ?? null;
  const hasCoordinates = model.coordinates != null;
  const issues = detectLandmarkDataQualityIssues({
    landmarkId: model.sourceDocumentId,
    sourceDocumentId: model.sourceDocumentId,
    safeName: model.safeName,
    nameAr: displayNameAr,
    nameEn: displayNameEn,
    countryId: model.countryId || null,
    canonicalCountryId: model.canonicalCountryId || null,
    sourceCountryDocumentId: model.sourceCountryDocumentId,
    cityId: model.cityId || null,
    mappingStatus: model.mappingStatus,
    activeStatus: model.activeStatus,
    hasImage,
    imageCount: model.imageSummary?.imageCount ?? null,
    storageKind: model.imageSummary?.storageKind ?? null,
    hasCoordinates,
    warnings: model.warnings,
  });
  const recordClass = classifyGeographyRecordClass({
    entityKind: "landmark",
    documentId: model.sourceDocumentId,
    mappingStatus: model.mappingStatus,
    countryDocId: model.sourceCountryDocumentId || model.countryId,
    cityDocId: model.cityId,
  }).recordClass;

  return {
    landmarkId: model.sourceDocumentId,
    sourceDocumentId: model.sourceDocumentId,
    canonicalLandmarkId: model.canonicalLandmarkId,
    displayName,
    displayNameAr,
    displayNameEn,
    countryId: model.countryId || null,
    canonicalCountryId: model.canonicalCountryId || tryCanonicalCountryId(model.countryId),
    countryDisplayName: model.canonicalCountryId || model.countryId
      ? resolveCountryDisplayName({
          countryId: model.canonicalCountryId || model.countryId,
        })
      : null,
    cityId: model.cityId || null,
    cityDisplayName: null,
    activeStatus: model.activeStatus,
    mappingStatus: model.mappingStatus,
    category: null,
    imagePresence:
      hasImage == null ? "unavailable" : hasImage ? "present" : "missing",
    imageStorageKind: model.imageSummary?.storageKind ?? null,
    coordinatesPresence: hasCoordinates ? "present" : "missing",
    visibilityStatus: model.activeStatus,
    dqSeverity: maxGeographyDqSeverity(issues),
    dataQualityIssues: issues,
    recordClass,
  };
}

export async function listProductionLandmarksApi(
  ctx: ApiActorContext,
  request: Request,
) {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor") || null;
  const countryId = resolveCountryFilterCanonicalId(
    url.searchParams.get("countryId"),
  );
  const cityId = url.searchParams.get("cityId")?.trim() || undefined;
  const statusFilter = url.searchParams.get("status")?.trim() || "";
  const dqFilter =
    (url.searchParams.get("dqSeverity")?.trim().toUpperCase() as
      | GeographyDqSeverity
      | "") || "";

  const page = await runtime.repos.geography.listLandmarks(
    readCtx,
    { countryId: countryId ?? undefined, cityId },
    { limit, cursor },
  );

  let items = page.items.map((env) => mapLandmarkListItem(env.data));

  let pageFilterScope: "server" | "loaded_page" | "mixed" = "server";
  if (statusFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) => i.activeStatus === statusFilter);
  }
  if (dqFilter) {
    pageFilterScope = "mixed";
    items = items.filter((i) =>
      geographyDqSeverityMeetsMinimum(i.dqSeverity, dqFilter as GeographyDqSeverity),
    );
  }

  const meta = sourceMeta(items.map((i) => i.landmarkId));
  return {
    items,
    nextCursor: page.nextCursor,
    truncated: page.truncated,
    ...listMeta(),
    pageFilterScope,
    ...meta,
    synthetic: false as const,
  };
}

export async function getProductionCountryDetailApi(
  ctx: ApiActorContext,
  countryId: string,
): Promise<GeographyCountryDetail> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const id = countryId.trim();
  if (!id) throw new ProductionDetailNotFoundError("country", countryId);

  const getCountry = runtime.repos.geography.getCountryById?.bind(
    runtime.repos.geography,
  );
  let envelope = getCountry
    ? await getCountry(readCtx, id)
    : null;

  // Alias/canonical fallback: list window lookup when exact doc id differs.
  if (!envelope) {
    const page = await runtime.repos.geography.listCountries(
      readCtx,
      {},
      { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
    );
    envelope =
      page.items.find(
        (e) =>
          e.data.id === id ||
          e.data.sourceDocumentId === id ||
          geographyCountryBucketKey(e.data.id) ===
            geographyCountryBucketKey(id),
      ) ?? null;
  }
  if (!envelope) throw new ProductionDetailNotFoundError("country", countryId);

  assertDetailResourceInScope(ctx.user.scope, {
    countryId: envelope.data.id,
  });

  const { byCountry, violationBuckets } = await loadAgentsByBucket(ctx);
  const bucket = geographyCountryBucketKey(envelope.data.id);
  const item = mapCountryListItem({
    countryId: envelope.data.id,
    sourceDocumentId: envelope.data.sourceDocumentId ?? envelope.data.id,
    liveName: envelope.data.name,
    liveNameAr: envelope.data.nameAr,
    liveNameEn: envelope.data.nameEn,
    currencyCode: envelope.data.currencyCode,
    countryAgents: byCountry.get(bucket) ?? [],
    forceViolation: violationBuckets.has(bucket),
  });

  const identity = classifyCountryIdentity(
    envelope.data.sourceDocumentId ?? envelope.data.id,
  );
  const citiesPage = await runtime.repos.geography.listCities(
    readCtx,
    { countryId: envelope.data.id },
    { limit: PRODUCTION_DETAIL_RELATED_READ_LIMIT, cursor: null },
  );

  const meta = sourceMeta([item.countryId]);
  return {
    ...item,
    aliases: identity.knownAliases,
    relatedCities: citiesPage.items.map((c) => ({
      cityId: c.data.sourceDocumentId,
      displayName:
        c.data.nameEn?.trim() ||
        c.data.nameAr?.trim() ||
        (c.data.safeName !== c.data.sourceDocumentId ? c.data.safeName : null),
      activeStatus: c.data.activeStatus,
    })),
    relatedCitiesBounded: true,
    relatedCitiesLimit: PRODUCTION_DETAIL_RELATED_READ_LIMIT,
    ...meta,
    synthetic: false as const,
  } as GeographyCountryDetail & typeof meta & { synthetic: false };
}

export async function getProductionCityDetailApi(
  ctx: ApiActorContext,
  cityId: string,
): Promise<GeographyCityDetail> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const id = cityId.trim();
  const getCity = runtime.repos.geography.getCityById?.bind(
    runtime.repos.geography,
  );
  const envelope = getCity ? await getCity(readCtx, id) : null;
  if (!envelope) throw new ProductionDetailNotFoundError("city", cityId);

  assertDetailResourceInScope(ctx.user.scope, {
    countryId: envelope.data.countryId,
    cityId: envelope.data.sourceDocumentId,
  });

  const item = mapCityListItem(envelope.data);
  const landmarksPage = await runtime.repos.geography.listLandmarks(
    readCtx,
    {
      countryId: envelope.data.countryId || undefined,
      cityId: envelope.data.sourceDocumentId,
    },
    { limit: PRODUCTION_DETAIL_RELATED_READ_LIMIT, cursor: null },
  );

  const meta = sourceMeta([item.cityId]);
  return {
    ...item,
    relatedLandmarks: landmarksPage.items.map((l) => ({
      landmarkId: l.data.sourceDocumentId,
      displayName:
        l.data.nameEn?.trim() ||
        l.data.nameAr?.trim() ||
        (l.data.safeName !== l.data.sourceDocumentId ? l.data.safeName : null),
      activeStatus: l.data.activeStatus,
    })),
    relatedLandmarksBounded: true,
    relatedLandmarksLimit: PRODUCTION_DETAIL_RELATED_READ_LIMIT,
    ...meta,
    synthetic: false as const,
  } as GeographyCityDetail & typeof meta & { synthetic: false };
}

export async function getProductionLandmarkDetailApi(
  ctx: ApiActorContext,
  landmarkId: string,
): Promise<GeographyLandmarkDetail> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const id = landmarkId.trim();
  const getLandmark = runtime.repos.geography.getLandmarkById?.bind(
    runtime.repos.geography,
  );
  const envelope = getLandmark ? await getLandmark(readCtx, id) : null;
  if (!envelope) throw new ProductionDetailNotFoundError("landmark", landmarkId);

  assertDetailResourceInScope(ctx.user.scope, {
    countryId:
      envelope.data.canonicalCountryId || envelope.data.countryId || null,
    cityId: envelope.data.cityId || null,
  });

  const item = mapLandmarkListItem(envelope.data);
  const meta = sourceMeta([item.landmarkId]);
  return {
    ...item,
    coordinates: envelope.data.coordinates,
    createdAtUtc: null,
    updatedAtUtc: null,
    ...meta,
    synthetic: false as const,
  } as GeographyLandmarkDetail & typeof meta & { synthetic: false };
}

export async function getProductionGeographyDqSummaryApi(
  ctx: ApiActorContext,
): Promise<GeographyDqSummary & { label?: string; en?: string; ar?: string; synthetic: false; transport: "wif_native" }> {
  const runtime = await getProductionOperationalReadRuntime();
  const readCtx = productionReadContextFromActor(ctx);
  const [{ byCountry, violationBuckets }, countriesPage, citiesPage, landmarksPage] =
    await Promise.all([
      loadAgentsByBucket(ctx),
      runtime.repos.geography.listCountries(
        readCtx,
        {},
        { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
      ),
      runtime.repos.geography.listCities(
        readCtx,
        {},
        { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
      ),
      runtime.repos.geography.listLandmarks(
        readCtx,
        {},
        { limit: WIF_NATIVE_MAX_READ_LIMIT, cursor: null },
      ),
    ]);

  const countryItems = countriesPage.items.map((env) => {
    const bucket = geographyCountryBucketKey(env.data.id);
    return mapCountryListItem({
      countryId: env.data.id,
      sourceDocumentId: env.data.sourceDocumentId ?? env.data.id,
      liveName: env.data.name,
      liveNameAr: env.data.nameAr,
      liveNameEn: env.data.nameEn,
      currencyCode: env.data.currencyCode,
      countryAgents: byCountry.get(bucket) ?? [],
      forceViolation: violationBuckets.has(bucket),
    });
  });
  const cityItems = citiesPage.items.map((e) => mapCityListItem(e.data));
  const landmarkItems = landmarksPage.items.map((e) =>
    mapLandmarkListItem(e.data),
  );

  const recordClassCounts: Record<string, number> = {};
  const bump = (c: string) => {
    recordClassCounts[c] = (recordClassCounts[c] ?? 0) + 1;
  };
  for (const c of countryItems) bump(c.recordClass);
  for (const c of cityItems) bump(c.recordClass);
  for (const l of landmarkItems) bump(l.recordClass);

  const topIssues: GeographyDqIssue[] = [
    ...countryItems.flatMap((c) => c.dataQualityIssues),
    ...cityItems.flatMap((c) => c.dataQualityIssues),
    ...landmarkItems.flatMap((l) => l.dataQualityIssues),
  ]
    .filter((i) => i.severity !== "INFO")
    .slice(0, 50);

  const summary = buildGeographyDqSummary({
    boundedSampleLimit: WIF_NATIVE_MAX_READ_LIMIT,
    truncated:
      countriesPage.truncated || citiesPage.truncated || landmarksPage.truncated,
    countriesTotalInView: countryItems.length,
    canonicalCountries: countryItems.filter(
      (c) => c.identityClass === "canonical",
    ).length,
    aliasesNormalized: countryItems.filter(
      (c) =>
        c.identityClass === "known_alias" || c.identityClass === "legacy",
    ).length,
    legacyOrMalformedCountries: countryItems.filter(
      (c) =>
        c.identityClass === "legacy" || c.identityClass === "malformed",
    ).length,
    countriesWithoutActiveAgent: countryItems.filter(
      (c) => c.agentInvariantState === "NO_ACTIVE_AGENT",
    ).length,
    countriesWithDuplicateActiveAgents: countryItems.filter(
      (c) => c.agentInvariantState === "VIOLATION",
    ).length,
    countriesWithSuspiciousAgent: countryItems.filter(
      (c) => c.agentInvariantState === "DATA_QUALITY_WARNING",
    ).length,
    citiesWithBrokenCountryRefs: cityItems.filter((c) =>
      c.dataQualityIssues.some(
        (i) =>
          i.code === "city_missing_country" ||
          i.code === "city_unknown_country",
      ),
    ).length,
    landmarksWithBrokenCityOrCountryRefs: landmarkItems.filter((l) =>
      l.dataQualityIssues.some(
        (i) =>
          i.code === "landmark_missing_country" ||
          i.code === "landmark_missing_city" ||
          i.code === "landmark_unknown_country" ||
          i.code === "landmark_country_city_mismatch",
      ),
    ).length,
    landmarksMissingDisplayMetadata: landmarkItems.filter((l) =>
      l.dataQualityIssues.some(
        (i) =>
          i.code === "landmark_missing_display_name" ||
          i.code === "landmark_missing_image_metadata",
      ),
    ).length,
    qaPilotLegacyRecordCount: [
      ...countryItems,
      ...cityItems,
      ...landmarkItems,
    ].filter((r) =>
      ["qa", "production_pilot", "legacy"].includes(r.recordClass),
    ).length,
    recordClassCounts,
    topIssues,
  });

  const meta = sourceMeta([
    ...countryItems.map((c) => c.countryId),
    ...cityItems.map((c) => c.cityId),
    ...landmarkItems.map((l) => l.landmarkId),
  ]);

  return {
    ...summary,
    ...meta,
    synthetic: false as const,
    transport: "wif_native",
  };
}
