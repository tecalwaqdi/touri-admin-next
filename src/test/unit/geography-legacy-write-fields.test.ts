/**
 * GeographyLegacyWriteFields — unit coverage for Legacy field round-trip.
 */

import { describe, expect, it } from "vitest";
import {
  applyGeographyLegacyLifecycleFields,
  geographyLegacyCreateDefaults,
  LEGACY_DEFAULT_LANDMARK_CATEGORY,
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

  it("country lifecycle uses acctev not active", () => {
    expect(
      applyGeographyLegacyLifecycleFields("country", "deactivate", {}),
    ).toEqual({ acctev: false });
    expect(
      applyGeographyLegacyLifecycleFields("country", "activate", {}),
    ).toEqual({ acctev: true });
    expect(
      applyGeographyLegacyLifecycleFields("country", "archive", {}),
    ).toEqual({ acctev: false, archived: true });
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
      names_i18n: { ar: "برج", en: "Tower" },
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
      names_i18n: { ar: "قيرغيزستان", en: "Kyrgyzstan" },
      nameEn: "Kyrgyzstan",
      nameAr: "قيرغيزستان",
      iso_code: "KG",
      iso2: "KG",
      currency_code: "KGS",
      currencyCode: "KGS",
    });
  });

  it("maps country vat / currencySymbol / sortOrder to Legacy fields", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("country", {
        currencySymbol: "с",
        vatPercent: 12.4,
        appCommissionPercent: 8.5,
        sortOrder: 3,
      }),
    ).toEqual({
      CurrencySymbol: "с",
      currency_symbol: "с",
      vat_percent: 12.4,
      vat: 12,
      isvat: true,
      app_commission_percent: 8.5,
      num_trteb: 3,
    });
  });

  it("maps country vatPercent 0 to isvat false", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("country", { vatPercent: 0 }),
    ).toEqual({
      vat_percent: 0,
      vat: 0,
      isvat: false,
    });
  });

  it("maps region country parent to dolh (and Rev_dolh)", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("region", {
        displayNameEn: "Chuy",
        displayNameAr: "تشوي",
        countryId: "kyrgyzstan",
        sortOrder: 2,
      }),
    ).toEqual({
      naim: "تشوي",
      name: "Chuy",
      names_i18n: { ar: "تشوي", en: "Chuy" },
      dolh: { path: "countries/kyrgyzstan" },
      Rev_dolh: { path: "countries/kyrgyzstan" },
      countryId: "kyrgyzstan",
      sorting: 2,
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
      names_i18n: { ar: "بيشكيك", en: "Bishkek" },
      dolh: { path: "countries/kyrgyzstan" },
      cities: { path: "cities/region_bishkek" },
    });
  });

  it("maps landmark refs + Location geo point + tsnef category", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("landmark", {
        displayNameEn: "Tower",
        displayNameAr: "برج",
        countryId: "saudi_arabia",
        cityId: "riyadh",
        regionId: "najd",
        lat: 24.7,
        lng: 46.7,
        category: "معالم سياحية",
        descriptionAr: "وصف",
        isMosque: true,
        isFood: false,
        address: "Riyadh",
      }),
    ).toEqual({
      naim: "برج",
      name: "Tower",
      names_i18n: { ar: "برج", en: "Tower" },
      osf: "وصف",
      osf_i18n: { ar: "وصف" },
      Rev_dolh: { path: "countries/saudi_arabia" },
      id_vill: { path: "villages/riyadh" },
      id_cit: { path: "cities/najd" },
      tsnef: "معالم سياحية",
      category: "معالم سياحية",
      address: "Riyadh",
      ismsgd: true,
      isfood: false,
      Location: { latitude: 24.7, longitude: 46.7 },
      lat: 24.7,
      lng: 46.7,
    });
  });

  it("maps city lat_ling geo point", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("city", {
        displayNameEn: "Bishkek",
        displayNameAr: "بيشكيك",
        lat: 42.87,
        lng: 74.59,
      }),
    ).toMatchObject({
      lat_ling: { latitude: 42.87, longitude: 74.59 },
      lat: 42.87,
      lng: 74.59,
    });
  });

  it("QA create defaults for landmark include default tsnef", () => {
    expect(geographyLegacyCreateDefaults("landmark")).toEqual({
      acctev: true,
      archived: false,
      tsnef: LEGACY_DEFAULT_LANDMARK_CATEGORY,
    });
  });

  it("country create defaults use acctev not active", () => {
    expect(geographyLegacyCreateDefaults("country")).toEqual({
      acctev: true,
      archived: false,
    });
    expect(geographyLegacyCreateDefaults("country")).not.toHaveProperty(
      "active",
    );
  });

  it("omitted metadata fields are not written as null", () => {
    expect(
      mapGeographyWriteMetadataToLegacy("landmark", {
        displayNameEn: "Only En",
      }),
    ).toEqual({ name: "Only En", names_i18n: { en: "Only En" } });
  });
});
