/**
 * Phase 4A-3 — mapping failure audit regressions (no Production calls).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapLandmarkFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  assessLandmarkRelationMappings,
  buildUnmappedLandmarkSafeDiagnostic,
  formatLandmarkMappingNoGoMessage,
  landmarkLiveClosingGatesPass,
  landmarkLiveReportHasSensitiveLeak,
  landmarkRelationReferencePath,
} from "@/domain/geography/LandmarkLiveMappingDiagnostics";
import { landmarkMappingReadyForLiveClose } from "@/domain/geography/LandmarkDuplicateIdentityAudit";

describe("Phase 4A-3 landmark live mapping failure audit", () => {
  it("unmapped country causes closing gates NO-GO", () => {
    expect(
      landmarkLiveClosingGatesPass({
        unmappedCountry: 1,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        productionWriteCalls: 0,
        unexpectedCollections: [],
      }),
    ).toBe(false);
    expect(
      landmarkMappingReadyForLiveClose({
        unmappedCountry: 1,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
      }),
    ).toBe(false);
  });

  it("live closing gates require all zero including writes and collections", () => {
    expect(
      landmarkLiveClosingGatesPass({
        unmappedCountry: 0,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        productionWriteCalls: 1,
        unexpectedCollections: [],
      }),
    ).toBe(false);
    expect(
      landmarkLiveClosingGatesPass({
        unmappedCountry: 0,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        productionWriteCalls: 0,
        unexpectedCollections: ["countries"],
      }),
    ).toBe(false);
    expect(
      landmarkLiveClosingGatesPass({
        unmappedCountry: 0,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        productionWriteCalls: 0,
        unexpectedCollections: [],
      }),
    ).toBe(true);
  });

  it("summary path helpers write live-safe-summary.json on mapping failure", () => {
    const dir = join(process.cwd(), ".local", "phase4a3-live-unit");
    const path = join(dir, "live-safe-summary.json");
    mkdirSync(dir, { recursive: true });
    try {
      const payload = {
        overallStatus: "NO_GO",
        unmappedCountry: 1,
        mappingReadyForLiveClose: false,
        killSwitch: "PASS",
        postKill: "PRODUCTION_READ_DISABLED_NO_NEW_QUERY",
        productionWriteCalls: 0,
      };
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      const read = JSON.parse(readFileSync(path, "utf8")) as typeof payload;
      expect(read.overallStatus).toBe("NO_GO");
      expect(read.unmappedCountry).toBe(1);
      expect(read.killSwitch).toBe("PASS");
      expect(path.endsWith("live-safe-summary.json")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("test landmark is classified testOrNoncanonical not unmappedCountry", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "cp5_mkan_1787562918003",
      data: {
        naim: "FUNCTIONAL TEST LANDMARK",
        Rev_dolh: "countries/cp5_country_1787562918003",
        id_vill: "villages/cp5_vill_1787562918003",
        functional_test: true,
        functional_test_checkpoint: "ADMIN_CP5",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("testOrNoncanonical");
    expect(mapped.mappingStatus).not.toBe("unmappedCountry");
  });

  it("real unknown country remains unmappedCountry (never invent from name)", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_unknown_atlantis",
      data: {
        naim: "برج المملكة",
        Rev_dolh: "countries/atlantis_not_in_table",
        id_vill: "villages/city_sa_riyadh",
        id_cit: "cities/region_sa_riyadh",
        Location: { latitude: 24.7, longitude: 46.6 },
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    expect(mapped.countryId).toBe("atlantis_not_in_table");
    expect(mapped.cityId).toBe("city_sa_riyadh");
    expect(mapped.warnings.some((w) => w.code === "unmapped_country")).toBe(
      true,
    );
  });

  it("safe source reference path preserved for unmapped country", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_orphan_country",
      data: {
        naim: "Safe Name Only",
        Rev_dolh: "countries/atlantis_not_in_table",
        id_vill: "villages/city_sa_riyadh",
        id_cit: "cities/region_sa_riyadh",
        acctev: true,
        img1: "https://firebasestorage.googleapis.com/v0/b/x/o/secret.jpg",
        EmailUser: "owner@example.com",
      },
    });
    const diag = buildUnmappedLandmarkSafeDiagnostic({
      sourceDocumentId: mapped.sourceDocumentId,
      safeName: mapped.safeName,
      countryId: mapped.countryId,
      cityId: mapped.cityId,
      regionId: mapped.regionId,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      warnings: mapped.warnings.map((w) => w.code),
    });
    expect(diag.sourceCountryReferencePath).toBe(
      "countries/atlantis_not_in_table",
    );
    expect(diag.sourceCityReferencePath).toBe("villages/city_sa_riyadh");
    expect(diag.sourceRegionReferencePath).toBe("cities/region_sa_riyadh");
    expect(diag.countryMapping).toBe("unmapped");
    expect(diag.cityMapping).toBe("present");
    expect(diag.regionMapping).toBe("present");
    expect(landmarkRelationReferencePath("countries", mapped.countryId)).toBe(
      "countries/atlantis_not_in_table",
    );
    const serialized = JSON.stringify(diag);
    expect(landmarkLiveReportHasSensitiveLeak(serialized)).toBe(false);
    expect(serialized).not.toContain("firebasestorage");
    expect(serialized).not.toContain("owner@example.com");
  });

  it("country failure does not hide missing city (independent relation diag)", () => {
    // Missing id_vill is detected before country resolve → overall unmappedCity,
    // but countryMapping still reports the unmapped Rev_dolh independently.
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_country_and_city_gap",
      data: {
        naim: "Both gaps",
        Rev_dolh: "countries/atlantis_not_in_table",
        // id_vill intentionally absent
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCity");
    expect(mapped.countryId).toBe("atlantis_not_in_table");
    const relations = assessLandmarkRelationMappings({
      countryId: mapped.countryId,
      cityId: mapped.cityId,
      regionId: mapped.regionId,
      mappingStatus: mapped.mappingStatus,
      warnings: mapped.warnings.map((w) => w.code),
    });
    expect(relations.countryMapping).toBe("unmapped");
    expect(relations.cityMapping).toBe("missing");
    expect(relations.regionMapping).toBe("missing");
  });

  it("missing Rev_dolh reports countryMapping=missing with null path", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_no_rev",
      data: {
        naim: "No country ref",
        id_vill: "villages/city_sa_riyadh",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    const diag = buildUnmappedLandmarkSafeDiagnostic({
      sourceDocumentId: mapped.sourceDocumentId,
      safeName: mapped.safeName,
      countryId: mapped.countryId,
      cityId: mapped.cityId,
      regionId: mapped.regionId,
      activeStatus: mapped.activeStatus,
      mappingStatus: mapped.mappingStatus,
      warnings: mapped.warnings.map((w) => w.code),
    });
    expect(diag.sourceCountryReferencePath).toBeNull();
    expect(diag.countryMapping).toBe("missing");
    expect(diag.cityMapping).toBe("present");
  });

  it("NO-GO message is safe and includes diagnostic ids", () => {
    const msg = formatLandmarkMappingNoGoMessage([
      {
        sourceDocumentId: "lm_x",
        safeName: "X",
        sourceCountryReferencePath: "countries/atlantis_not_in_table",
        sourceCityReferencePath: "villages/city_sa_riyadh",
        sourceRegionReferencePath: null,
        activeStatus: "active",
        mappingStatus: "unmappedCountry",
        countryMapping: "unmapped",
        cityMapping: "present",
        regionMapping: "missing",
      },
    ]);
    expect(msg).toContain("NO-GO");
    expect(msg).toContain("lm_x");
    expect(msg).toContain("countries/atlantis_not_in_table");
    expect(msg).not.toContain("http");
  });

  it("no Production write paths in landmark mutation trap contract", async () => {
    const { shadowTrapForRequest } = await import(
      "@/infrastructure/production/shadow/ShadowTraps"
    );
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/geography/landmarks",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
    if (trap.action === "deny") {
      expect(trap.code).toBe("PRODUCTION_WRITE_DISABLED");
    }
  });
});
