/**
 * GeographyLegacyWriteFields — unit coverage for Legacy field round-trip.
 */

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

  it("maps country iso + currency to Legacy field names", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("country", {
        displayNameEn: "Kyrgyzstan",
        displayNameAr: "قيرغيزستان",
        isoCode: "kg",
        currencyCode: "kgs",
      }),
    ).toEqual({
      naim: "قيرغيزستان",
      name: "Kyrgyzstan",
      nameEn: "Kyrgyzstan",
      nameAr: "قيرغيزستان",
      iso_code: "KG",
      iso2: "KG",
      currency_code: "KGS",
      currencyCode: "KGS",
    });
  });

  it("maps city country/region to Legacy DocumentReference paths", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("city", {
        displayNameEn: "Bishkek",
        displayNameAr: "بيشكيك",
        countryId: "kyrgyzstan",
        regionId: "region_bishkek",
      }),
    ).toEqual({
      naim: "بيشكيك",
      name: "Bishkek",
      dolh: { path: "countries/kyrgyzstan" },
      cities: { path: "cities/region_bishkek" },
    });
  });

  it("maps landmark refs + Location geo point", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("landmark", {
        displayNameEn: "Tower",
        displayNameAr: "برج",
        countryId: "saudi_arabia",
        cityId: "riyadh",
        regionId: "najd",
        lat: 24.7,
        lng: 46.7,
        category: "landmark",
      }),
    ).toEqual({
      naim: "برج",
      name: "Tower",
      Rev_dolh: { path: "countries/saudi_arabia" },
      id_vill: { path: "villages/riyadh" },
      id_cit: { path: "cities/najd" },
      category: "landmark",
      Location: { latitude: 24.7, longitude: 46.7 },
      lat: 24.7,
      lng: 46.7,
    });
  });

  it("QA create defaults for landmark", () => {
    expect(geographyLegacyCreateDefaults("landmark")).toEqual({
      acctev: true,
      archived: false,
    });
  });

  it("omitted metadata fields are not written as null", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("landmark", {
        displayNameEn: "Only En",
      }),
    ).toEqual({ name: "Only En" });
  });
});
