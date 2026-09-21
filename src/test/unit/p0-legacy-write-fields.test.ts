/**
 * P0 Legacy write field mapping — fleet actev / partner acctev / guide status.
 */

import { describe, expect, it } from "vitest";
import {
  applyP0LegacyLifecycleFields,
  mapP0WriteMetadataToLegacy,
  p0LegacyCreateDefaults,
} from "@/application/controlled-writes/P0LegacyWriteFields";
import { ProductionP0MasterWriteRepository } from "@/infrastructure/production/writes/ProductionDomainWriteRepositories";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { TOUR_GUIDE_FIELDS } from "@/domain/guides/TourGuideMaster";

const FLAGS_ON = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: true,
  PRODUCTION_WRITE_ENABLED: true,
  REGION_WRITE_ENABLED: true,
  VEHICLE_CATALOG_WRITE_ENABLED: true,
  PARTNER_WRITE_ENABLED: true,
  FLEET_WRITE_ENABLED: true,
  GUIDE_WRITE_ENABLED: true,
  GEOGRAPHY_WRITE_ENABLED: true,
  FINANCE_WRITE_ENABLED: false,
} as const;

const actor = {
  uid: "admin1",
  role: "super_admin" as const,
  permissions: ["agents:manage", "drivers:approve"] as const,
  scope: { type: "global" as const },
};

describe("P0LegacyWriteFields lifecycle", () => {
  it("fleet activate/deactivate/archive uses actev not active", () => {
    expect(
      applyP0LegacyLifecycleFields("fleet", "activate", {}),
    ).toEqual({ actev: true });
    expect(
      applyP0LegacyLifecycleFields("fleet", "deactivate", {}),
    ).toEqual({ actev: false });
    expect(
      applyP0LegacyLifecycleFields("fleet", "archive", {}),
    ).toEqual({ actev: false, archived: true });
    expect(
      applyP0LegacyLifecycleFields("fleet", "deactivate", { active: true }),
    ).not.toHaveProperty("active");
  });

  it("partner activate/deactivate uses acctev like landmarks", () => {
    expect(
      applyP0LegacyLifecycleFields("partner", "activate", {}),
    ).toEqual({ acctev: true });
    expect(
      applyP0LegacyLifecycleFields("partner", "deactivate", {}),
    ).toEqual({ acctev: false });
    expect(
      applyP0LegacyLifecycleFields("partner", "archive", {}),
    ).toEqual({ acctev: false, archived: true });
  });

  it("guide activate/deactivate does not set active or acctev", () => {
    const patch = applyP0LegacyLifecycleFields("guide", "deactivate", {
      [TOUR_GUIDE_FIELDS.status]: "suspended",
      active: true,
    });
    expect(patch).toEqual({
      [TOUR_GUIDE_FIELDS.status]: "suspended",
    });
    expect(patch).not.toHaveProperty("active");
    expect(patch).not.toHaveProperty("acctev");
    expect(patch).not.toHaveProperty("actev");
  });

  it("vehicle_catalog uses actev (primary Legacy read flag)", () => {
    expect(
      applyP0LegacyLifecycleFields("vehicle_catalog", "activate", {}),
    ).toEqual({ actev: true });
  });

  it("create defaults set partner isShrek+acctev and fleet actev", () => {
    expect(p0LegacyCreateDefaults("partner")).toMatchObject({
      isShrek: true,
      acctev: true,
    });
    expect(p0LegacyCreateDefaults("fleet")).toMatchObject({ actev: true });
    expect(p0LegacyCreateDefaults("guide")).toMatchObject({
      is_tour_guide: true,
    });
    expect(p0LegacyCreateDefaults("guide")).not.toHaveProperty("active");
  });
});

describe("P0LegacyWriteFields metadata mapping", () => {
  it("maps fleet canonical names to Legacy naim/license_number/Rev_dolh", () => {
    expect(
      mapP0WriteMetadataToLegacy("fleet", {
        displayName: "Fleet Co",
        licenseNumber: "LIC-9",
        phone: "+966500",
        email: "f@ex.com",
        countryId: "saudi_arabia",
        countryText: "Saudi Arabia",
      }),
    ).toEqual({
      naim: "Fleet Co",
      license_number: "LIC-9",
      phone: "+966500",
      email: "f@ex.com",
      Rev_dolh: { path: "countries/saudi_arabia" },
      dolh: { path: "countries/saudi_arabia" },
      dolh_text: "Saudi Arabia",
    });
  });

  it("maps partner names/geo/contact to Legacy mkan fields", () => {
    const mapped = mapP0WriteMetadataToLegacy("partner", {
      displayNameAr: "شريك",
      displayNameEn: "Partner",
      countryId: "saudi_arabia",
      cityId: "riyadh",
      regionId: "riyadh_region",
      phone: "050",
      email: "p@ex.com",
      address: "Street 1",
      lat: 24.7,
      lng: 46.7,
    });
    expect(mapped.naim).toBe("شريك");
    expect(mapped.name).toBe("Partner");
    expect(mapped.Rev_dolh).toEqual({ path: "countries/saudi_arabia" });
    expect(mapped.id_vill).toEqual({ path: "villages/riyadh" });
    expect(mapped.id_cit).toEqual({ path: "cities/riyadh_region" });
    expect(mapped.mdh).toBe("050");
    expect(mapped.EmailUser).toBe("p@ex.com");
    expect(mapped.Location).toEqual({ latitude: 24.7, longitude: 46.7 });
  });

  it("passes guide Domain SoT metadata keys through", () => {
    expect(
      mapP0WriteMetadataToLegacy("guide", {
        tour_guide_status: "approved",
        tour_guide_reviewed_at: "2026-01-01T00:00:00.000Z",
        is_tour_guide: true,
        guide_status: "ignored",
      }),
    ).toEqual({
      tour_guide_status: "approved",
      tour_guide_reviewed_at: "2026-01-01T00:00:00.000Z",
      is_tour_guide: true,
    });
  });
});

describe("buildTourGuideWriteMetadata", () => {
  it("uses tour_guide_status Domain SoT keys not guide_status", async () => {
    const { buildTourGuideWriteMetadata, TOUR_GUIDE_FIELDS } = await import(
      "@/domain/guides/TourGuideMaster"
    );
    const approve = buildTourGuideWriteMetadata("approve");
    expect(approve[TOUR_GUIDE_FIELDS.status]).toBe("approved");
    expect(approve[TOUR_GUIDE_FIELDS.isTourGuide]).toBe(true);
    expect(approve[TOUR_GUIDE_FIELDS.reviewedAt]).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(approve).not.toHaveProperty("guide_status");

    const reject = buildTourGuideWriteMetadata("reject", {
      rejectionReason: " Incomplete docs ",
    });
    expect(reject[TOUR_GUIDE_FIELDS.status]).toBe("rejected");
    expect(reject[TOUR_GUIDE_FIELDS.rejectionReason]).toBe("Incomplete docs");
  });
});

describe("ProductionP0MasterWriteRepository Legacy patches", () => {
  it("fleet deactivate patches actev=false", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("transport_company", "co1", { naim: "Co", actev: true }, "ut0");
    const repo = new ProductionP0MasterWriteRepository("fleet", FLAGS_ON, port);
    await repo.apply({
      actor: actor as never,
      domain: "fleet",
      resourceId: "co1",
      action: "deactivate",
      preconditionToken: "fs_ut_ut0",
      idempotencyKey: "k1",
      correlationId: "c",
      reasonCode: "operational",
    });
    const doc = await port.getDocument("transport_company", "co1");
    expect(doc.data?.actev).toBe(false);
    expect(doc.data).not.toHaveProperty("active");
  });

  it("partner create sets isShrek + acctev", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const repo = new ProductionP0MasterWriteRepository(
      "partner",
      FLAGS_ON,
      port,
    );
    await repo.apply({
      actor: actor as never,
      domain: "partner",
      resourceId: "p1",
      action: "create",
      preconditionToken: "create",
      idempotencyKey: "k2",
      correlationId: "c",
      reasonCode: "operational",
      metadata: {
        displayNameAr: "شريك",
        displayNameEn: "Partner",
        countryId: "saudi_arabia",
      },
    });
    const doc = await port.getDocument("mkan", "p1");
    expect(doc.exists).toBe(true);
    expect(doc.data?.isShrek).toBe(true);
    expect(doc.data?.acctev).toBe(true);
    expect(doc.data?.naim).toBe("شريك");
    expect(doc.data).not.toHaveProperty("active");
  });

  it("guide deactivate writes tour_guide_status without active", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed(
      "user",
      "g1",
      { is_tour_guide: true, tour_guide_status: "approved" },
      "ut0",
    );
    const repo = new ProductionP0MasterWriteRepository("guide", FLAGS_ON, port);
    await repo.apply({
      actor: actor as never,
      domain: "guide",
      resourceId: "g1",
      action: "deactivate",
      preconditionToken: "fs_ut_ut0",
      idempotencyKey: "k3",
      correlationId: "c",
      reasonCode: "operational",
      metadata: {
        tour_guide_status: "suspended",
        tour_guide_reviewed_at: "2026-09-22T00:00:00.000Z",
        is_tour_guide: true,
      },
    });
    const doc = await port.getDocument("user", "g1");
    expect(doc.data?.tour_guide_status).toBe("suspended");
    expect(doc.data?.is_tour_guide).toBe(true);
    expect(doc.data?.tour_guide_reviewed_at).toBe("2026-09-22T00:00:00.000Z");
    expect(doc.data).not.toHaveProperty("active");
  });
});
