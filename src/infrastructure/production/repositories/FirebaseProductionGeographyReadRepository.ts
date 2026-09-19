/**
 * Phase 4A-0/4A-1/4A-2/4A-3 — FirebaseProductionGeographyReadRepository.
 * Canonicalization; AMBIGUOUS_CITY → no auto-pick.
 * Phase 4A-1: LIVE_SHADOW_ALLOWED_RESOURCES gates countries vs cities vs landmarks.
 * Phase 4A-2: listCities reads Legacy `villages` (product cities), orderBy `naim`.
 * Phase 4A-3: listLandmarks reads Legacy `mkan`, orderBy `naim`.
 */

import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  CanonicalCityReadModel,
  CanonicalCountryReadModel,
  CanonicalLandmarkReadModel,
  CanonicalRegionReadModel,
  GeographyListFilter,
  ProductionGeographyReadRepository,
  ProductionReadContext,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import {
  assertPageLimit,
  envelopeOf,
  enforceKillSwitch,
  enforceLiveShadowResource,
  intersectScopeOrThrow,
  matchesGeographyCountryFilter,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";
import {
  mapCityFromLegacyDoc,
  mapCountryFromLegacyDoc,
  mapLandmarkFromLegacyDoc,
} from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { mapRegionFromLegacyDoc } from "@/infrastructure/production/mappers/mapRegionFromLegacyDoc";
import {
  loadCityAliases,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import {
  auditCityDuplicateIdentity,
  type CityDuplicateIdentityAuditResult,
} from "@/domain/geography/CityDuplicateIdentityAudit";
import {
  auditLandmarkDuplicateIdentity,
  type LandmarkDuplicateIdentityAuditResult,
} from "@/domain/geography/LandmarkDuplicateIdentityAudit";
import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";

export type CountryMappingStats = {
  recordsRead: number;
  /** @deprecated Prefer validMapped — kept for transitional callers. */
  mapped: number;
  withWarnings: number;
  /**
   * Count of valid-candidate records that failed canonical mapping.
   * Does NOT include test/noncanonical fixtures.
   * Phase 4A-1 success gate: unmappedValid === 0 (not “any unmapped allowed”).
   */
  unmapped: number;
  duplicates: number;
  validMapped: number;
  unmappedValid: number;
  testOrNoncanonical: number;
  malformed: number;
};

export type CityMappingStats = {
  recordsRead: number;
  validMapped: number;
  unmappedCountry: number;
  ambiguousCountry: number;
  testOrNoncanonical: number;
  malformed: number;
  inactive: number;
  withWarnings: number;
  /** Exact canonicalCityId collision groups (operational; excludes CP5). */
  exactCanonicalDuplicates: number;
  /** Semantic (country+normalizedName+region) collision groups. */
  semanticDuplicates: number;
  /** Active+active operational duplicate groups — readiness gate. */
  activeOperationalDuplicates: number;
};

export type LandmarkMappingStats = {
  recordsRead: number;
  validMapped: number;
  unmappedCountry: number;
  unmappedCity: number;
  ambiguousCountry: number;
  ambiguousCity: number;
  testOrNoncanonical: number;
  malformed: number;
  inactive: number;
  withWarnings: number;
  exactCanonicalDuplicates: number;
  semanticDuplicates: number;
  activeOperationalDuplicates: number;
};

export type FirebaseProductionGeographyReadRepositoryDeps = {
  client: FirestoreReadClient;
  productionReadEnabled: boolean;
  aliases?: CityAliasEntry[];
  observability?: ProductionReadObservability;
  /** When set, enforces LIVE_SHADOW_ALLOWED_RESOURCES. */
  liveShadowAllowedResources?: ReadonlySet<string>;
};

/** Phase 4A-2 live cities hard cap (first window). */
export const PHASE_4A2_CITIES_MAX_PAGE = 50;

/** Phase 4A-3 live landmarks hard cap (first window). */
export const PHASE_4A3_LANDMARKS_MAX_PAGE = 50;

export class FirebaseProductionGeographyReadRepository
  implements ProductionGeographyReadRepository
{
  readonly resource = "geography" as const;
  private readonly aliases: CityAliasEntry[];
  lastCountryMappingStats: CountryMappingStats | null = null;
  lastCityMappingStats: CityMappingStats | null = null;
  lastLandmarkMappingStats: LandmarkMappingStats | null = null;
  /** Full duplicate groups from last listCities page (read-only diagnostics). */
  lastCityDuplicateAudit: CityDuplicateIdentityAuditResult | null = null;
  /** Full duplicate groups from last listLandmarks page (read-only diagnostics). */
  lastLandmarkDuplicateAudit: LandmarkDuplicateIdentityAuditResult | null =
    null;

  constructor(
    private readonly deps: FirebaseProductionGeographyReadRepositoryDeps,
  ) {
    this.aliases = deps.aliases ?? loadCityAliases();
  }

  async listCountries(
    ctx: ProductionReadContext,
    filter: GeographyListFilter,
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalCountryReadModel>>> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "countries");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "countries",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryIds,
    });
    const normalizedPage = assertPageLimit(page);
    // PC-6: countries page cap aligns with WIF_NATIVE_MAX_READ_LIMIT (≤50).
    const limit = Math.min(normalizedPage.limit, 50);

    // Legacy Admin / Customer / Driver load countries via `naim` (not English `name`).
    // Firestore orderBy(field) also requires field existence — orderBy("name")
    // silently drops real countries that only have `naim` (e.g. Admin createCountriesRecordData).
    const result = await this.deps.client.query({
      collection: "countries",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit,
      startAfterCursor: normalizedPage.cursor,
    });

    const seenCanonical = new Map<string, number>();
    let validMapped = 0;
    let unmappedValid = 0;
    let testOrNoncanonical = 0;
    let malformed = 0;
    let withWarnings = 0;
    let duplicates = 0;

    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => {
        const mappedCountry = mapCountryFromLegacyDoc({
          documentId: d.id,
          data: d.data!,
        });
        if (mappedCountry.recordClassification === "test_or_noncanonical") {
          testOrNoncanonical += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "countries",
            warningCode: "test_or_noncanonical_country",
          });
        } else if (mappedCountry.recordClassification === "malformed") {
          malformed += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "countries",
            warningCode: "malformed_country",
          });
        } else if (mappedCountry.unmapped) {
          unmappedValid += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "countries",
            warningCode: "unmapped_country",
          });
        } else {
          validMapped += 1;
        }
        if (mappedCountry.warnings.length) {
          withWarnings += 1;
          for (const w of mappedCountry.warnings) {
            if (
              w.severity !== "info" &&
              w.code !== "test_or_noncanonical_country" &&
              w.code !== "malformed_country" &&
              w.code !== "unmapped_country"
            ) {
              this.deps.observability?.emit({
                type: "mapping_warning",
                resource: "countries",
                warningCode: w.code,
              });
            }
          }
        }
        // Duplicate detection only among successfully mapped canonical IDs
        if (
          mappedCountry.recordClassification === "valid_candidate" &&
          !mappedCountry.unmapped
        ) {
          const count = (seenCanonical.get(mappedCountry.canonicalId) ?? 0) + 1;
          seenCanonical.set(mappedCountry.canonicalId, count);
          if (count === 2) {
            duplicates += 1;
            this.deps.observability?.emit({
              type: "mapping_warning",
              resource: "countries",
              warningCode: "duplicate_canonical_country_id",
            });
          }
        }

        const model: CanonicalCountryReadModel = {
          id: mappedCountry.canonicalId,
          sourceDocumentId: mappedCountry.sourceDocumentId,
          name: mappedCountry.name,
          nameAr: mappedCountry.nameAr,
          nameEn: mappedCountry.nameEn,
          currencyCode: mappedCountry.currencyCode,
          mappingVersion: LEGACY_MAPPING_VERSION,
        };
        return envelopeOf(ctx, model, {
          mappingWarnings: mappedCountry.warnings,
          mappingConfidence: mappedCountry.mappingConfidence,
          readSafety: mappedCountry.unmapped ? "UNMAPPED" : "SAFE",
        });
      });

    this.lastCountryMappingStats = {
      recordsRead: items.length,
      mapped: validMapped,
      withWarnings,
      unmapped: unmappedValid,
      duplicates,
      validMapped,
      unmappedValid,
      testOrNoncanonical,
      malformed,
    };

    if (scoped.countryIds?.length) {
      items = items.filter((e) => scoped.countryIds!.includes(e.data.id));
    }

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
    };
  }

  async listCities(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string },
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalCityReadModel>>> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "cities");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "cities",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryId
        ? [filter.countryId]
        : filter.countryIds,
    });
    const normalizedPage = assertPageLimit(page);
    // Phase 4A-2 hard cap — Legacy cities live in `villages`; orderBy naim (not name).
    const limit = Math.min(normalizedPage.limit, PHASE_4A2_CITIES_MAX_PAGE);

    // Authoritative Legacy product-city collection is `villages`.
    // Country relation: DocumentReference field `dolh` (not string countryId).
    // Region relation: DocumentReference field `cities` (Legacy region parent).
    // Do NOT push Firestore where(dolh==…) without Admin DocumentReference values;
    // first live window + Fake path: orderBy naim + post-filter by mapped countryId.
    const result = await this.deps.client.query({
      collection: "villages",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit,
      startAfterCursor: normalizedPage.cursor,
    });

    let validMapped = 0;
    let unmappedCountry = 0;
    let ambiguousCountry = 0;
    let testOrNoncanonical = 0;
    let malformed = 0;
    let inactive = 0;
    let withWarnings = 0;

    const items: ProductionReadEnvelope<CanonicalCityReadModel>[] = [];
    for (const d of result.docs) {
      if (!d.exists || !d.data) continue;
      const mapped = mapCityFromLegacyDoc({
        documentId: d.id,
        data: d.data,
        aliases: this.aliases,
      });

      switch (mapped.mappingStatus) {
        case "validMapped":
          validMapped += 1;
          break;
        case "unmappedCountry":
          unmappedCountry += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "cities",
            warningCode: "unmapped_country",
          });
          break;
        case "ambiguousCountry":
          ambiguousCountry += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "cities",
            warningCode: "AMBIGUOUS_CITY",
          });
          break;
        case "testOrNoncanonical":
          testOrNoncanonical += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "cities",
            warningCode: "test_or_noncanonical_city",
          });
          break;
        case "malformed":
          malformed += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "cities",
            warningCode: "malformed_city",
          });
          break;
      }

      if (mapped.activeStatus === "inactive") inactive += 1;
      if (mapped.warnings.length) withWarnings += 1;

      const model: CanonicalCityReadModel = {
        id: mapped.id,
        sourceDocumentId: mapped.sourceDocumentId,
        canonicalCityId: mapped.canonicalCityId,
        safeName: mapped.safeName,
        nameAr: mapped.nameAr,
        nameEn: mapped.nameEn,
        countryId: mapped.countryId,
        regionId: mapped.regionId,
        activeStatus: mapped.activeStatus,
        mappingStatus: mapped.mappingStatus,
        source: mapped.source,
        warnings: mapped.warnings.map((w) => w.code),
        name: mapped.safeName,
        aliasResolved: mapped.aliasResolved,
        mappingVersion: LEGACY_MAPPING_VERSION,
      };

      items.push(
        envelopeOf(ctx, model, {
          mappingWarnings: mapped.warnings,
          mappingConfidence: mapped.mappingConfidence,
          readSafety: mapped.unmapped ? "UNMAPPED" : "SAFE",
        }),
      );
    }

    const duplicateAudit = auditCityDuplicateIdentity(
      items.map((e) => ({
        sourceDocumentId: e.data.sourceDocumentId,
        canonicalCityId: e.data.canonicalCityId,
        safeName: e.data.safeName,
        countryId: e.data.countryId,
        regionId: e.data.regionId,
        activeStatus: e.data.activeStatus,
        mappingStatus: e.data.mappingStatus,
      })),
    );
    this.lastCityDuplicateAudit = duplicateAudit;

    if (duplicateAudit.exactCanonicalDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "cities",
        warningCode: "exact_canonical_city_duplicates",
      });
    }
    if (duplicateAudit.semanticDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "cities",
        warningCode: "semantic_city_duplicates",
      });
    }
    if (duplicateAudit.activeOperationalDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "cities",
        warningCode: "active_operational_city_duplicates",
      });
    }

    this.lastCityMappingStats = {
      recordsRead: items.length,
      validMapped,
      unmappedCountry,
      ambiguousCountry,
      testOrNoncanonical,
      malformed,
      inactive,
      withWarnings,
      exactCanonicalDuplicates: duplicateAudit.exactCanonicalDuplicates,
      semanticDuplicates: duplicateAudit.semanticDuplicates,
      activeOperationalDuplicates: duplicateAudit.activeOperationalDuplicates,
    };

    // Country scope / filter — prevent cross-country leakage after mapping.
    let filtered = items;
    const allowedCountries = scoped.countryIds;
    if (allowedCountries?.length) {
      filtered = filtered.filter((e) =>
        allowedCountries.some((allowed) =>
          matchesGeographyCountryFilter(allowed, {
            countryId: e.data.countryId,
          }),
        ),
      );
    }
    if (filter.countryId) {
      filtered = filtered.filter((e) =>
        matchesGeographyCountryFilter(filter.countryId, {
          countryId: e.data.countryId,
        }),
      );
    }

    return {
      items: filtered,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
    };
  }

  async listLandmarks(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string; cityId?: string },
    page: CursorPageRequest,
  ): Promise<
    CursorPageResult<ProductionReadEnvelope<CanonicalLandmarkReadModel>>
  > {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(
      this.deps.liveShadowAllowedResources,
      "landmarks",
    );
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "landmarks",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryId
        ? [filter.countryId]
        : filter.countryIds,
      cityIds: filter.cityId ? [filter.cityId] : undefined,
    });
    const normalizedPage = assertPageLimit(page);
    // Phase 4A-3 hard cap — Legacy landmarks live in `mkan`; orderBy naim.
    const limit = Math.min(normalizedPage.limit, PHASE_4A3_LANDMARKS_MAX_PAGE);

    // Authoritative Legacy landmark collection is `mkan`.
    // Country: Rev_dolh → countries/{id}; City: id_vill → villages/{id};
    // Region: id_cit → cities/{id} (optional).
    // Do NOT push Firestore where(Rev_dolh/id_vill==…) without Admin refs;
    // first live window: orderBy naim + post-filter by mapped country/city.
    // Country/city tables from code — NO listCountries/listCities during window.
    const result = await this.deps.client.query({
      collection: "mkan",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit,
      startAfterCursor: normalizedPage.cursor,
    });

    let validMapped = 0;
    let unmappedCountry = 0;
    let unmappedCity = 0;
    let ambiguousCountry = 0;
    let ambiguousCity = 0;
    let testOrNoncanonical = 0;
    let malformed = 0;
    let inactive = 0;
    let withWarnings = 0;

    const items: ProductionReadEnvelope<CanonicalLandmarkReadModel>[] = [];
    for (const d of result.docs) {
      if (!d.exists || !d.data) continue;
      let mapped;
      try {
        mapped = mapLandmarkFromLegacyDoc({
          documentId: d.id,
          data: d.data,
          aliases: this.aliases,
        });
      } catch (err) {
        // Malformed / unexpected Legacy shapes must not 500 the whole page.
        this.deps.observability?.emit({
          type: "mapping_failure",
          resource: "landmarks",
          warningCode: "malformed_landmark",
        });
        const safeName =
          typeof d.data.naim === "string" && d.data.naim.trim()
            ? d.data.naim.trim()
            : d.id;
        mapped = {
          id: d.id,
          sourceDocumentId: d.id,
          canonicalLandmarkId: d.id,
          safeName,
          nameAr: typeof d.data.naim === "string" ? d.data.naim : null,
          nameEn: typeof d.data.name === "string" ? d.data.name : null,
          countryId: "",
          sourceCountryDocumentId: "",
          canonicalCountryId: "",
          cityId: "",
          regionId: null,
          activeStatus: "unknown" as const,
          mappingStatus: "malformed" as const,
          coordinates: null,
          imageSummary: { hasImage: false, imageCount: 0, storageKind: "unknown" as const },
          source: "legacy_mkan" as const,
          warnings: [
            {
              code: "malformed_landmark" as const,
              field: "id",
              message:
                err instanceof Error
                  ? `Mapper exception isolated: ${err.message.slice(0, 120)}`
                  : "Mapper exception isolated",
              severity: "error" as const,
            },
          ],
          mappingConfidence: "unknown" as const,
          unmapped: true,
        };
      }

      switch (mapped.mappingStatus) {
        case "validMapped":
          validMapped += 1;
          break;
        case "unmappedCountry":
          unmappedCountry += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "landmarks",
            warningCode: "unmapped_country",
          });
          break;
        case "unmappedCity":
          unmappedCity += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "landmarks",
            warningCode: "unmapped_city",
          });
          break;
        case "ambiguousCountry":
          ambiguousCountry += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "landmarks",
            warningCode: "ambiguous_country",
          });
          break;
        case "ambiguousCity":
          ambiguousCity += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "landmarks",
            warningCode: "ambiguous_city",
          });
          break;
        case "testOrNoncanonical":
          testOrNoncanonical += 1;
          this.deps.observability?.emit({
            type: "mapping_warning",
            resource: "landmarks",
            warningCode: "test_or_noncanonical_landmark",
          });
          break;
        case "malformed":
          malformed += 1;
          this.deps.observability?.emit({
            type: "mapping_failure",
            resource: "landmarks",
            warningCode: "malformed_landmark",
          });
          break;
      }

      if (mapped.activeStatus === "inactive") inactive += 1;
      if (mapped.warnings.length) withWarnings += 1;

      const model: CanonicalLandmarkReadModel = {
        id: mapped.id,
        sourceDocumentId: mapped.sourceDocumentId,
        canonicalLandmarkId: mapped.canonicalLandmarkId,
        safeName: mapped.safeName,
        nameAr: mapped.nameAr,
        nameEn: mapped.nameEn,
        countryId: mapped.countryId,
        sourceCountryDocumentId: mapped.sourceCountryDocumentId,
        canonicalCountryId: mapped.canonicalCountryId,
        cityId: mapped.cityId,
        regionId: mapped.regionId,
        activeStatus: mapped.activeStatus,
        mappingStatus: mapped.mappingStatus,
        coordinates: mapped.coordinates,
        imageSummary: mapped.imageSummary,
        imagePreviewUrl: mapped.imagePreviewUrl ?? null,
        source: mapped.source,
        warnings: mapped.warnings.map((w) => w.code),
        mappingVersion: LEGACY_MAPPING_VERSION,
      };

      items.push(
        envelopeOf(ctx, model, {
          mappingWarnings: mapped.warnings,
          mappingConfidence: mapped.mappingConfidence,
          readSafety: mapped.unmapped ? "UNMAPPED" : "SAFE",
        }),
      );
    }

    const duplicateAudit = auditLandmarkDuplicateIdentity(
      items.map((e) => ({
        sourceDocumentId: e.data.sourceDocumentId,
        canonicalLandmarkId: e.data.canonicalLandmarkId,
        safeName: e.data.safeName,
        countryId: e.data.countryId,
        cityId: e.data.cityId,
        regionId: e.data.regionId,
        activeStatus: e.data.activeStatus,
        mappingStatus: e.data.mappingStatus,
        coordinates: e.data.coordinates,
      })),
    );
    this.lastLandmarkDuplicateAudit = duplicateAudit;

    if (duplicateAudit.exactCanonicalDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "landmarks",
        warningCode: "exact_canonical_landmark_duplicates",
      });
    }
    if (duplicateAudit.semanticDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "landmarks",
        warningCode: "semantic_landmark_duplicates",
      });
    }
    if (duplicateAudit.activeOperationalDuplicates > 0) {
      this.deps.observability?.emit({
        type: "mapping_warning",
        resource: "landmarks",
        warningCode: "active_operational_landmark_duplicates",
      });
    }

    this.lastLandmarkMappingStats = {
      recordsRead: items.length,
      validMapped,
      unmappedCountry,
      unmappedCity,
      ambiguousCountry,
      ambiguousCity,
      testOrNoncanonical,
      malformed,
      inactive,
      withWarnings,
      exactCanonicalDuplicates: duplicateAudit.exactCanonicalDuplicates,
      semanticDuplicates: duplicateAudit.semanticDuplicates,
      activeOperationalDuplicates: duplicateAudit.activeOperationalDuplicates,
    };

    // Country/city scope — prevent cross-scope leakage after mapping.
    let filtered = items;
    const allowedCountries = scoped.countryIds;
    if (allowedCountries?.length) {
      filtered = filtered.filter((e) =>
        allowedCountries.some((allowed) =>
          matchesGeographyCountryFilter(allowed, {
            countryId: e.data.countryId,
            canonicalCountryId: e.data.canonicalCountryId,
            sourceCountryDocumentId: e.data.sourceCountryDocumentId,
          }),
        ),
      );
    }
    const allowedCities = scoped.cityIds;
    if (allowedCities?.length) {
      filtered = filtered.filter((e) => {
        const cid = e.data.cityId;
        return cid.length > 0 && allowedCities.includes(cid);
      });
    }
    if (filter.countryId) {
      filtered = filtered.filter((e) =>
        matchesGeographyCountryFilter(filter.countryId, {
          countryId: e.data.countryId,
          canonicalCountryId: e.data.canonicalCountryId,
          sourceCountryDocumentId: e.data.sourceCountryDocumentId,
        }),
      );
    }
    if (filter.cityId) {
      filtered = filtered.filter((e) => e.data.cityId === filter.cityId);
    }

    return {
      items: filtered,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
    };
  }

  async getCountryById(
    ctx: ProductionReadContext,
    countryId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCountryReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "countries");
    const id = countryId.trim();
    if (!id) return null;
    const doc = await this.deps.client.getDocument("countries", id);
    if (!doc?.exists || !doc.data) return null;
    const mappedCountry = mapCountryFromLegacyDoc({
      documentId: doc.id,
      data: doc.data,
    });
    const model: CanonicalCountryReadModel = {
      id: mappedCountry.canonicalId,
      sourceDocumentId: mappedCountry.sourceDocumentId,
      name: mappedCountry.name,
      nameAr: mappedCountry.nameAr,
      nameEn: mappedCountry.nameEn,
      currencyCode: mappedCountry.currencyCode,
      mappingVersion: LEGACY_MAPPING_VERSION,
    };
    intersectScopeOrThrow(ctx, {
      countryIds: [mappedCountry.canonicalId || doc.id],
    });
    return envelopeOf(ctx, model, {
      mappingWarnings: mappedCountry.warnings,
      mappingConfidence: mappedCountry.mappingConfidence,
      readSafety: mappedCountry.unmapped ? "UNMAPPED" : "SAFE",
    });
  }

  async getCityById(
    ctx: ProductionReadContext,
    cityId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCityReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "cities");
    const id = cityId.trim();
    if (!id) return null;
    const doc = await this.deps.client.getDocument("villages", id);
    if (!doc?.exists || !doc.data) return null;
    const mapped = mapCityFromLegacyDoc({
      documentId: doc.id,
      data: doc.data,
      aliases: this.aliases,
    });
    const model: CanonicalCityReadModel = {
      id: mapped.id,
      sourceDocumentId: mapped.sourceDocumentId,
      canonicalCityId: mapped.canonicalCityId,
      safeName: mapped.safeName,
      nameAr: mapped.nameAr,
      nameEn: mapped.nameEn,
      countryId: mapped.countryId,
      regionId: mapped.regionId,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      source: mapped.source,
      warnings: mapped.warnings.map((w) => w.code),
      name: mapped.safeName,
      aliasResolved: mapped.aliasResolved,
      mappingVersion: LEGACY_MAPPING_VERSION,
    };
    intersectScopeOrThrow(ctx, {
      countryIds: mapped.countryId ? [mapped.countryId] : undefined,
    });
    return envelopeOf(ctx, model, {
      mappingWarnings: mapped.warnings,
      mappingConfidence: mapped.mappingConfidence,
      readSafety: mapped.unmapped ? "UNMAPPED" : "SAFE",
    });
  }

  async listRegions(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string },
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalRegionReadModel>>> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "regions");
    this.deps.observability?.emit({
      type: "production_read_request",
      resource: "regions",
    });
    const scoped = intersectScopeOrThrow(ctx, {
      countryIds: filter.countryId
        ? [filter.countryId]
        : filter.countryIds,
    });
    const normalizedPage = assertPageLimit(page);
    const limit = Math.min(normalizedPage.limit, 50);

    // Legacy regions live in Firestore `cities` (not product villages).
    const result = await this.deps.client.query({
      collection: "cities",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit,
      startAfterCursor: normalizedPage.cursor,
    });

    let items = result.docs
      .filter((d) => d.exists && d.data)
      .map((d) => {
        const mapped = mapRegionFromLegacyDoc({
          documentId: d.id,
          data: d.data!,
        });
        const model: CanonicalRegionReadModel = {
          id: mapped.id,
          sourceDocumentId: mapped.sourceDocumentId,
          canonicalRegionId: mapped.canonicalRegionId,
          safeName: mapped.safeName,
          nameAr: mapped.nameAr,
          nameEn: mapped.nameEn,
          countryId: mapped.countryId,
          activeStatus: mapped.activeStatus,
          mappingStatus: mapped.mappingStatus,
          sorting: mapped.sorting,
          source: mapped.source,
          warnings: mapped.warnings,
          mappingVersion: mapped.mappingVersion,
        };
        return envelopeOf(ctx, model, {
          mappingWarnings: mapped.warnings.map((code) => ({
            code,
            field: "region",
            message: code,
            severity: "warning" as const,
          })),
          mappingConfidence:
            mapped.mappingStatus === "validMapped" ? "high" : "unknown",
          readSafety:
            mapped.mappingStatus === "unmappedCountry" ? "UNMAPPED" : "SAFE",
        });
      });

    if (scoped.countryIds?.length) {
      items = items.filter(
        (e) =>
          e.data.countryId != null &&
          scoped.countryIds!.includes(e.data.countryId),
      );
    } else if (filter.countryId) {
      items = items.filter((e) => e.data.countryId === filter.countryId);
    }

    return {
      items,
      nextCursor: result.nextCursor,
      truncated: result.nextCursor != null,
    };
  }

  async getRegionById(
    ctx: ProductionReadContext,
    regionId: string,
  ): Promise<ProductionReadEnvelope<CanonicalRegionReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(this.deps.liveShadowAllowedResources, "regions");
    const id = regionId.trim();
    if (!id) return null;
    const doc = await this.deps.client.getDocument("cities", id);
    if (!doc?.exists || !doc.data) return null;
    const mapped = mapRegionFromLegacyDoc({
      documentId: doc.id,
      data: doc.data,
    });
    const model: CanonicalRegionReadModel = {
      id: mapped.id,
      sourceDocumentId: mapped.sourceDocumentId,
      canonicalRegionId: mapped.canonicalRegionId,
      safeName: mapped.safeName,
      nameAr: mapped.nameAr,
      nameEn: mapped.nameEn,
      countryId: mapped.countryId,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      sorting: mapped.sorting,
      source: mapped.source,
      warnings: mapped.warnings,
      mappingVersion: mapped.mappingVersion,
    };
    if (mapped.countryId) {
      intersectScopeOrThrow(ctx, { countryIds: [mapped.countryId] });
    }
    return envelopeOf(ctx, model, {
      mappingWarnings: mapped.warnings.map((code) => ({
        code,
        field: "region",
        message: code,
        severity: "warning" as const,
      })),
      mappingConfidence:
        mapped.mappingStatus === "validMapped" ? "high" : "unknown",
      readSafety:
        mapped.mappingStatus === "unmappedCountry" ? "UNMAPPED" : "SAFE",
    });
  }

  async getLandmarkById(
    ctx: ProductionReadContext,
    landmarkId: string,
  ): Promise<ProductionReadEnvelope<CanonicalLandmarkReadModel> | null> {
    enforceKillSwitch(this.deps.productionReadEnabled);
    enforceLiveShadowResource(
      this.deps.liveShadowAllowedResources,
      "landmarks",
    );
    const id = landmarkId.trim();
    if (!id) return null;
    const doc = await this.deps.client.getDocument("mkan", id);
    if (!doc?.exists || !doc.data) return null;
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: doc.id,
      data: doc.data,
      aliases: this.aliases,
    });
    const model: CanonicalLandmarkReadModel = {
      id: mapped.id,
      sourceDocumentId: mapped.sourceDocumentId,
      canonicalLandmarkId: mapped.canonicalLandmarkId,
      safeName: mapped.safeName,
      nameAr: mapped.nameAr,
      nameEn: mapped.nameEn,
      countryId: mapped.countryId,
      sourceCountryDocumentId: mapped.sourceCountryDocumentId,
      canonicalCountryId: mapped.canonicalCountryId,
      cityId: mapped.cityId,
      regionId: mapped.regionId,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      coordinates: mapped.coordinates,
      imageSummary: mapped.imageSummary,
      imagePreviewUrl: mapped.imagePreviewUrl ?? null,
      source: mapped.source,
      warnings: mapped.warnings.map((w) => w.code),
      mappingVersion: LEGACY_MAPPING_VERSION,
    };
    intersectScopeOrThrow(ctx, {
      countryIds: mapped.canonicalCountryId
        ? [mapped.canonicalCountryId]
        : mapped.countryId
          ? [mapped.countryId]
          : undefined,
      cityIds: mapped.cityId ? [mapped.cityId] : undefined,
    });
    return envelopeOf(ctx, model, {
      mappingWarnings: mapped.warnings,
      mappingConfidence: mapped.mappingConfidence,
      readSafety: mapped.unmapped ? "UNMAPPED" : "SAFE",
    });
  }
}
