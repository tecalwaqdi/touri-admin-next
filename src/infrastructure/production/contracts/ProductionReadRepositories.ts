/**
 * Phase 4 DESIGN — resource-specific Production read repositories.
 * NOT a generic Firestore.query(collection).
 * NO firebase-admin init. NO Production credentials.
 */

import type { AccessScope } from "@/types/roles";
import type { CursorPageRequest, CursorPageResult } from "@/domain/read/ReadQuery";
import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import type { ProductionReadEnvelope } from "@/infrastructure/production/contracts/ProductionReadResponse";
import type { ScopedFilter } from "@/domain/read/ReadAuthorization";

export type ProductionReadContext = {
  scope: AccessScope;
  /** Server-built filter — MUST be applied before query. Client cannot expand. */
  serverScopeFilter: ScopedFilter;
  actorUid: string;
  permissions: string[];
  requestId: string;
  correlationId: string;
  /** Prefer reveal only when *:read_pii present — default false. */
  allowFullPii?: boolean;
};

export type TripListFilter = {
  countryIds?: string[];
  cityIds?: string[];
  agentIds?: string[];
  /** Inclusive ISO date window — default last 7 days in shadow design. */
  createdFromUtc?: string;
  createdToUtc?: string;
  statusCodes?: string[];
  /**
   * Option B bounded fallback: ONE page orderBy(data_order,desc) limit≤50
   * with no date-range filters. Ignores createdFrom/To. Still one Firestore
   * query — never auto-paginated / unbounded.
   */
  boundedLatestPage?: boolean;
};

export type DriverListFilter = {
  countryIds?: string[];
  cityIds?: string[];
  online?: boolean;
};

export type AgentListFilter = {
  countryIds?: string[];
};

export type CustomerSummaryListFilter = {
  countryIds?: string[];
  cityIds?: string[];
};

export type GeographyListFilter = {
  countryIds?: string[];
};

export type CanonicalCountryReadModel = {
  id: string;
  /** Firestore countries/{id} when distinct from aliased canonical id. */
  sourceDocumentId?: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  currencyCode: string | null;
  iso2?: string | null;
  mappingVersion: string;
};

/**
 * Phase 4A-2 canonical city read contract.
 * Source collection is Legacy `villages` (product cities). Resource token remains `cities`.
 */
export type CityActiveStatus = "active" | "inactive" | "unknown";

export type CityMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "ambiguousCountry"
  | "malformed"
  | "testOrNoncanonical";

export type CanonicalCityReadModel = {
  /**
   * Canonical identity (alias-resolved). May collide across source docs —
   * always pair with `sourceDocumentId` for diagnostics.
   */
  id: string;
  /** Firestore villages/{id} document id — never collapsed by alias remap. */
  sourceDocumentId: string;
  /** Same as `id`; explicit for duplicate audits. */
  canonicalCityId: string;
  safeName: string;
  nameAr?: string | null;
  nameEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  countryId: string;
  regionId: string | null;
  activeStatus: CityActiveStatus;
  mappingStatus: CityMappingStatus;
  coordinates?: LandmarkCoordinatesRead;
  source: "legacy_villages";
  warnings: string[];
  /** @deprecated Prefer safeName — kept for transitional callers. */
  name: string;
  aliasResolved: boolean;
  mappingVersion: string;
};

/**
 * Phase 4A-3 canonical landmark read contract.
 * Source collection is Legacy `mkan`. Resource token is `landmarks`.
 */
export type LandmarkActiveStatus = "active" | "inactive" | "unknown";

export type LandmarkMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "unmappedCity"
  | "ambiguousCountry"
  | "ambiguousCity"
  | "malformed"
  | "testOrNoncanonical";

export type LandmarkImageSummaryRead = {
  hasImage: boolean;
  imageCount: number | null;
  storageKind: "firebase_storage" | "http_url" | "mixed" | "unknown";
};

export type LandmarkCoordinatesRead = {
  latitude: number;
  longitude: number;
} | null;

/**
 * Legacy Region SoT = Firestore `cities` (country→region).
 * Product cities remain `villages` (CanonicalCityReadModel).
 * regionId on cities/landmarks is nullable — never fabricate.
 */
export type CanonicalRegionReadModel = {
  id: string;
  sourceDocumentId: string;
  canonicalRegionId: string;
  safeName: string;
  nameAr?: string | null;
  nameEn?: string | null;
  countryId: string | null;
  activeStatus: CityActiveStatus;
  mappingStatus:
    | "validMapped"
    | "unmappedCountry"
    | "malformed"
    | "testOrNoncanonical";
  sorting: number | null;
  source: "legacy_cities_regions";
  warnings: string[];
  mappingVersion: string;
};

export type CanonicalLandmarkReadModel = {
  /**
   * Canonical identity. May collide across source docs —
   * always pair with `sourceDocumentId` for diagnostics.
   */
  id: string;
  /** Firestore mkan/{id} document id — never collapsed. */
  sourceDocumentId: string;
  /** Same as `id`; explicit for duplicate audits. */
  canonicalLandmarkId: string;
  safeName: string;
  nameAr?: string | null;
  nameEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  /**
   * Resolved country identity (alias-collapsed). Prefer `canonicalCountryId`.
   * Example: Rev_dolh countries/demo_saudi → saudi_arabia.
   */
  countryId: string;
  /**
   * Raw Rev_dolh countries/{id} document id — never alias-collapsed.
   * Preserves Legacy source even when countryId/canonicalCountryId remap.
   */
  sourceCountryDocumentId: string;
  /** Alias-resolved canonical country id (empty when country unmapped). */
  canonicalCountryId: string;
  cityId: string;
  regionId: string | null;
  category: string | null;
  address: string | null;
  isMosque: boolean | null;
  isFood: boolean | null;
  isRestroom: boolean | null;
  asAds: boolean | null;
  rate: number | null;
  activeStatus: LandmarkActiveStatus;
  mappingStatus: LandmarkMappingStatus;
  coordinates: LandmarkCoordinatesRead;
  imageSummary: LandmarkImageSummaryRead;
  /** Admin detail https thumbnail only. */
  imagePreviewUrl?: string | null;
  source: "legacy_mkan";
  warnings: string[];
  mappingVersion: string;
};

/**
 * Resource-specific ONLY — implementations must reject unknown collections.
 */
export interface ProductionTripReadRepository {
  readonly resource: "trips";
  list(
    ctx: ProductionReadContext,
    filter: TripListFilter,
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalTripReadModel>>>;
  getById(
    ctx: ProductionReadContext,
    tripId: string,
  ): Promise<ProductionReadEnvelope<CanonicalTripReadModel> | null>;
}

export interface ProductionDriverReadRepository {
  readonly resource: "drivers";
  list(
    ctx: ProductionReadContext,
    filter: DriverListFilter,
    page: CursorPageRequest,
  ): Promise<
    CursorPageResult<ProductionReadEnvelope<CanonicalDriverReadModel>>
  >;
  getById(
    ctx: ProductionReadContext,
    driverId: string,
  ): Promise<ProductionReadEnvelope<CanonicalDriverReadModel> | null>;
}

export interface ProductionAgentReadRepository {
  readonly resource: "agents";
  list(
    ctx: ProductionReadContext,
    filter: AgentListFilter,
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalAgentReadModel>>>;
  getById(
    ctx: ProductionReadContext,
    agentId: string,
  ): Promise<ProductionReadEnvelope<CanonicalAgentReadModel> | null>;
}

export interface ProductionCustomerReadRepository {
  readonly resource: "customers";
  /** Summary only — masked PII by default. */
  listSummary(
    ctx: ProductionReadContext,
    filter: CustomerSummaryListFilter,
    page: CursorPageRequest,
  ): Promise<
    CursorPageResult<ProductionReadEnvelope<CanonicalCustomerReadModel>>
  >;
  getSummaryById(
    ctx: ProductionReadContext,
    customerId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCustomerReadModel> | null>;
}

export interface ProductionGeographyReadRepository {
  readonly resource: "geography";
  listCountries(
    ctx: ProductionReadContext,
    filter: GeographyListFilter,
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalCountryReadModel>>>;
  listCities(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string },
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalCityReadModel>>>;
  /**
   * P0 — Legacy `cities` regions. Resource gate token: `regions`.
   * Nullable country when unmapped — never fabricate.
   */
  listRegions?(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string },
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalRegionReadModel>>>;
  getRegionById?(
    ctx: ProductionReadContext,
    regionId: string,
  ): Promise<ProductionReadEnvelope<CanonicalRegionReadModel> | null>;
  /**
   * Phase 4A-3 — Legacy `mkan` landmarks. Resource gate token: `landmarks`.
   * Country/city scope applied after mapping (no extra geo Firestore queries).
   */
  listLandmarks(
    ctx: ProductionReadContext,
    filter: GeographyListFilter & { countryId?: string; cityId?: string },
    page: CursorPageRequest,
  ): Promise<CursorPageResult<ProductionReadEnvelope<CanonicalLandmarkReadModel>>>;
  getCountryById?(
    ctx: ProductionReadContext,
    countryId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCountryReadModel> | null>;
  getCityById?(
    ctx: ProductionReadContext,
    cityId: string,
  ): Promise<ProductionReadEnvelope<CanonicalCityReadModel> | null>;
  getLandmarkById?(
    ctx: ProductionReadContext,
    landmarkId: string,
  ): Promise<ProductionReadEnvelope<CanonicalLandmarkReadModel> | null>;
}

export type ProductionReadRepositories = {
  trips: ProductionTripReadRepository;
  drivers: ProductionDriverReadRepository;
  agents: ProductionAgentReadRepository;
  customers: ProductionCustomerReadRepository;
  geography: ProductionGeographyReadRepository;
};
