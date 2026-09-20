import { describe, expect, it } from "vitest";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import {
  cityPrimaryLabel,
  countryPrimaryLabel,
  presentLandmarkLabel,
} from "@/domain/presentation/geoReferencePresentation";

describe("trips/drivers UI presentation helpers", () => {
  it("localizes mapping status validMapped", () => {
    expect(presentStatus("validMapped", "en")).toBe("Valid mapping");
    expect(presentStatus("validMapped", "ar")).toBe("تعيين صالح");
  });

  it("presents evidence-backed country and city labels without fabricating", () => {
    expect(countryPrimaryLabel("saudi_arabia", null, "ar")).toMatch(/السعودية/);
    expect(cityPrimaryLabel("city_sa_jeddah", "ar")).toBe("جدة");
    expect(cityPrimaryLabel("city_unknown_xyz_999", "ar")).toBeNull();
  });

  it("does not invent landmark names from ids", () => {
    expect(
      presentLandmarkLabel("lm_sa_taif_hotel-loreef"),
    ).toBeNull();
    expect(
      presentLandmarkLabel("lm_sa_taif_hotel-loreef", "Hotel Loreef"),
    ).toBe("Hotel Loreef");
  });

  it("localizes offline / draft", () => {
    expect(presentStatus("offline", "ar")).toBe("غير متصل");
    expect(presentStatus("draft", "ar")).toBe("مسودة");
  });
});
