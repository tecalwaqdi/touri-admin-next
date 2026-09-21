/**
 * Legacy Region SoT = Firestore `cities` (not product cities / villages).
 * Hierarchy: Country → Region → City(village) → Landmark.
 * regionId on cities/landmarks is nullable — never fabricate.
 */

export type RegionActiveStatus = "active" | "inactive" | "unknown";

export type RegionMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "malformed"
  | "testOrNoncanonical";

export type CanonicalRegionReadModel = {
  id: string;
  sourceDocumentId: string;
  canonicalRegionId: string;
  safeName: string;
  nameAr: string | null;
  nameEn: string | null;
  countryId: string | null;
  activeStatus: RegionActiveStatus;
  mappingStatus: RegionMappingStatus;
  sorting: number | null;
  /** Legacy cities.img presence (regions SoT). */
  imagePresence?: "present" | "missing" | "unavailable";
  imageStorageKind?: string | null;
  source: "legacy_cities_regions";
  warnings: string[];
  mappingVersion: string;
};
