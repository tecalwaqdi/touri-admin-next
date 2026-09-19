/**
 * Geography list/detail DTOs (PC-6, read-only).
 */

import type { GeographyDqIssue, GeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import type { CountryIdentityClass } from "@/domain/geography/CountryIdentityClassification";
import type { CountryAgentInvariantState } from "@/domain/geography/CountryAgentInvariant";
import type { CurrencyAlignmentStatus } from "@/domain/geography/CurrencyAlignment";
import type { GeographyRecordClass } from "@/domain/geography/GeographyRecordClass";

export type UnavailableCount = {
  value: null;
  availability: "unavailable";
  accuracy: "unavailable";
};

export const UNAVAILABLE_COUNT: UnavailableCount = {
  value: null,
  availability: "unavailable",
  accuracy: "unavailable",
};

export type GeographyCountryListItem = {
  countryId: string;
  canonicalCountryId: string | null;
  identityClass: CountryIdentityClass;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  iso2: string | null;
  currencyCode: string | null;
  currencyExpected: string | null;
  currencyAlignment: CurrencyAlignmentStatus;
  status: "available" | "partial" | "unavailable";
  citiesCount: UnavailableCount;
  landmarksCount: UnavailableCount;
  activeAgentId: string | null;
  activeAgentName: string | null;
  inactiveAgentCount: number;
  /** Legacy StatusBadge enum. */
  invariant: "pass" | "fail_multiple_active" | "no_active_agent";
  agentInvariantState: CountryAgentInvariantState;
  dqSeverity: GeographyDqSeverity | null;
  dataQualityIssues: GeographyDqIssue[];
  /** @deprecated Prefer dataQualityIssues — kept for PC-1 GeographyPage compat. */
  dataQualityWarnings: Array<{
    code: string;
    messageEn: string;
    messageAr: string;
  }>;
  testOrNoncanonical: boolean;
  recordClass: GeographyRecordClass;
};

export type GeographyCityListItem = {
  cityId: string;
  sourceDocumentId: string;
  canonicalCityId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  countryDisplayName: string | null;
  activeStatus: string;
  mappingStatus: string;
  landmarksCount: UnavailableCount;
  dqSeverity: GeographyDqSeverity | null;
  dataQualityIssues: GeographyDqIssue[];
  recordClass: GeographyRecordClass;
};

export type GeographyLandmarkListItem = {
  landmarkId: string;
  sourceDocumentId: string;
  canonicalLandmarkId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  countryDisplayName: string | null;
  cityId: string | null;
  cityDisplayName: string | null;
  activeStatus: string;
  mappingStatus: string;
  category: string | null;
  imagePresence: "present" | "missing" | "unavailable";
  imageStorageKind: string | null;
  /** Admin detail thumbnail — https preview only; never gs://. */
  imagePreviewUrl?: string | null;
  coordinatesPresence: "present" | "missing" | "unavailable";
  visibilityStatus: string | null;
  dqSeverity: GeographyDqSeverity | null;
  dataQualityIssues: GeographyDqIssue[];
  recordClass: GeographyRecordClass;
};

export type GeographyCountryDetail = GeographyCountryListItem & {
  aliases: string[];
  relatedCities: Array<{
    cityId: string;
    displayName: string | null;
    activeStatus: string;
  }>;
  relatedCitiesBounded: true;
  relatedCitiesLimit: number;
};

export type GeographyCityDetail = GeographyCityListItem & {
  relatedLandmarks: Array<{
    landmarkId: string;
    displayName: string | null;
    activeStatus: string;
  }>;
  relatedLandmarksBounded: true;
  relatedLandmarksLimit: number;
};

export type GeographyLandmarkDetail = GeographyLandmarkListItem & {
  coordinates: { latitude: number; longitude: number } | null;
  createdAtUtc: string | null;
  updatedAtUtc: string | null;
};
