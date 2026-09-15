/**
 * Phase 4A-4 — FirebaseProductionTripReadRepository.
 * Authoritative collection: Legacy Firestore `order`.
 * Query: bounded data_order window (Date/Timestamp bounds — NOT ISO strings),
 *   orderBy data_order desc, cursor, limit≤50.
 * Option B: boundedLatestPage — orderBy only, no date filters, still ≤50.
 * Scope applied post-map (Rev_dolh / vill are DocumentReferences — no invent).
 * No N+1 customer/driver/city/landmark lookups. No Storage/payment/Functions.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  ProductionReadContext,
  ProductionTripReadRepository,
  TripListFilter,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { IndexCapabilityChecker } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DefaultLegacyTripMapper } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  assertPageLimit,
  envelopeOf,
  enforceKillSwitch,
  enforceLiveShadowResource,
  intersectScopeOrThrow,
  isCountryInScopedList,
  resolveTripDateWindow,
  ScopeDeniedError,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import type { ProductionTripSourceRecord } from "@/infrastructure/production/contracts/ProductionSourceRecords";
import { SOURCE_SCHEMA_VERSION_UNKNOWN } from "@/domain/production-read/constants";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import {
  auditTripDuplicates,
  type TripDuplicateAuditMetrics,
  type TripIdentityRow,
} from "@/domain/trip/TripDuplicateIdentityAudit";
import type { TripMappingStatus } from "@/domain/trip/TripRecordClassification";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import { mapCanonicalTripFromLegacyDoc } from "@/domain/trip/mapCanonicalTripRead";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";
import {
  buildTripGeographyDiagnostic,
  emptyTripGeographyCounters,
  tallyTripGeographyDiagnostic,
  type TripGeographyCounterBundle,
  type TripGeographyDiagnostic,
} from "@/domain/trip/TripGeographyDiagnostic";
import type { PersistedMoneyKnowledge } from "@/domain/trip/TripFinancialSafeRead";

/** Phase 4A-4 hard cap — operator live window max page. */
export const PHASE_4A4_TRIPS_MAX_PAGE = 50;

/** Proven Legacy list/sort field — Firestore Timestamp (Flutter DateTime). */
export const PHASE_4A4_TRIP_TIMESTAMP_FIELD = "data_order" as const;

export type TripQueryMode = "date_window" | "bounded_latest_page";

export type TripQueryMeta = {
  queryWindowStart: string | null;
  queryWindowEnd: string | null;
  queryTimestampField: typeof PHASE_4A4_TRIP_TIMESTAMP_FIELD;
  queryOrderDirection: "desc";
  queryLimit: number;
  queryMode: TripQueryMode;
  /** Firestore filter bound type after correction (Admin SDK Date → Timestamp). */
  queryFilterBoundType: "Date" | "none";
};

export type FirebaseProductionTripReadRepositoryDeps = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  indexChecker?: IndexCapabilityChecker;
  observability?: ProductionReadObservability;
  now?: () => Date;
  liveShadowAllowedResources?: ReadonlySet<string>;
  aliases?: CityAliasEntry[];
};

export type TripListPageResult = CursorPageResult<
  ProductionReadEnvelope<CanonicalTripReadModel>
> & {
  auditMetrics: TripDuplicateAuditMetrics;
  collectionQueried: "order";
  queryMeta: TripQueryMeta;
  /** Safe geography diagnostics for blocking / audit records (no PII). */
  tripGeographyDiagnostics: TripGeographyDiagnostic[];
  geographyCounters: TripGeographyCounterBundle;
};

/**
 * Convert ISO window strings to Date for Firestore range filters.
 * Legacy stores data_order as Timestamp; ISO string bounds never match (type E).
 */
export function tripWindowBoundToFirestoreDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new QuerySafetyError(`Invalid trip window bound: ${iso}`);
  }
  return d;
}

function financialKnowledgeFlags(model: CanonicalTripReadModel): {
  financialUnknown: boolean;
  financialConflicting: boolean;
  financialPersistedComplete: boolean;
  financialAmountUnknown: boolean;
  financialRateUnknown: boolean;
  financialNotRepresented: boolean;
  financialDerived: boolean;
} {
  const f = model.financialSafeRead;
  const amounts = [
    f.totalAppKnowledge,
    f.totalVatKnowledge,
    f.totalMndobKnowledge,
    f.totalMndob2Knowledge,
  ] as PersistedMoneyKnowledge[];
  const rates = [
    f.vatRateKnowledge,
    f.platformCommissionRateKnowledge,
  ] as PersistedMoneyKnowledge[];
  const all = [...amounts, ...rates];
  const financialPersistedComplete = amounts.every(
    (k) => k === "persisted" || k === "known_zero" || k === "missing",
  );
  return {
    financialUnknown: all.some((k) => k === "unknown"),
    financialConflicting: all.some((k) => k === "conflicting"),
    financialPersistedComplete,
    financialAmountUnknown: amounts.some((k) => k === "unknown"),
    // Rate "unknown" (malformed type) — not_represented is separate and expected.
    financialRateUnknown: rates.some((k) => k === "unknown"),
    financialNotRepresented: rates.some((k) => k === "not_represented"),
    financialDerived: all.some((k) => k === "derived"),
  };
}

function identityRowFromModel(model: CanonicalTripReadModel): TripIdentityRow {
  const fin = financialKnowledgeFlags(model);
  return {
    sourceDocumentId: model.sourceDocumentId,
    canonicalTripId: model.canonicalTripId,
    iDorder: model.iDorder,
    customerId: model.customerId,
    createdAtUtc: model.createdAtUtc.value,
    mappingStatus: model.mappingStatus as TripMappingStatus,
    lifecycleStatus: model.lifecycleStatus,
    activeOrderFlag: model.activeOrderFlag,
    unknownCustomerReference: model.customerIdKnowledge === "unknown",
    unknownDriverReference: model.driverIdKnowledge === "unknown",
    unknownLifecycleStatus: model.lifecycleStatus === "unmapped",
    conflictingLifecycleStatus: model.cancellation.actorKnowledge === "conflicting",
    financialUnknown: fin.financialUnknown,
    financialConflicting: fin.financialConflicting,
    financialPersistedComplete: fin.financialPersistedComplete,
    financialAmountUnknown: fin.financialAmountUnknown,
    financialRateUnknown: fin.financialRateUnknown,
    financialNotRepresented: fin.financialNotRepresented,
    financialDerived: fin.financialDerived,
  };
}

export class FirebaseProductionTripReadRepository
  implements ProductionTripReadRepository
{
  readonly resource = "trips" as const;
  private readonly mapper = new DefaultLegacyTripMapper();
  private readonly indexChecker: IndexCapabilityChecker;
  private readonly now: () => Date;

  constructor(private readonly deps: FirebaseProductionTripReadRepositoryDeps) {
    this.indexChecker = deps.indexChecker ?? {
      assertQuerySupported() {
        /* permissive default for Fake — tests inject FakeIndexCapabilityChecker */
      },
    };
    this.now = deps.now ?? (() => new Date());
  }

  async list(
    ctx: ProductionReadContext,
    filter: TripListFilter,
    page: CursorPageRequest,
  ): Promise<TripListPageResult> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "trips");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "trips",
    });

    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryIds,
      cityIds: filter.cityIds,
      agentIds: filter.agentIds,
    });
    const normalizedPage = assertPageLimit(page, PHASE_4A4_TRIPS_MAX_PAGE);

    const useLatest = filter.boundedLatestPage === true;
    let filters: Array<{
      field: string;
      op: ">=" | "<=";
      value: Date;
    }> = [];
    let queryMeta: TripQueryMeta;

    if (useLatest) {
      // Option B — ONE bounded latest page; no date filters; still ≤50.
      queryMeta = {
        queryWindowStart: null,
        queryWindowEnd: null,
        queryTimestampField: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
        queryOrderDirection: "desc",
        queryLimit: normalizedPage.limit,
        queryMode: "bounded_latest_page",
        queryFilterBoundType: "none",
      };
    } else {
      const window = resolveTripDateWindow({
        createdFromUtc: filter.createdFromUtc,
        createdToUtc: filter.createdToUtc,
        now: this.now(),
      });
      // CRITICAL: pass Date (→ Firestore Timestamp), never ISO string.
      // Legacy Admin uses Timestamp.fromDate; Functions use new Date().
      filters = [
        {
          field: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
          op: ">=" as const,
          value: tripWindowBoundToFirestoreDate(window.createdFromUtc),
        },
        {
          field: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
          op: "<=" as const,
          value: tripWindowBoundToFirestoreDate(window.createdToUtc),
        },
      ];
      queryMeta = {
        queryWindowStart: window.createdFromUtc,
        queryWindowEnd: window.createdToUtc,
        queryTimestampField: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
        queryOrderDirection: "desc",
        queryLimit: normalizedPage.limit,
        queryMode: "date_window",
        queryFilterBoundType: "Date",
      };
    }

    const orderBy = [
      {
        field: PHASE_4A4_TRIP_TIMESTAMP_FIELD,
        direction: "desc" as const,
      },
    ];
    this.indexChecker.assertQuerySupported({
      collection: "order",
      filters,
      orderBy,
    });

    const result = await this.deps.client.query({
      collection: "order",
      filters,
      orderBy,
      limit: normalizedPage.limit,
      startAfterCursor: normalizedPage.cursor,
    });

    const identityRows: TripIdentityRow[] = [];
    const items: ProductionReadEnvelope<CanonicalTripReadModel>[] = [];
    const tripGeographyDiagnostics: TripGeographyDiagnostic[] = [];
    const geographyCounters = emptyTripGeographyCounters();

    for (const d of result.docs) {
      if (!d.exists || !d.data) continue;
      const mapped = mapCanonicalTripFromLegacyDoc({
        documentId: d.id,
        data: d.data,
        aliases: this.deps.aliases,
      });
      const model = mapped.model;

      // Post-map scope intersect
      const countryVal = model.countryId.value ?? model.canonicalCountryId;
      if (
        scoped.countryIds?.length &&
        countryVal &&
        !scoped.countryIds.includes(countryVal) &&
        !scoped.countryIds.includes(model.sourceCountryDocumentId)
      ) {
        continue;
      }
      const cityVal = model.cityId.value ?? model.sourceCityDocumentId;
      if (
        scoped.cityIds?.length &&
        cityVal &&
        !scoped.cityIds.includes(cityVal)
      ) {
        continue;
      }
      const agentVal = model.agentId.value;
      if (
        scoped.agentIds?.length &&
        agentVal &&
        !scoped.agentIds.includes(agentVal)
      ) {
        continue;
      }
      if (filter.statusCodes?.length) {
        const code = model.lifecycleStatus;
        if (!filter.statusCodes.includes(code)) continue;
      }

      for (const w of mapped.mappingWarnings) {
        this.deps.observability?.emit({
          type: "mapping_warning",
          resource: "trips",
          warningCode: w.code,
        });
      }

      const geoDiag = buildTripGeographyDiagnostic({
        sourceDocumentId: model.sourceDocumentId,
        data: d.data,
        mappingStatus: mapped.mappingStatus,
        lifecycleStatus: model.lifecycleStatus,
        sourceCountryPath: model.sourceCountryPath,
        sourceCountryDocumentId: model.sourceCountryDocumentId || null,
        sourceCityPath: model.sourceCityPath,
        sourceCityDocumentId: model.sourceCityDocumentId || null,
        sourcePickupLandmarkPath: model.sourcePickupLandmarkPath,
        sourceDestinationLandmarkPath: model.sourceDestinationLandmarkPath,
        aliases: this.deps.aliases,
      });
      tallyTripGeographyDiagnostic(geographyCounters, geoDiag);
      // Blocking / unresolved city records only — keep summary PII-free & bounded.
      if (
        mapped.mappingStatus === "unmappedCity" ||
        mapped.mappingStatus === "ambiguousCity" ||
        mapped.mappingStatus === "malformed" ||
        geoDiag.cityKnowledge === "not_represented"
      ) {
        tripGeographyDiagnostics.push(geoDiag);
      }

      identityRows.push(identityRowFromModel(model));

      items.push(
        envelopeOf(ctx, model, {
          mappingWarnings: mapped.mappingWarnings,
          mappingConfidence: mapped.mappingConfidence,
          sourceVersion: null,
          sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
          readSafety: mapped.mappingWarnings.some(
            (w) => w.code === "unmapped_status",
          )
            ? "UNMAPPED"
            : mapped.mappingWarnings.some(
                  (w) => w.code === "financial_field_blocked",
                )
              ? "SAFE_WITH_WARNING"
              : "SAFE",
          blockedFields: mapped.mappingWarnings
            .filter((w) => w.code === "financial_field_blocked")
            .map((w) => w.field!)
            .filter(Boolean),
        }),
      );
    }

    const auditMetrics = auditTripDuplicates(identityRows);

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
      auditMetrics,
      collectionQueried: "order",
      queryMeta,
      tripGeographyDiagnostics,
      geographyCounters,
    };
  }

  async getById(
    ctx: ProductionReadContext,
    tripId: string,
  ): Promise<ProductionReadEnvelope<CanonicalTripReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "trips");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "trips",
    });
    const scoped = intersectScopeOrThrow(ctx, {});
    const snap = await this.deps.client.getDocument("order", tripId);
    if (!snap.exists || !snap.data) return null;

    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: snap.id,
      data: snap.data,
      aliases: this.deps.aliases,
    });
    const countryId =
      mapped.model.countryId.value ?? mapped.model.sourceCountryDocumentId;
    if (
      scoped.countryIds?.length &&
      !isCountryInScopedList(scoped.countryIds, countryId || null)
    ) {
      throw new ScopeDeniedError("trip outside authorized country scope");
    }
    const agentId = mapped.model.agentId.value ?? "";
    if (
      scoped.agentIds?.length &&
      agentId &&
      !scoped.agentIds.includes(agentId)
    ) {
      throw new ScopeDeniedError("trip outside authorized agent scope");
    }

    return this.mapDoc(ctx, snap.id, snap.data);
  }

  private mapDoc(
    ctx: ProductionReadContext,
    id: string,
    data: Record<string, unknown>,
  ): ProductionReadEnvelope<CanonicalTripReadModel> {
    const source: ProductionTripSourceRecord = {
      resource: "trip",
      sourceCollection: "order",
      sourceDocumentId: id,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: data,
    };
    const mapped = this.mapper.map(source);
    for (const w of mapped.mappingWarnings) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "trips",
        warningCode: w.code,
      });
    }
    return envelopeOf(ctx, mapped.model, {
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      sourceVersion: mapped.sourceVersion,
      sourceSchemaVersion: mapped.sourceSchemaVersion,
      readSafety: mapped.mappingWarnings.some((w) => w.code === "unmapped_status")
        ? "UNMAPPED"
        : mapped.mappingWarnings.some((w) => w.code === "financial_field_blocked")
          ? "SAFE_WITH_WARNING"
          : "SAFE",
      blockedFields: mapped.mappingWarnings
        .filter((w) => w.code === "financial_field_blocked")
        .map((w) => w.field!)
        .filter(Boolean),
    });
  }
}
