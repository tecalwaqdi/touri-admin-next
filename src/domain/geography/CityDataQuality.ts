/**
 * City data-quality detectors (PC-6, read-only).
 */

import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { isTestOrNoncanonicalCountryId } from "@/domain/geography/GeographyPresentation";

export type CityDqInput = {
  cityId: string;
  sourceDocumentId?: string | null;
  safeName?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
  countryId?: string | null;
  mappingStatus?: string | null;
  activeStatus?: string | null;
  warnings?: string[];
};

export function detectCityDataQualityIssues(
  city: CityDqInput,
): GeographyDqIssue[] {
  const issues: GeographyDqIssue[] = [];
  const id = city.cityId?.trim() || city.sourceDocumentId?.trim() || "";

  if (!id) {
    issues.push({
      code: "malformed_city_id",
      severity: "ERROR",
      messageEn: "Malformed city ID",
      messageAr: "معرّف مدينة تالف",
      entityKind: "city",
      entityId: id,
    });
  }

  if (!city.countryId?.trim()) {
    issues.push({
      code: "city_missing_country",
      severity: "ERROR",
      messageEn: "City missing country reference",
      messageAr: "المدينة بلا مرجع دولة",
      entityKind: "city",
      entityId: id,
    });
  } else if (
    city.mappingStatus === "unmappedCountry" ||
    (!tryCanonicalCountryId(city.countryId) &&
      !isTestOrNoncanonicalCountryId(city.countryId))
  ) {
    issues.push({
      code: "city_unknown_country",
      severity: "ERROR",
      messageEn: "City references unknown country",
      messageAr: "المدينة تشير إلى دولة غير معروفة",
      entityKind: "city",
      entityId: id,
    });
  }

  if (city.mappingStatus === "ambiguousCountry") {
    issues.push({
      code: "city_ambiguous_country",
      severity: "WARNING",
      messageEn: "City country mapping ambiguous",
      messageAr: "ربط دولة المدينة غامض",
      entityKind: "city",
      entityId: id,
    });
  }

  const hasLocalized =
    Boolean(city.nameAr?.trim()) ||
    Boolean(city.nameEn?.trim()) ||
    Boolean(city.safeName?.trim());
  if (!hasLocalized) {
    issues.push({
      code: "city_missing_display_name",
      severity: "WARNING",
      messageEn: "Missing city display name",
      messageAr: "اسم المدينة غير متوفر",
      entityKind: "city",
      entityId: id,
    });
  } else if (!city.nameEn?.trim() && !city.nameAr?.trim() && city.safeName === id) {
    issues.push({
      code: "city_name_falls_back_to_id",
      severity: "WARNING",
      messageEn: "City display name falls back to document ID",
      messageAr: "اسم المدينة يعود إلى معرّف المستند",
      entityKind: "city",
      entityId: id,
    });
  }

  if (city.activeStatus === "inactive") {
    issues.push({
      code: "city_inactive",
      severity: "INFO",
      messageEn: "City marked inactive",
      messageAr: "المدينة غير نشطة",
      entityKind: "city",
      entityId: id,
    });
  }

  if (
    city.mappingStatus === "testOrNoncanonical" ||
    city.mappingStatus === "malformed"
  ) {
    issues.push({
      code: "city_test_or_malformed",
      severity: city.mappingStatus === "malformed" ? "ERROR" : "WARNING",
      messageEn: `City mapping status: ${city.mappingStatus}`,
      messageAr: `حالة ربط المدينة: ${city.mappingStatus}`,
      entityKind: "city",
      entityId: id,
    });
  }

  for (const w of city.warnings ?? []) {
    if (w === "missing_country_relation" || w === "unmapped_country") {
      // already covered
      continue;
    }
  }

  return issues;
}

/**
 * Detect duplicate city names within the same country on a bounded page.
 */
export function detectDuplicateCityNamesInCountry(
  cities: readonly CityDqInput[],
): GeographyDqIssue[] {
  const issues: GeographyDqIssue[] = [];
  const byKey = new Map<string, CityDqInput[]>();
  for (const city of cities) {
    const country = (city.countryId ?? "").trim().toLowerCase();
    const name = (city.safeName ?? city.nameEn ?? city.nameAr ?? "")
      .trim()
      .toLowerCase();
    if (!country || !name) continue;
    const key = `${country}::${name}`;
    const list = byKey.get(key) ?? [];
    list.push(city);
    byKey.set(key, list);
  }
  for (const [, members] of byKey) {
    if (members.length < 2) continue;
    for (const m of members) {
      issues.push({
        code: "duplicate_city_name_in_country",
        severity: "WARNING",
        messageEn: "Duplicate city name within same country (bounded page)",
        messageAr: "اسم مدينة مكرر ضمن نفس الدولة (صفحة محدودة)",
        entityKind: "city",
        entityId: m.cityId || m.sourceDocumentId,
      });
    }
  }
  return issues;
}
