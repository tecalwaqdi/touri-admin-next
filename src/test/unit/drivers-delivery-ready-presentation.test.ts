import { describe, expect, it } from "vitest";
import { buildDriverVehicleSafeSummary } from "@/domain/driver/DriverVehicleSafeSummary";
import {
  extractDriverEmailRaw,
  extractDriverPhoneRaw,
  maskDriverEmailHint,
  maskDriverPhoneHint,
  projectDriverContact,
} from "@/domain/driver/DriverContactHints";
import { mapCanonicalDriverFromLegacyDoc } from "@/domain/driver/mapCanonicalDriverRead";
import { mapCanonicalDriverToDetail } from "@/application/production-read/mapCanonicalToDetailDtos";
import { mapCanonicalDriverToListItem } from "@/application/production-read/mapCanonicalToListItems";
import { resolveDriverDocumentPath } from "@/domain/storage/DriverDocumentReference";

const bucket = "test.appspot.com";

describe("Drivers delivery-ready presentation mappers", () => {
  it("derives vehicle year from ModelCar when year_car is absent", () => {
    const vehicle = buildDriverVehicleSafeSummary({
      NameCar: "تيجو 8 برو ماكس",
      ModelCar: "2025",
      number_lohh_car: "RU12377",
      ColorCar: "أبيض",
    });
    expect(vehicle.year).toBe(2025);
    expect(vehicle.model).toBe("2025");
    expect(vehicle.color).toBe("أبيض");
    expect(vehicle.name).toBe("تيجو 8 برو ماكس");
  });

  it("maps masked contact hints from legacy phone_number / email", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "SnJYKOMMJmSzbDunRHtubYoiq5B3",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        display_name: "سلطان هارون علي سناري",
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: {
          path: "villages/city_sa_makkah",
          id: "city_sa_makkah",
        },
        phone_number: "+966501112233",
        email: "driver@example.com",
        NameCar: "Tiggo",
        ModelCar: "2025",
      },
    });
    expect(mapped.model.phoneHint.value).toMatch(/\*/);
    expect(mapped.model.emailHint.value).toMatch(/\*\*\*/);
    expect(maskDriverPhoneHint("+966501112233")).toMatch(/\*/);
    expect(maskDriverEmailHint("driver@example.com")).toMatch(/\*\*\*/);

    const detail = mapCanonicalDriverToDetail(mapped.model);
    expect(detail.email).toBeTruthy();
    expect(detail.phone).toBeTruthy();
    expect(detail.regionAvailability).toBe("not_represented");

    const list = mapCanonicalDriverToListItem(mapped.model);
    expect(list.emailHint).toBeTruthy();
    expect(list.phoneHint).toBeTruthy();
  });

  it("projects full contact for drivers:read_pii and masked otherwise", () => {
    const data = {
      phone_number: "+966501112233",
      email: "driver@example.com",
    };
    const full = projectDriverContact(data, [
      "drivers:read",
      "drivers:read_pii",
    ]);
    expect(full.mode).toBe("full");
    expect(full.phone).toBe("+966501112233");
    expect(full.email).toBe("driver@example.com");
    expect(full.redacted).toBe(false);

    const masked = projectDriverContact(data, ["drivers:read"]);
    expect(masked.mode).toBe("masked");
    expect(masked.phone).toMatch(/\*/);
    expect(masked.email).toMatch(/\*\*\*/);
    expect(masked.redacted).toBe(true);

    expect(extractDriverEmailRaw(data)).toBe("driver@example.com");
    expect(extractDriverPhoneRaw(data)).toBe("+966501112233");
  });

  it("resolves document paths from nested storagePath and historical URL", () => {
    expect(
      resolveDriverDocumentPath(
        {
          doc_national_id: {
            storagePath: "users/driver/documents/national_id.jpg",
          },
        },
        "driver",
        "national_id",
        bucket,
      ),
    ).toBe("users/driver/documents/national_id.jpg");

    expect(
      resolveDriverDocumentPath(
        {
          img_id: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/users%2Fdriver%2Fuploads%2Flicense.png?token=secret`,
        },
        "driver",
        "driver_license",
        bucket,
      ),
    ).toBe("users/driver/uploads/license.png");
  });
});
