/**
 * PC-6 Geography & Data Quality — tests 1–28.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { requireCanonicalCountryId, tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { classifyCountryIdentity } from "@/domain/geography/CountryIdentityClassification";
import {
  buildGeographyCountryPresentation,
  resolveCountryDisplayName,
} from "@/domain/geography/GeographyPresentation";
import { auditCountryCurrencyAlignment } from "@/domain/geography/CurrencyAlignment";
import { diagnoseCountryAgentInvariant } from "@/domain/geography/CountryAgentInvariant";
import { detectCityDataQualityIssues } from "@/domain/geography/CityDataQuality";
import { detectLandmarkDataQualityIssues } from "@/domain/geography/LandmarkDataQuality";
import { classifyGeographyRecordClass } from "@/domain/geography/GeographyRecordClass";
import { buildGeographyDqSummary } from "@/domain/geography/GeographyDqSummary";
import { UNAVAILABLE_COUNT } from "@/application/geography/geographyListDtos";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { PRODUCTION_DETAIL_RELATED_READ_LIMIT } from "@/application/production-read/detailScope";
import { assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walkTsFiles(p, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(p);
    }
  }
  return acc;
}

describe("PC-6 Geography & Data Quality", () => {
  it("1: Canonical country IDs remain authoritative", () => {
    expect(requireCanonicalCountryId("SA")).toBe("saudi_arabia");
    expect(requireCanonicalCountryId("saudi_arabia")).toBe("saudi_arabia");
    expect(tryCanonicalCountryId("not_a_real_country_xyz")).toBeNull();
  });

  it("2: Display names are presentation-only", () => {
    const p = buildGeographyCountryPresentation({ countryId: "saudi_arabia" });
    expect(p.canonicalCountryId).toBe("saudi_arabia");
    expect(p.displayName).toBeTruthy();
    expect(p.displayName).not.toBe("SA");
    const countryOption = src("src/domain/geography/CountryOption.ts");
    expect(countryOption).toMatch(/canonicalId is the only filter/);
  });

  it("3: Known aliases normalize correctly", () => {
    expect(resolveCanonicalCountryId("SA").status).toBe("mapped");
    expect(resolveCanonicalCountryId("demo_saudi").status).toBe("mapped");
    expect(classifyCountryIdentity("sa").identityClass).toBe("known_alias");
    expect(classifyCountryIdentity("demo_saudi").canonicalCountryId).toBe(
      "saudi_arabia",
    );
  });

  it("4: Unknown/legacy IDs are not silently rewritten", () => {
    const unknown = classifyCountryIdentity("totally_unknown_country_99");
    expect(unknown.identityClass).toBe("unknown");
    expect(unknown.canonicalCountryId).toBeNull();
    const cp5 = classifyCountryIdentity("cp5_country_12345");
    expect(cp5.identityClass).toBe("malformed");
    expect(cp5.canonicalCountryId).toBeNull();
  });

  it("5: ONE COUNTRY = ONE ACTIVE AGENT invariant remains enforced", () => {
    const result = diagnoseCountryAgentInvariant({
      countryId: "saudi_arabia",
      countryBucket: "saudi_arabia",
      agents: [
        {
          agentId: "a1",
          agentName: "Riyadh Agent",
          status: "active",
          authoritativeRole: "agent",
          isOperationalAgent: true,
          countryBucket: "saudi_arabia",
        },
      ],
    });
    expect(result.state).toBe("PASS");
    expect(agentAssignmentPolicy.validateSeed).toBeTypeOf("function");
  });

  it("6: Duplicate active agents produce invariant violation", () => {
    const result = diagnoseCountryAgentInvariant({
      countryId: "saudi_arabia",
      countryBucket: "saudi_arabia",
      agents: [
        { agentId: "a1", status: "active", countryBucket: "saudi_arabia" },
        { agentId: "a2", status: "active", countryBucket: "saudi_arabia" },
      ],
    });
    expect(result.state).toBe("VIOLATION");
    expect(result.issues.some((i) => i.severity === "INVARIANT_VIOLATION")).toBe(
      true,
    );
  });

  it("7: No active agent is not misreported as valid", () => {
    const result = diagnoseCountryAgentInvariant({
      countryId: "nigeria",
      countryBucket: "nigeria",
      agents: [
        { agentId: "a1", status: "inactive", countryBucket: "nigeria" },
      ],
    });
    expect(result.state).toBe("NO_ACTIVE_AGENT");
    expect(result.invariant).toBe("no_active_agent");
  });

  it("8: Suspicious Super Admin→agent mapping surfaces DQ warning", () => {
    const result = diagnoseCountryAgentInvariant({
      countryId: "saudi_arabia",
      countryBucket: "saudi_arabia",
      agents: [
        {
          agentId: "super1",
          agentName: "Touri Super Admin",
          status: "active",
          authoritativeRole: "super_admin",
          isOperationalAgent: false,
          countryBucket: "saudi_arabia",
        },
      ],
    });
    expect(result.state).toBe("DATA_QUALITY_WARNING");
    expect(
      result.issues.some((i) => i.code === "suspicious_active_agent_mapping"),
    ).toBe(true);
  });

  it("9: City broken-country reference is detected", () => {
    const issues = detectCityDataQualityIssues({
      cityId: "city_1",
      countryId: "",
      mappingStatus: "unmappedCountry",
      safeName: "Riyadh",
    });
    expect(issues.some((i) => i.code === "city_missing_country")).toBe(true);
  });

  it("10: Landmark broken city/country reference is detected", () => {
    const issues = detectLandmarkDataQualityIssues({
      landmarkId: "lm_1",
      countryId: "",
      cityId: "",
      mappingStatus: "unmappedCountry",
      safeName: "Place",
    });
    expect(issues.some((i) => i.code === "landmark_missing_country")).toBe(true);
    expect(issues.some((i) => i.code === "landmark_missing_city")).toBe(true);
  });

  it("11: Missing geography values never become fabricated names/counts", () => {
    expect(resolveCountryDisplayName({ countryId: "unknown_xx_99" })).toBeNull();
    expect(UNAVAILABLE_COUNT.value).toBeNull();
    expect(UNAVAILABLE_COUNT.availability).toBe("unavailable");
  });

  it("12: Currency missing != default SAR", () => {
    const audit = auditCountryCurrencyAlignment({
      countryId: "saudi_arabia",
      storedCurrency: null,
    });
    expect(audit.storedCurrency).toBeNull();
    expect(audit.status).toBe("missing_stored");
    expect(audit.storedCurrency).not.toBe("SAR");
  });

  it("13: QA/pilot classification is not unsafe prefix-only", () => {
    const prefixOnly = classifyGeographyRecordClass({
      entityKind: "city",
      documentId: "test_maybe_city",
      data: { naim: "Real Looking City" },
    });
    expect(prefixOnly.recordClass).toBe("unknown");
    const withMeta = classifyGeographyRecordClass({
      entityKind: "city",
      documentId: "test_maybe_city",
      data: { naim: "x", functional_test: true, functional_test_checkpoint: "ADMIN_CP5" },
    });
    expect(["production_pilot", "qa", "legacy"]).toContain(withMeta.recordClass);
  });

  it("14: Data-quality summary does not call bounded samples exact", () => {
    const summary = buildGeographyDqSummary({
      boundedSampleLimit: 50,
      truncated: true,
      countriesTotalInView: 3,
      canonicalCountries: 2,
      aliasesNormalized: 1,
      legacyOrMalformedCountries: 0,
      countriesWithoutActiveAgent: 1,
      countriesWithDuplicateActiveAgents: 0,
      countriesWithSuspiciousAgent: 1,
      citiesWithBrokenCountryRefs: 0,
      landmarksWithBrokenCityOrCountryRefs: 0,
      landmarksMissingDisplayMetadata: 0,
      qaPilotLegacyRecordCount: 0,
      recordClassCounts: {},
      topIssues: [],
    });
    expect(summary.metricsAccuracy).toBe("bounded_sample");
    expect(summary.countriesTotalInView.accuracy).toBe("bounded_sample");
    expect(summary.countriesTotalInView.accuracy).not.toBe("exact");
  });

  it("15: Page limits remain <=50", () => {
    expect(WIF_NATIVE_MAX_READ_LIMIT).toBeLessThanOrEqual(50);
    const geoApi = src(
      "src/application/production-read/ProductionGeographyApiReads.ts",
    );
    expect(geoApi).toMatch(/WIF_NATIVE_MAX_READ_LIMIT/);
    expect(geoApi).toMatch(/Math\.min\(Math\.max\(1, Math\.floor\(n\)\), WIF_NATIVE_MAX_READ_LIMIT\)/);
  });

  it("16: Related detail reads remain bounded", () => {
    expect(PRODUCTION_DETAIL_RELATED_READ_LIMIT).toBeLessThanOrEqual(20);
    const geoApi = src(
      "src/application/production-read/ProductionGeographyApiReads.ts",
    );
    expect(geoApi).toMatch(/PRODUCTION_DETAIL_RELATED_READ_LIMIT/);
  });

  it("17: No N+1 behavior introduced", () => {
    const geoApi = src(
      "src/application/production-read/ProductionGeographyApiReads.ts",
    );
    expect(geoApi).toMatch(/UNAVAILABLE_COUNT/);
    expect(geoApi).not.toMatch(/for \(const city of .*\) \{\s*await runtime\.repos\.geography\.listLandmarks/);
    expect(geoApi).toMatch(/citiesCount: UNAVAILABLE_COUNT/);
  });

  it("18: WIF-native reads only", () => {
    const routes = [
      "src/app/api/geography/countries/route.ts",
      "src/app/api/geography/cities/route.ts",
      "src/app/api/geography/landmarks/route.ts",
      "src/app/api/geography/data-quality/route.ts",
    ];
    for (const r of routes) {
      const text = src(r);
      expect(text).toMatch(/productionReadPathActive|ProductionGeographyApiReads/);
      expect(text).not.toMatch(/applicationDefault\s*\(/);
    }
  });

  it("19: ADC active paths remain zero", () => {
    const files = [
      "src/application/production-read/ProductionGeographyApiReads.ts",
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    ];
    for (const f of files) {
      expect(src(f)).not.toMatch(/applicationDefault\s*\(/);
      expect(src(f)).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
    }
  });

  it("20: Synthetic Production fallback remains zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow();
    const cities = src("src/app/api/geography/cities/route.ts");
    expect(cities).not.toMatch(/synthetic: true/);
  });

  it("21: Write RPC exposure remains zero", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const geoFiles = walkTsFiles(join(process.cwd(), "src/features/geography"));
    for (const f of geoFiles) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toMatch(/\bEnable write\b|\bcreateCountry\b|\bdeleteLandmark\b/i);
      expect(text).not.toMatch(/PRODUCTION_WRITE_/);
    }
  });

  it("22: RBAC/scope remains enforced", () => {
    const detail = src(
      "src/application/production-read/ProductionGeographyApiReads.ts",
    );
    expect(detail).toMatch(/assertDetailResourceInScope/);
    const countryDetail = src(
      "src/app/api/geography/countries/[id]/route.ts",
    );
    expect(countryDetail).toMatch(/ScopeDeniedError|FORBIDDEN/);
  });

  it("23: PC-1 regression none", () => {
    expect(src("src/domain/dashboard/KpiAccuracy.ts")).toMatch(/bounded_sample/);
    expect(src("src/domain/geography/GeographyPresentation.ts")).toMatch(
      /resolveCountryDisplayName/,
    );
  });

  it("24: PC-2 regression none", () => {
    expect(
      src("src/application/production-read/ProductionOperationalDetailReads.ts"),
    ).toMatch(/getProductionDriverDetailApi/);
    expect(PRODUCTION_DETAIL_RELATED_READ_LIMIT).toBe(20);
  });

  it("25: PC-3 regression none", () => {
    expect(src("src/domain/geography/CountryOption.ts")).toMatch(
      /buildCanonicalCountryOptions/,
    );
  });

  it("26: PC-4 regression none", () => {
    expect(src("src/app/api/users/route.ts")).toMatch(/users:manage/);
    expect(src("src/app/api/audit/route.ts")).toMatch(/audit:read/);
  });

  it("27: PC-5 regression none", () => {
    expect(src("src/domain/presentation/financeTerminology.ts")).toMatch(
      /grossBookingValue/,
    );
  });

  it("28: FR7 regression none", () => {
    expect(
      src("src/domain/finance/reporting/FinanceReportingAggregator.ts"),
    ).toBeTruthy();
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });
});
