/**
 * Read-only geography data-quality summary model (PC-6).
 * Counts from bounded windows must be labeled bounded_sample — never exact totals.
 */

import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";
import type { GeographyRecordClass } from "@/domain/geography/GeographyRecordClass";

export type GeographyMetricAccuracy = "exact" | "bounded_sample" | "unavailable";

export type GeographyDqMetric = {
  value: number | null;
  accuracy: GeographyMetricAccuracy;
  labelEn: string;
  labelAr: string;
};

export type GeographyDqSummary = {
  metricsAccuracy: "bounded_sample";
  boundedSampleLimit: number;
  truncated: boolean;
  countriesTotalInView: GeographyDqMetric;
  canonicalCountries: GeographyDqMetric;
  aliasesNormalized: GeographyDqMetric;
  legacyOrMalformedCountries: GeographyDqMetric;
  countriesWithoutActiveAgent: GeographyDqMetric;
  countriesWithDuplicateActiveAgents: GeographyDqMetric;
  countriesWithSuspiciousAgent: GeographyDqMetric;
  citiesWithBrokenCountryRefs: GeographyDqMetric;
  landmarksWithBrokenCityOrCountryRefs: GeographyDqMetric;
  landmarksMissingDisplayMetadata: GeographyDqMetric;
  qaPilotLegacyRecordCount: GeographyDqMetric;
  recordClassCounts: Partial<Record<GeographyRecordClass, number>>;
  topIssues: GeographyDqIssue[];
};

function metric(
  value: number,
  labelEn: string,
  labelAr: string,
): GeographyDqMetric {
  return {
    value,
    accuracy: "bounded_sample",
    labelEn,
    labelAr,
  };
}

export function buildGeographyDqSummary(input: {
  boundedSampleLimit: number;
  truncated: boolean;
  countriesTotalInView: number;
  canonicalCountries: number;
  aliasesNormalized: number;
  legacyOrMalformedCountries: number;
  countriesWithoutActiveAgent: number;
  countriesWithDuplicateActiveAgents: number;
  countriesWithSuspiciousAgent: number;
  citiesWithBrokenCountryRefs: number;
  landmarksWithBrokenCityOrCountryRefs: number;
  landmarksMissingDisplayMetadata: number;
  qaPilotLegacyRecordCount: number;
  recordClassCounts: Partial<Record<GeographyRecordClass, number>>;
  topIssues: GeographyDqIssue[];
}): GeographyDqSummary {
  return {
    metricsAccuracy: "bounded_sample",
    boundedSampleLimit: input.boundedSampleLimit,
    truncated: input.truncated,
    countriesTotalInView: metric(
      input.countriesTotalInView,
      "Countries in bounded view",
      "الدول في العرض المحدود",
    ),
    canonicalCountries: metric(
      input.canonicalCountries,
      "Canonical countries (bounded)",
      "دول معيارية (محدود)",
    ),
    aliasesNormalized: metric(
      input.aliasesNormalized,
      "Aliases normalized (bounded)",
      "أسماء مستعارة مُطبَّعة (محدود)",
    ),
    legacyOrMalformedCountries: metric(
      input.legacyOrMalformedCountries,
      "Legacy/malformed countries (bounded)",
      "دول تالفة/قديمة (محدود)",
    ),
    countriesWithoutActiveAgent: metric(
      input.countriesWithoutActiveAgent,
      "Countries without active agent (bounded)",
      "دول بلا وكيل نشط (محدود)",
    ),
    countriesWithDuplicateActiveAgents: metric(
      input.countriesWithDuplicateActiveAgents,
      "Countries with duplicate active agents (bounded)",
      "دول بوكلاء نشطين مكررين (محدود)",
    ),
    countriesWithSuspiciousAgent: metric(
      input.countriesWithSuspiciousAgent,
      "Suspicious agent mappings (bounded)",
      "تعيينات وكلاء مشبوهة (محدود)",
    ),
    citiesWithBrokenCountryRefs: metric(
      input.citiesWithBrokenCountryRefs,
      "Cities with broken country refs (bounded)",
      "مدن بمراجع دولة تالفة (محدود)",
    ),
    landmarksWithBrokenCityOrCountryRefs: metric(
      input.landmarksWithBrokenCityOrCountryRefs,
      "Landmarks with broken city/country refs (bounded)",
      "معالم بمراجع مدينة/دولة تالفة (محدود)",
    ),
    landmarksMissingDisplayMetadata: metric(
      input.landmarksMissingDisplayMetadata,
      "Landmarks missing display metadata (bounded)",
      "معالم بلا بيانات عرض (محدود)",
    ),
    qaPilotLegacyRecordCount: metric(
      input.qaPilotLegacyRecordCount,
      "QA/pilot/legacy records (bounded)",
      "سجلات QA/تجريبية/قديمة (محدود)",
    ),
    recordClassCounts: input.recordClassCounts,
    topIssues: input.topIssues.slice(0, 50),
  };
}
