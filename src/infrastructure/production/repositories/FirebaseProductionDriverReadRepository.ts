/**
 * Phase 4A-5 — FirebaseProductionDriverReadRepository.
 * Authoritative collection: Legacy Firestore `user` with discriminator `ismndob==true`.
 * Query: ismndob==true, orderBy created_time desc (or documentId), cursor, limit≤50.
 * Country/city scope applied post-map (Rev_dolh / mndob_vill are DocumentReferences).
 * No N+1 order / Storage / Auth Admin lookups. No approve/reject/suspend writes.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  DriverListFilter,
  ProductionDriverReadRepository,
  ProductionReadContext,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import { DefaultLegacyDriverMapper } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  assertPageLimit,
  envelopeOf,
  enforceKillSwitch,
  enforceLiveShadowResource,
  intersectScopeOrThrow,
  ScopeDeniedError,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import { SOURCE_SCHEMA_VERSION_UNKNOWN } from "@/domain/production-read/constants";
import type { ProductionDriverSourceRecord } from "@/infrastructure/production/contracts/ProductionSourceRecords";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { mapCanonicalDriverFromLegacyDoc } from "@/domain/driver/mapCanonicalDriverRead";
import {
  auditDriverDuplicates,
  hashDriverPhoneForAudit,
  hashDriverPlateForAudit,
  rowFromCanonicalDriver,
  type DriverDuplicateAuditMetrics,
} from "@/domain/driver/DriverDuplicateIdentityAudit";
import {
  selectDriverDiagnosticsForLiveSummary,
  type DriverMappingDiagnostic,
} from "@/domain/driver/DriverMappingDiagnostic";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";

/** Phase 4A-5 hard cap — operator live window max page. */
export const PHASE_4A5_DRIVERS_MAX_PAGE = 50;

/** Proven Legacy list/sort field when date window used (AdminOpsFilters). */
export const PHASE_4A5_DRIVER_TIMESTAMP_FIELD = "created_time" as const;

/** Primary Firestore discriminator (Admin dashboard + ops filters). */
export const PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD = "ismndob" as const;

export type DriverQueryMeta = {
  queryTimestampField: typeof PHASE_4A5_DRIVER_TIMESTAMP_FIELD | "__name__";
  queryOrderDirection: "desc" | "asc";
  queryLimit: number;
  discriminatorField: typeof PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD;
  discriminatorValue: true;
};

export type FirebaseProductionDriverReadRepositoryDeps = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  observability?: ProductionReadObservability;
  liveShadowAllowedResources?: ReadonlySet<string>;
  aliases?: CityAliasEntry[];
};

export type DriverListPageResult =
  CursorPageResult<ProductionReadEnvelope<CanonicalDriverReadModel>> & {
    auditMetrics: DriverDuplicateAuditMetrics;
    queryMeta: DriverQueryMeta;
    /** Safe mapping diagnostics for live summary (no PII). */
    driverMappingDiagnostics: DriverMappingDiagnostic[];
  };

export class FirebaseProductionDriverReadRepository
  implements ProductionDriverReadRepository
{
  readonly resource = "drivers" as const;
  private readonly mapper = new DefaultLegacyDriverMapper();

  constructor(private readonly deps: FirebaseProductionDriverReadRepositoryDeps) {}

  async list(
    ctx: ProductionReadContext,
    filter: DriverListFilter,
    page: CursorPageRequest,
  ): Promise<DriverListPageResult> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "drivers");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "drivers",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryIds,
      cityIds: filter.cityIds,
    });
    const normalizedPage = assertPageLimit(page);
    if (normalizedPage.limit > PHASE_4A5_DRIVERS_MAX_PAGE) {
      throw new QuerySafetyError(
        `Driver page limit ${normalizedPage.limit} exceeds PHASE_4A5_DRIVERS_MAX_PAGE=${PHASE_4A5_DRIVERS_MAX_PAGE}`,
      );
    }

    // Proven Admin list: where ismndob==true; orderBy created_time or documentId.
    // Country DocumentReference filter deferred — post-map scope (same as Trips 4A-4).
    const result = await this.deps.client.query({
      collection: "user",
      filters: [
        {
          field: PHASE_4A5_DRIVER_DISCRIMINATOR_FIELD,
          op: "==",
          value: true,
        },
      ],
      orderBy: [{ field: "created_time", direction: "desc" }],
      limit: Math.min(normalizedPage.limit, PHASE_4A5_DRIVERS_MAX_PAGE),
      startAfterCursor: normalizedPage.cursor,
    });

    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => this.mapDoc(ctx, d.id, d.data!));

    // Post-map geography scope (Rev_dolh / mndob_vill are DocumentReferences).
    if (scoped.countryIds?.length) {
      items = items.filter((e) => {
        const c = e.data.countryId.value;
        return c != null && scoped.countryIds!.includes(c);
      });
    }
    if (scoped.cityIds?.length) {
      items = items.filter((e) => {
        const c = e.data.cityId.value;
        return c != null && scoped.cityIds!.includes(c);
      });
    }
    if (filter.online != null) {
      items = items.filter((e) => e.data.online.value === filter.online);
    }

    const auditRows = items.map((e) => {
      const raw = e.data;
      // Phone/plate hashes from blocked raw are not on model — audit uses model ids only here.
      return rowFromCanonicalDriver(raw, {
        phoneHash: null,
        plateHash: raw.vehicle.platePresent
          ? hashDriverPlateForAudit(raw.vehicle.plateMasked)
          : null,
      });
    });
    // Prefer hashing from source before redaction when available via mapper path —
    // list path does not re-expose phone; phoneHash stays null unless caller supplies.
    void hashDriverPhoneForAudit;

    const auditMetrics = auditDriverDuplicates(auditRows, {
      unexpectedCollections: 0,
    });
    const driverMappingDiagnostics = selectDriverDiagnosticsForLiveSummary(
      items.map((e) => e.data),
    );

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
      auditMetrics,
      driverMappingDiagnostics,
      queryMeta: {
        queryTimestampField: "created_time",
        queryOrderDirection: "desc",
        queryLimit: Math.min(normalizedPage.limit, PHASE_4A5_DRIVERS_MAX_PAGE),
        discriminatorField: "ismndob",
        discriminatorValue: true,
      },
    };
  }

  async getById(
    ctx: ProductionReadContext,
    driverId: string,
  ): Promise<ProductionReadEnvelope<CanonicalDriverReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "drivers");
    const scoped = intersectScopeOrThrow(ctx, {});
    const snap = await this.deps.client.getDocument("user", driverId);
    if (!snap.exists || !snap.data) return null;

    // Reject non-driver docs (shared user collection).
    if (snap.data.ismndob !== true && snap.data.ismndom !== true) {
      return null;
    }

    const mapped = this.mapDoc(ctx, snap.id, snap.data);
    const countryId = mapped.data.countryId.value;
    if (
      scoped.countryIds?.length &&
      countryId &&
      !scoped.countryIds.includes(countryId)
    ) {
      throw new ScopeDeniedError("driver outside authorized country scope");
    }
    return mapped;
  }

  private mapDoc(
    ctx: ProductionReadContext,
    id: string,
    data: Record<string, unknown>,
  ): ProductionReadEnvelope<CanonicalDriverReadModel> {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: id,
      data,
      aliases: this.deps.aliases,
    });
    // Keep mapper class for contract parity / observability.
    void this.mapper;

    const source: ProductionDriverSourceRecord = {
      resource: "driver",
      sourceCollection: "user",
      sourceDocumentId: id,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION_UNKNOWN,
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: data,
    };
    void source;

    return envelopeOf(ctx, mapped.model, {
      mappingWarnings: mapped.mappingWarnings,
      mappingConfidence: mapped.mappingConfidence,
      blockedFields: [
        "phone_number",
        "phone_n",
        "email",
        "img_id",
        "img_id_rksh",
        "img_id_car",
        "ID_hoyh_MNDOB",
        "ipanBank",
        "bankIdAcc",
        "photo_url",
        "number_lohh_car",
      ],
      piiRedacted: true,
      readSafety: "REDACTED",
    });
  }
}
