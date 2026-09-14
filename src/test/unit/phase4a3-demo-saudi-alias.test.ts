/**
 * Phase 4A-3 — demo_saudi Legacy Saudi alias (exact source-ID only).
 * Production calls = 0. No fuzzy name/coords inference.
 */
import { describe, expect, it } from "vitest";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { mapLandmarkFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { mapCountryFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { classifyLegacyLandmarkRecord } from "@/domain/geography/LandmarkRecordClassification";

describe("Phase 4A-3 demo_saudi Legacy Saudi alias", () => {
  it("countries/demo_saudi → saudi_arabia via exact alias", () => {
    const r = resolveCanonicalCountryId("countries/demo_saudi");
    expect(r).toMatchObject({
      status: "mapped",
      canonicalCountryId: "saudi_arabia",
      matchedVia: "alias",
    });
  });

  it("countries/saudi_arabia → saudi_arabia", () => {
    const r = resolveCanonicalCountryId("countries/saudi_arabia");
    expect(r).toMatchObject({
      status: "mapped",
      canonicalCountryId: "saudi_arabia",
    });
    expect(resolveCanonicalCountryId("saudi_arabia")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "saudi_arabia",
    });
  });

  it("countries/demo_unknown → NOT Saudi (no demo_* blanket)", () => {
    const r = resolveCanonicalCountryId("countries/demo_unknown");
    expect(r.status).toBe("unmapped");
    if (r.status === "unmapped") {
      expect(r.input).toBe("demo_unknown");
    }
    expect(resolveCanonicalCountryId("demo_egypt").status).toBe("unmapped");
    expect(resolveCanonicalCountryId("demo_ksa").status).toBe("unmapped");
  });

  it("mapCountryFromLegacyDoc aliases demo_saudi without creating second canonical", () => {
    const mapped = mapCountryFromLegacyDoc({
      documentId: "demo_saudi",
      data: { naim: "السعودية", currency_code: "SAR", acctev: true },
    });
    expect(mapped.unmapped).toBe(false);
    expect(mapped.canonicalId).toBe("saudi_arabia");
    expect(mapped.recordClassification).toBe("valid_candidate");
    expect(mapped.warnings.some((w) => w.code === "country_alias_resolved")).toBe(
      true,
    );
  });

  it("curated_makkah_clock_tower + Rev_dolh demo_saudi + city_sa_makkah → validMapped", () => {
    const classified = classifyLegacyLandmarkRecord({
      documentId: "curated_makkah_clock_tower",
      data: {
        naim: "ساعة مكة",
        Rev_dolh: "countries/demo_saudi",
        id_vill: "villages/city_sa_makkah",
        acctev: true,
      },
      countryDocId: "demo_saudi",
      cityDocId: "city_sa_makkah",
    });
    expect(classified.classification).toBe("valid_candidate");

    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "curated_makkah_clock_tower",
      data: {
        naim: "ساعة مكة",
        Rev_dolh: "countries/demo_saudi",
        id_vill: "villages/city_sa_makkah",
        acctev: true,
      },
    });

    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.mappingStatus).not.toBe("testOrNoncanonical");
    expect(mapped.mappingStatus).not.toBe("unmappedCountry");
    expect(mapped.countryId).toBe("saudi_arabia");
    expect(mapped.canonicalCountryId).toBe("saudi_arabia");
    expect(mapped.sourceCountryDocumentId).toBe("demo_saudi");
    expect(mapped.cityId).toBe("city_sa_makkah");
    expect(mapped.sourceDocumentId).toBe("curated_makkah_clock_tower");
    expect(mapped.canonicalLandmarkId).toBe("curated_makkah_clock_tower");
    expect(mapped.unmapped).toBe(false);
  });

  it("does not classify Clock Tower as test from demo_saudi country alone", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "curated_makkah_clock_tower",
      data: {
        naim: "Abraj Al Bait",
        Rev_dolh: "countries/demo_saudi",
        id_vill: "villages/city_sa_makkah",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(
      mapped.warnings.some((w) => w.code.startsWith("test_or_noncanonical")),
    ).toBe(false);
  });
});
