/**
 * Phase 4A-3 — Landmark duplicate identity audit (Fake/unit).
 * NO Production Firebase calls.
 */
import { describe, expect, it } from "vitest";
import { mapLandmarkFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  FirebaseProductionGeographyReadRepository,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import {
  auditLandmarkDuplicateIdentity,
  haversineMeters,
  hasNearbyCoordinateEvidence,
  landmarkMappingReadyForLiveClose,
  LANDMARK_NEARBY_METERS,
  normalizeSafeName,
} from "@/domain/geography/LandmarkDuplicateIdentityAudit";

function ctx(): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a3-dup",
    permissions: ["geography:read"],
    requestId: "req-4a3-dup",
    correlationId: "corr-4a3-dup",
  };
}

const baseData = {
  naim: "برج المملكة",
  Rev_dolh: "countries/saudi_arabia",
  id_vill: "villages/city_sa_riyadh",
  Location: { latitude: 24.7113, longitude: 46.6744 },
  acctev: true,
};

describe("Phase 4A-3 sourceDocumentId vs canonicalLandmarkId", () => {
  it("keeps sourceDocumentId === canonicalLandmarkId (no silent merge)", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_sa_riyadh_kingdom",
      data: baseData,
    });
    expect(mapped.sourceDocumentId).toBe("lm_sa_riyadh_kingdom");
    expect(mapped.canonicalLandmarkId).toBe("lm_sa_riyadh_kingdom");
    expect(mapped.id).toBe(mapped.canonicalLandmarkId);
  });
});

describe("Phase 4A-3 exact / semantic / nearby coords", () => {
  it("detects exact canonicalLandmarkId collisions across sources", () => {
    // Simulate two source rows that map to same canonical id (forced members).
    const audit = auditLandmarkDuplicateIdentity([
      {
        sourceDocumentId: "src_a",
        canonicalLandmarkId: "lm_shared",
        safeName: "برج المملكة",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
        coordinates: { latitude: 24.7113, longitude: 46.6744 },
      },
      {
        sourceDocumentId: "src_b",
        canonicalLandmarkId: "lm_shared",
        safeName: "برج المملكة",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
        coordinates: { latitude: 24.7114, longitude: 46.6745 },
      },
    ]);
    expect(audit.exactCanonicalDuplicates).toBe(1);
    expect(audit.activeOperationalDuplicates).toBeGreaterThan(0);
    expect(
      audit.exactCanonicalIdDuplicateGroups[0]?.nearbyCoordinatesEvidence,
    ).toBe(true);
  });

  it("detects semantic duplicates same name+city distinct canonical ids", () => {
    const audit = auditLandmarkDuplicateIdentity([
      {
        sourceDocumentId: "lm_1",
        canonicalLandmarkId: "lm_1",
        safeName: "Kingdom Centre",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
        coordinates: { latitude: 24.7113, longitude: 46.6744 },
      },
      {
        sourceDocumentId: "lm_2",
        canonicalLandmarkId: "lm_2",
        safeName: "  kingdom   centre ",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
        coordinates: { latitude: 24.71135, longitude: 46.67445 },
      },
    ]);
    expect(normalizeSafeName("  kingdom   centre ")).toBe("kingdom centre");
    expect(audit.semanticDuplicates).toBe(1);
    expect(audit.semanticDuplicateGroups[0]?.nearbyCoordinatesEvidence).toBe(
      true,
    );
    expect(audit.activeOperationalDuplicates).toBe(1);
  });

  it("coords far apart do not invent identity but still semantic-collide on name+city", () => {
    const a = { latitude: 24.7113, longitude: 46.6744 };
    const b = { latitude: 21.4225, longitude: 39.8262 }; // Makkah
    expect(haversineMeters(a, b)).toBeGreaterThan(LANDMARK_NEARBY_METERS);
    const audit = auditLandmarkDuplicateIdentity([
      {
        sourceDocumentId: "lm_r",
        canonicalLandmarkId: "lm_r",
        safeName: "Same Name",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "validMapped",
        coordinates: a,
      },
      {
        sourceDocumentId: "lm_m",
        canonicalLandmarkId: "lm_m",
        safeName: "Same Name",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
        coordinates: b,
      },
    ]);
    expect(audit.semanticDuplicates).toBe(1);
    expect(audit.semanticDuplicateGroups[0]?.nearbyCoordinatesEvidence).toBe(
      false,
    );
    expect(audit.activeOperationalDuplicates).toBe(0);
    expect(audit.activeInactiveDuplicateGroups.length).toBe(1);
  });

  it("excludes testOrNoncanonical from operational duplicate metrics", () => {
    const audit = auditLandmarkDuplicateIdentity([
      {
        sourceDocumentId: "cp5_mkan_1",
        canonicalLandmarkId: "cp5_mkan_1",
        safeName: "FUNCTIONAL TEST",
        countryId: "cp5_country_1",
        cityId: "cp5_city_1",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "testOrNoncanonical",
        coordinates: null,
      },
      {
        sourceDocumentId: "cp5_mkan_2",
        canonicalLandmarkId: "cp5_mkan_1",
        safeName: "FUNCTIONAL TEST",
        countryId: "cp5_country_1",
        cityId: "cp5_city_1",
        regionId: null,
        activeStatus: "active",
        mappingStatus: "testOrNoncanonical",
        coordinates: null,
      },
    ]);
    expect(audit.exactCanonicalDuplicates).toBe(0);
    expect(audit.activeOperationalDuplicates).toBe(0);
  });

  it("active+active blocks readiness; inactive-only does not", () => {
    expect(
      landmarkMappingReadyForLiveClose({
        unmappedCountry: 0,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 1,
      }),
    ).toBe(false);

    const inactiveOnly = auditLandmarkDuplicateIdentity([
      {
        sourceDocumentId: "a",
        canonicalLandmarkId: "dup",
        safeName: "X",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
        coordinates: null,
      },
      {
        sourceDocumentId: "b",
        canonicalLandmarkId: "dup",
        safeName: "X",
        countryId: "saudi_arabia",
        cityId: "city_sa_riyadh",
        regionId: null,
        activeStatus: "inactive",
        mappingStatus: "validMapped",
        coordinates: null,
      },
    ]);
    expect(inactiveOnly.activeOperationalDuplicates).toBe(0);
    expect(inactiveOnly.exactCanonicalDuplicates).toBe(1);
    expect(inactiveOnly.inactiveInactiveDuplicateGroups.length).toBeGreaterThanOrEqual(1);
  });

  it("hasNearbyCoordinateEvidence respects radius", () => {
    expect(
      hasNearbyCoordinateEvidence([
        {
          sourceDocumentId: "a",
          canonicalLandmarkId: "a",
          safeName: "n",
          countryId: "saudi_arabia",
          cityId: "city_sa_riyadh",
          regionId: null,
          activeStatus: "active",
          mappingStatus: "validMapped",
          coordinates: { latitude: 24.7113, longitude: 46.6744 },
        },
        {
          sourceDocumentId: "b",
          canonicalLandmarkId: "b",
          safeName: "n",
          countryId: "saudi_arabia",
          cityId: "city_sa_riyadh",
          regionId: null,
          activeStatus: "active",
          mappingStatus: "validMapped",
          coordinates: { latitude: 24.71135, longitude: 46.67445 },
        },
      ]),
    ).toBe(true);
  });
});

describe("Phase 4A-3 repository duplicate audit attachment", () => {
  it("attaches lastLandmarkDuplicateAudit on listLandmarks", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", [
      {
        id: "lm_a",
        data: {
          naim: "Shared Name Spot",
          Rev_dolh: "countries/saudi_arabia",
          id_vill: "villages/city_sa_riyadh",
          Location: { latitude: 24.7113, longitude: 46.6744 },
          acctev: true,
        },
      },
      {
        id: "lm_b",
        data: {
          naim: "Shared Name Spot",
          Rev_dolh: "countries/saudi_arabia",
          id_vill: "villages/city_sa_riyadh",
          Location: { latitude: 24.71135, longitude: 46.67445 },
          acctev: true,
        },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    await geo.listLandmarks(ctx(), {}, { limit: 20 });
    expect(geo.lastLandmarkDuplicateAudit).not.toBeNull();
    expect(geo.lastLandmarkMappingStats?.semanticDuplicates).toBe(1);
    expect(geo.lastLandmarkMappingStats?.activeOperationalDuplicates).toBe(1);
  });
});
