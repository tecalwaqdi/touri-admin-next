/**
 * Landmark data-quality detectors (PC-6, read-only).
 * Metadata-only — no external image fetch / Storage mutation.
 */

import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";
import {
  countryIdsEqual,
  tryCanonicalCountryId,
} from "@/domain/geography/CanonicalCountryId";

export type LandmarkDqInput = {
  landmarkId: string;
  sourceDocumentId?: string | null;
  safeName?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
  countryId?: string | null;
  canonicalCountryId?: string | null;
  sourceCountryDocumentId?: string | null;
  cityId?: string | null;
  mappingStatus?: string | null;
  activeStatus?: string | null;
  hasImage?: boolean | null;
  imageCount?: number | null;
  storageKind?: string | null;
  hasCoordinates?: boolean | null;
  warnings?: string[];
  /** Optional expected country for city (when known from related read). */
  expectedCityCountryId?: string | null;
};

export function detectLandmarkDataQualityIssues(
  landmark: LandmarkDqInput,
): GeographyDqIssue[] {
  const issues: GeographyDqIssue[] = [];
  const id =
    landmark.landmarkId?.trim() || landmark.sourceDocumentId?.trim() || "";

  if (!landmark.countryId?.trim() && !landmark.canonicalCountryId?.trim()) {
    issues.push({
      code: "landmark_missing_country",
      severity: "ERROR",
      messageEn: "Landmark missing country reference",
      messageAr: "المعلم بلا مرجع دولة",
      entityKind: "landmark",
      entityId: id,
    });
  } else if (
    landmark.mappingStatus === "unmappedCountry" ||
    (landmark.countryId &&
      !tryCanonicalCountryId(landmark.countryId) &&
      !tryCanonicalCountryId(landmark.canonicalCountryId) &&
      landmark.mappingStatus !== "testOrNoncanonical")
  ) {
    issues.push({
      code: "landmark_unknown_country",
      severity: "ERROR",
      messageEn: "Landmark references unknown country",
      messageAr: "المعلم يشير إلى دولة غير معروفة",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (!landmark.cityId?.trim() || landmark.mappingStatus === "unmappedCity") {
    issues.push({
      code: "landmark_missing_city",
      severity: "ERROR",
      messageEn: "Landmark missing or unmapped city reference",
      messageAr: "المعلم بلا مرجع مدينة أو غير مربوط",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (
    landmark.expectedCityCountryId &&
    (landmark.canonicalCountryId || landmark.countryId) &&
    !countryIdsEqual(
      landmark.expectedCityCountryId,
      landmark.canonicalCountryId ?? landmark.countryId,
    )
  ) {
    issues.push({
      code: "landmark_country_city_mismatch",
      severity: "ERROR",
      messageEn: "Landmark country/city mismatch",
      messageAr: "عدم تطابق دولة/مدينة المعلم",
      entityKind: "landmark",
      entityId: id,
    });
  }

  const hasName =
    Boolean(landmark.nameAr?.trim()) ||
    Boolean(landmark.nameEn?.trim()) ||
    Boolean(landmark.safeName?.trim());
  if (!hasName) {
    issues.push({
      code: "landmark_missing_display_name",
      severity: "WARNING",
      messageEn: "Missing landmark display name",
      messageAr: "اسم المعلم غير متوفر",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (landmark.hasImage === false) {
    issues.push({
      code: "landmark_missing_image_metadata",
      severity: "WARNING",
      messageEn: "Landmark image metadata missing",
      messageAr: "بيانات صورة المعلم مفقودة",
      entityKind: "landmark",
      entityId: id,
    });
  } else if (landmark.storageKind === "unknown" && landmark.hasImage) {
    issues.push({
      code: "landmark_image_storage_unknown",
      severity: "INFO",
      messageEn: "Landmark image storage kind unknown (metadata only)",
      messageAr: "نوع تخزين صورة المعلم غير معروف (بيانات وصفية فقط)",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (landmark.hasCoordinates === false) {
    issues.push({
      code: "landmark_missing_coordinates",
      severity: "WARNING",
      messageEn: "Landmark coordinates missing",
      messageAr: "إحداثيات المعلم مفقودة",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (landmark.activeStatus === "inactive") {
    issues.push({
      code: "landmark_inactive",
      severity: "INFO",
      messageEn: "Landmark marked inactive",
      messageAr: "المعلم غير نشط",
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (
    landmark.mappingStatus === "testOrNoncanonical" ||
    landmark.mappingStatus === "malformed"
  ) {
    issues.push({
      code: "landmark_test_or_malformed",
      severity: landmark.mappingStatus === "malformed" ? "ERROR" : "WARNING",
      messageEn: `Landmark mapping status: ${landmark.mappingStatus}`,
      messageAr: `حالة ربط المعلم: ${landmark.mappingStatus}`,
      entityKind: "landmark",
      entityId: id,
    });
  }

  if (
    landmark.mappingStatus === "ambiguousCountry" ||
    landmark.mappingStatus === "ambiguousCity"
  ) {
    issues.push({
      code: "landmark_ambiguous_relation",
      severity: "WARNING",
      messageEn: `Landmark relation ambiguous (${landmark.mappingStatus})`,
      messageAr: `علاقة المعلم غامضة (${landmark.mappingStatus})`,
      entityKind: "landmark",
      entityId: id,
    });
  }

  return issues;
}
