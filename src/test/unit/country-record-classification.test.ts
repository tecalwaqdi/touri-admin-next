/**
 * Phase 4A-1 — CountryRecordClassification unit tests (no Production).
 */
import { describe, expect, it } from "vitest";
import { classifyLegacyCountryRecord } from "@/domain/geography/CountryRecordClassification";

describe("classifyLegacyCountryRecord", () => {
  it("marks CP5 id pattern as test_or_noncanonical", () => {
    const r = classifyLegacyCountryRecord({
      documentId: "cp5_country_1787562918003",
      data: { naim: "FUNCTIONAL TEST COUNTRY" },
    });
    expect(r.classification).toBe("test_or_noncanonical");
    expect(r.reasons).toContain("cp5_country_id_pattern");
  });

  it("marks ADMIN_CP5 functional_test flags as test_or_noncanonical", () => {
    const r = classifyLegacyCountryRecord({
      documentId: "some_other_id",
      data: {
        naim: "FUNCTIONAL TEST COUNTRY",
        functional_test: true,
        functional_test_checkpoint: "ADMIN_CP5",
      },
    });
    expect(r.classification).toBe("test_or_noncanonical");
    expect(r.reasons).toContain("functional_test_checkpoint_admin_cp5");
  });

  it("does not classify real canonical countries as test", () => {
    const r = classifyLegacyCountryRecord({
      documentId: "saudi_arabia",
      data: { naim: "السعودية", naimEnglesh: "Saudi Arabia", acctev: true },
    });
    expect(r.classification).toBe("valid_candidate");
    expect(r.reasons).toEqual([]);
  });

  it("does not treat arbitrary unmapped names as test", () => {
    const r = classifyLegacyCountryRecord({
      documentId: "chad",
      data: { naim: "Chad" },
    });
    expect(r.classification).toBe("valid_candidate");
  });

  it("marks missing id as malformed", () => {
    const r = classifyLegacyCountryRecord({
      documentId: "",
      data: { naim: "x" },
    });
    expect(r.classification).toBe("malformed");
  });
});
