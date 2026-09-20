import { describe, expect, it } from "vitest";
import {
  presentCancellationReason,
  presentStatus,
} from "@/domain/presentation/statusPresentation";
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

  it("localizes trip lifecycle statuses instead of Unknown", () => {
    expect(presentStatus("pending_driver", "ar")).toBe("بانتظار السائق");
    expect(presentStatus("driver_assigned", "en")).toBe("Driver assigned");
    expect(presentStatus("trip_in_progress", "ar")).toBe("قيد التنفيذ");
    expect(presentStatus("unmapped", "ar")).toBe("حالة غير معيّنة");
    expect(presentStatus("cancelled_by_admin", "ar")).toBe("ملغاة من الإدارة");
  });

  it("localizes document readiness", () => {
    expect(presentStatus("ready", "ar")).toBe("جاهز");
    expect(presentStatus("expired", "ar")).toBe("منتهية");
  });

  it("presents evidence-backed country and city labels without fabricating", () => {
    expect(countryPrimaryLabel("saudi_arabia", null, "ar")).toMatch(/السعودية/);
    expect(cityPrimaryLabel("city_sa_jeddah", "ar")).toBe("جدة");
    expect(cityPrimaryLabel("city_kg_bishkek", "ar")).toBe("بيشكيك");
    expect(cityPrimaryLabel("city_unknown_xyz_999", "ar")).toBeNull();
  });

  it("does not invent landmark names from ids", () => {
    expect(presentLandmarkLabel("lm_sa_taif_hotel-loreef")).toBeNull();
    expect(
      presentLandmarkLabel("lm_sa_taif_hotel-loreef", "Hotel Loreef"),
    ).toBe("Hotel Loreef");
  });

  it("localizes offline / draft", () => {
    expect(presentStatus("offline", "ar")).toBe("غير متصل");
    expect(presentStatus("draft", "ar")).toBe("مسودة");
  });

  it("localizes cancellation reason codes", () => {
    expect(presentCancellationReason("customer_cancelled", "ar")).toBe(
      "ملغاة من العميل",
    );
    expect(presentCancellationReason(null, "ar")).toBeNull();
  });
});
