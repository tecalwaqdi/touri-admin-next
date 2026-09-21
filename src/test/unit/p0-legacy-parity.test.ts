/**
 * P0 legacy business parity — regions, vehicle catalog, settlement payments,
 * partners/fleet/guides, gated writes default OFF.
 */

import { describe, expect, it } from "vitest";
import { mapRegionFromLegacyDoc } from "@/infrastructure/production/mappers/mapRegionFromLegacyDoc";
import { mapVehicleTypeFromLegacyDoc } from "@/infrastructure/production/mappers/mapVehicleTypeFromLegacyDoc";
import { mapTransportCompanyFromLegacyDoc } from "@/infrastructure/production/mappers/mapTransportCompanyFromLegacyDoc";
import { mapTourGuideFromLegacyUser } from "@/infrastructure/production/mappers/mapTourGuideFromLegacyUser";
import { isPartnerLandmark } from "@/domain/partners/PartnerLandmarkPolicy";
import {
  resolveDriverVehicleTypeSelection,
} from "@/domain/vehicle-catalog/VehicleTypeMaster";
import {
  DEFAULT_P0_WRITE_FLAGS_FALSE,
  P0_WRITE_INVENTORY,
  allP0WriteFlagsDisabled,
  assertP0ProductionWriteEnabled,
} from "@/application/controlled-writes/P0WriteGates";
import {
  FakeP0MasterWriteRepository,
  executeP0MasterControlledWrite,
} from "@/application/controlled-writes/P0MasterControlledWriteService";
import { executeSettlementPaymentAction } from "@/application/finance/SettlementPaymentApiBridge";
import { getOfflineSettlementV2Repository } from "@/application/finance/SettlementPaymentApiBridge";
import { PRODUCTION_NAV_HREFS } from "@/domain/ui/navPolicy";
import { PRODUCTION_READ_COLLECTION_ALLOWLIST } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { LIVE_SHADOW_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { LEGACY_COMPATIBILITY_ADAPTERS } from "@/adapters/compatibility/LegacyCompatibilityAdapters";
import { SAFETY_FLAGS_DEFAULT_FALSE } from "@/config/env";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

describe("P0 regions mapper", () => {
  it("maps Legacy cities doc as region; never fabricates country", () => {
    const mapped = mapRegionFromLegacyDoc({
      documentId: "riyadh_region",
      data: {
        naim: "Riyadh Region",
        names_i18n: { en: "Riyadh Region", ar: "منطقة الرياض" },
        dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        acctev: true,
        sorting: 1,
      },
    });
    expect(mapped.source).toBe("legacy_cities_regions");
    expect(mapped.countryId).toBe("saudi_arabia");
    expect(mapped.mappingStatus).toBe("validMapped");
  });

  it("leaves countryId null when unmapped — no fabricate", () => {
    const mapped = mapRegionFromLegacyDoc({
      documentId: "orphan_region",
      data: { naim: "Orphan", acctev: true },
    });
    expect(mapped.countryId).toBeNull();
    expect(mapped.mappingStatus).toBe("unmappedCountry");
  });
});

describe("P0 vehicle catalog", () => {
  it("maps type_car master fields including sr hourly rate", () => {
    const mapped = mapVehicleTypeFromLegacyDoc({
      documentId: "sedan",
      data: {
        naim: "Sedan",
        names_i18n: { en: "Sedan", ar: "سيدان" },
        sr: 120,
        actev: true,
        codeCar: "SED",
        passengers: 4,
      },
    });
    expect(mapped.source).toBe("legacy_type_car");
    expect(mapped.hourlyRateSr).toBe(120);
    expect(mapped.activeStatus).toBe("active");
  });

  it("supports canonical select with free-text compatibility", () => {
    expect(
      resolveDriverVehicleTypeSelection({
        typeCarId: "sedan",
        freeTextLabel: "custom",
      }).selectionMode,
    ).toBe("canonical");
    expect(
      resolveDriverVehicleTypeSelection({
        freeTextLabel: "old free text",
      }).selectionMode,
    ).toBe("free_text");
  });
});

describe("P0 partners / fleet / guides", () => {
  it("partners are landmark isShrek filter — not separate collection", () => {
    expect(isPartnerLandmark({ isShrek: true })).toBe(true);
    expect(isPartnerLandmark({ isShrek: false })).toBe(false);
    expect(isPartnerLandmark({ isShrek: "true" })).toBe(true);
    expect(isPartnerLandmark({ is_partner: 1 })).toBe(true);
    expect(LEGACY_COMPATIBILITY_ADAPTERS.partnerLandmark.legacyCollection).toBe(
      "mkan",
    );
  });

  it("fleet maps transport_company as distinct domain", () => {
    const mapped = mapTransportCompanyFromLegacyDoc({
      documentId: "co1",
      data: {
        naim: "Fleet Co",
        license_number: "LIC-1",
        actev: true,
        Rev_dolh: { id: "saudi_arabia", path: "countries/saudi_arabia" },
      },
    });
    expect(mapped.source).toBe("legacy_transport_company");
    expect(mapped.licenseNumber).toBe("LIC-1");
  });

  it("guides map user is_tour_guide personas", () => {
    const mapped = mapTourGuideFromLegacyUser({
      documentId: "g1",
      data: {
        is_tour_guide: true,
        tour_guide_status: "pending",
        display_name: "Guide One",
        email: "g@example.com",
      },
    });
    expect(mapped?.status).toBe("pending");
    expect(mapped?.isTourGuide).toBe(true);
    expect(mapTourGuideFromLegacyUser({ documentId: "x", data: {} })).toBeNull();
  });
});

describe("P0 write gates default FALSE (class A gated off)", () => {
  it("all narrow P0 flags default false; Production allowed only when env gates armed", () => {
    expect(allP0WriteFlagsDisabled(DEFAULT_P0_WRITE_FLAGS_FALSE)).toBe(true);
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    for (const flag of [
      "REGION_WRITE_ENABLED",
      "VEHICLE_CATALOG_WRITE_ENABLED",
      "PARTNER_WRITE_ENABLED",
      "FLEET_WRITE_ENABLED",
      "GUIDE_WRITE_ENABLED",
    ]) {
      expect(SAFETY_FLAGS_DEFAULT_FALSE).toContain(flag);
    }
    expect(() =>
      assertP0ProductionWriteEnabled("region", DEFAULT_P0_WRITE_FLAGS_FALSE),
    ).toThrow(/WRITE_DISABLED/);
    expect(() =>
      assertP0ProductionWriteEnabled("region", {
        ...DEFAULT_P0_WRITE_FLAGS_FALSE,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        REGION_WRITE_ENABLED: true,
      }),
    ).not.toThrow();
    expect(P0_WRITE_INVENTORY.every((r) => r.productionArmed === false)).toBe(
      true,
    );
    expect(P0_WRITE_INVENTORY.every((r) => r.class === "A_GATED_OFF")).toBe(
      true,
    );
  });

  it("offline Fake master write applies without Production mutation", async () => {
    const repo = new FakeP0MasterWriteRepository();
    const result = await executeP0MasterControlledWrite(
      {
        actor: {
          uid: "u1",
          role: "super_admin",
          permissions: ["agents:manage"],
          scope: { type: "global" },
        },
        domain: "vehicle_catalog",
        resourceId: "sedan",
        action: "create",
        preconditionToken: "create",
        idempotencyKey: "idem-1",
        correlationId: "corr-1",
        metadata: { naim: "Sedan" },
        reasonCode: "operational",
      },
      {
        flags: DEFAULT_P0_WRITE_FLAGS_FALSE,
        repository: repo,
        allowOfflineExecution: true,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.productionWriteExecuted).toBe(false);
    expect(repo.get("vehicle_catalog", "sedan")?.exists).toBe(true);
  });
});

describe("P0 settlement payment depth FR5", () => {
  it("create payment denied on Production gate; offline Fake can apply", async () => {
    const denied = await executeSettlementPaymentAction({
      actor: {
        userId: "exec1",
        permissions: ["settlements:execute", "finance:read"],
      },
      action: "create",
      settlementId: "missing",
      amountMinor: BigInt(100),
      clientKey: "k1",
      correlationId: "c1",
      allowOffline: false,
    });
    expect(denied.ok).toBe(false);
    expect(denied.productionWriteExecuted).toBe(false);

    const repo = getOfflineSettlementV2Repository();
    const draft = await repo.createDraft({
      partyType: "driver",
      partyId: "d1",
      countryId: "saudi_arabia",
      currency: "SAR",
      direction: "DRIVER_PAYS_COMPANY",
      claims: [
        {
          lineId: "line_1",
          orderId: "ord_1",
          amountMinor: BigInt(500),
          currency: "SAR",
        },
      ],
      periodFromUtc: "2026-01-01T00:00:00.000Z",
      periodToUtc: "2026-01-31T23:59:59.000Z",
      createdByUserId: "prep1",
      clientKey: "draft_p0",
      correlationId: "corr_draft",
    });
    await repo.lock({
      settlementId: draft.id,
      approverUserId: "appr1",
      clientKey: "lock_p0",
    });

    const created = await executeSettlementPaymentAction({
      actor: {
        userId: "exec1",
        permissions: ["settlements:execute", "finance:read"],
      },
      action: "create",
      settlementId: draft.id,
      amountMinor: BigInt(100),
      clientKey: "pay_p0",
      correlationId: "corr_pay",
      allowOffline: true,
    });
    expect(created.ok).toBe(true);
    expect(created.productionWriteExecuted).toBe(false);
    expect(created.payment?.status).toBe("pending");
  });
});

describe("P0 nav + allowlist + adapters", () => {
  it("surfaces regions/vehicle/partners/fleet/guides in product nav", () => {
    expect(PRODUCTION_NAV_HREFS).toContain("/geography");
    expect(PRODUCTION_NAV_HREFS).toContain("/vehicle-catalog");
    expect(PRODUCTION_NAV_HREFS).toContain("/partners");
    expect(PRODUCTION_NAV_HREFS).toContain("/fleet");
    expect(PRODUCTION_NAV_HREFS).toContain("/guides");
  });

  it("allowlists type_car + transport_company; live shadow includes regions", () => {
    expect(PRODUCTION_READ_COLLECTION_ALLOWLIST).toContain("type_car");
    expect(PRODUCTION_READ_COLLECTION_ALLOWLIST).toContain("transport_company");
    expect(LIVE_SHADOW_RESOURCES).toContain("regions");
    expect(LIVE_SHADOW_RESOURCES).toContain("vehicle_catalog");
  });

  it("compatibility adapters exist without Production migration", () => {
    expect(LEGACY_COMPATIBILITY_ADAPTERS.region.legacyCollection).toBe("cities");
    expect(LEGACY_COMPATIBILITY_ADAPTERS.vehicleType.legacyCollection).toBe(
      "type_car",
    );
  });
});
