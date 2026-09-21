import { describe, expect, it } from "vitest";
import {
  applyGeographyLegacyLifecycleFields,
  geographyLegacyCreateDefaults,
  mapGeographyWriteMetadataToLegacy,
} from "@/application/controlled-writes/geography/GeographyLegacyWriteFields";

describe("GeographyLegacyWriteFields", () => {
  it("landmark deactivate patches acctev not active", () => {
    const patch = applyGeographyLegacyLifecycleFields(
      "landmark",
      "deactivate",
      {},
    );
    expect(patch).toEqual({ acctev: false });
    expect(patch).not.toHaveProperty("active");
  });

  it("region activate uses acctev", () => {
    expect(
      applyGeographyLegacyLifecycleFields("region", "activate", {}),
    ).toEqual({ acctev: true });
  });

  it("country keeps canonical active field", () => {
    expect(
      applyGeographyLegacyLifecycleFields("country", "deactivate", {}),
    ).toEqual({ active: false });
  });

  it("landmark archive patches acctev and archived", () => {
    expect(
      applyGeographyLegacyLifecycleFields("landmark", "archive", {}),
    ).toEqual({ acctev: false, archived: true });
  });

  it("maps display names and hide visibility to legacy fields", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("landmark", {
        displayNameAr: "برج",
        displayNameEn: "Tower",
        visibility: "hidden",
      }),
    ).toEqual({
      naim: "برج",
      name: "Tower",
      visibility: "hidden",
      hidden: true,
    });
  });

  it("QA create defaults for landmark", () => {
    expect(geographyLegacyCreateDefaults("landmark")).toEqual({
      acctev: true,
      archived: false,
    });
  });
});
