/**
 * Phase 4A-3 — Landmarks (Legacy mkan) Fake/unit readiness suite.
 * NO Production Firebase calls.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache, getEnv } from "@/config/env";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  LiveResourceNotEnabledError,
  parseLiveShadowAllowedResources,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { mapLandmarkFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  FirebaseProductionGeographyReadRepository,
  PHASE_4A3_LANDMARKS_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { CollectionNotAllowedError } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";
import { summarizeLandmarkImages } from "@/domain/geography/LandmarkImageSummary";
import { classifyLegacyLandmarkRecord } from "@/domain/geography/LandmarkRecordClassification";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { landmarkMappingReadyForLiveClose } from "@/domain/geography/LandmarkDuplicateIdentityAudit";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a3",
    permissions: ["geography:read"],
    requestId: "req-4a3",
    correlationId: "corr-4a3",
    ...overrides,
  };
}

const liveLandmarksStartupBase = {
  PRODUCTION_READ_ENABLED: true,
  PRODUCTION_READ_MODE: "shadow" as const,
  AUTH_MODE: "verified_token" as const,
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false,
  LIVE_SHADOW_ALLOWED_RESOURCES: "landmarks",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const kingdomTower = {
  id: "lm_sa_riyadh_kingdom",
  data: {
    naim: "برج المملكة",
    osf: "معلم في الرياض",
    names_i18n: { ar: "برج المملكة", en: "Kingdom Centre" },
    Rev_dolh: "countries/saudi_arabia",
    id_vill: "villages/city_sa_riyadh",
    id_cit: "cities/region_sa_riyadh",
    Location: { latitude: 24.7113, longitude: 46.6744 },
    img1: "https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg",
    img2: "https://example.com/gallery.jpg",
    acctev: true,
    tsnef: "معالم سياحية",
    rate: 4.5,
    ser: 99.5,
    EmailUser: "owner@example.com",
  },
};

const kgAlaToo = {
  id: "lm_kg_bishkek_ala_too",
  data: {
    naim: "Ala-Too Square",
    Rev_dolh: { path: "countries/kyrgyzstan", id: "kyrgyzstan" },
    id_vill: { path: "villages/city_kg_bishkek", id: "city_kg_bishkek" },
    Location: { latitude: 42.876, longitude: 74.603 },
    img1: "https://upload.wikimedia.org/wikipedia/commons/x.jpg",
    acctev: true,
  },
};

describe("Phase 4A-3 defaults + startup", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts landmarks-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveLandmarksStartupBase),
    ).not.toThrow();
  });

  it("startup rejects landmarks+cities widen", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveLandmarksStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "landmarks,cities",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("startup allows write gate alongside landmarks read", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveLandmarksStartupBase,
        PRODUCTION_WRITE_ENABLED: true,
      }),
    ).not.toThrow();
  });

  it("loadEnv accepts landmarks-only live config", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_READ_MODE: "shadow",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      EXPECTED_ENVIRONMENT: "production",
      LIVE_SHADOW_ALLOWED_RESOURCES: "landmarks",
      PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
      FULL_PII_SHADOW_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    });
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("landmarks");
  });
});

describe("Phase 4A-3 mapLandmarkFromLegacyDoc", () => {
  it("maps valid SA landmark with country+city+region+coords+images", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: kingdomTower.id,
      data: kingdomTower.data,
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.canonicalLandmarkId).toBe(kingdomTower.id);
    expect(mapped.sourceDocumentId).toBe(kingdomTower.id);
    expect(mapped.countryId).toBe("saudi_arabia");
    expect(mapped.cityId).toBe("city_sa_riyadh");
    expect(mapped.regionId).toBe("region_sa_riyadh");
    expect(mapped.activeStatus).toBe("active");
    expect(mapped.coordinates?.latitude).toBeCloseTo(24.7113);
    expect(mapped.imageSummary.hasImage).toBe(true);
    expect(mapped.imageSummary.imageCount).toBe(2);
    expect(mapped.imageSummary.storageKind).toBe("mixed");
    expect(mapped.source).toBe("legacy_mkan");
    // Never leak raw URLs or EmailUser/ser onto mapped warnings as values
    expect(JSON.stringify(mapped)).not.toContain("owner@example.com");
    expect(JSON.stringify(mapped)).not.toContain("firebasestorage.googleapis.com");
  });

  it("maps KG landmark with DocumentReference-shaped relations", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: kgAlaToo.id,
      data: kgAlaToo.data,
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.countryId).toBe("kyrgyzstan");
    expect(mapped.cityId).toBe("city_kg_bishkek");
  });

  it("unmappedCountry when Rev_dolh missing — never invents from name/coords", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_orphan",
      data: {
        naim: "Somewhere in Riyadh",
        id_vill: "villages/city_sa_riyadh",
        Location: { latitude: 24.7, longitude: 46.6 },
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    expect(mapped.countryId).toBe("");
  });

  it("unmappedCity when id_vill missing — never invents from coords", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_no_city",
      data: {
        naim: "Orphan pin",
        Rev_dolh: "countries/saudi_arabia",
        Location: { latitude: 24.7, longitude: 46.6 },
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCity");
    expect(mapped.cityId).toBe("");
    expect(mapped.countryId).toBe("saudi_arabia");
  });

  it("unmappedCountry when Rev_dolh unknown", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_unknown_country",
      data: {
        naim: "X",
        Rev_dolh: "countries/atlantis",
        id_vill: "villages/city_sa_riyadh",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
  });

  it("testOrNoncanonical for CP5 landmark id", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "cp5_mkan_001",
      data: {
        naim: "FUNCTIONAL TEST LANDMARK",
        Rev_dolh: "countries/cp5_country_1",
        id_vill: "villages/cp5_city_1",
        functional_test: true,
        functional_test_checkpoint: "ADMIN_CP5",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("testOrNoncanonical");
  });

  it("malformed when document data missing", () => {
    const classified = classifyLegacyLandmarkRecord({
      documentId: "x",
      data: null,
    });
    expect(classified.classification).toBe("malformed");
  });

  it("inactive when acctev false", () => {
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: kingdomTower.id,
      data: { ...kingdomTower.data, acctev: false },
    });
    expect(mapped.activeStatus).toBe("inactive");
    expect(mapped.mappingStatus).toBe("validMapped");
  });

  it("ambiguousCity when city alias collides", () => {
    const aliases: CityAliasEntry[] = [
      {
        aliasId: "city_shared",
        canonicalCityId: "city_a",
        countryId: "saudi_arabia",
        confidence: "high",
        evidence: "test",
      },
      {
        aliasId: "city_shared",
        canonicalCityId: "city_b",
        countryId: "saudi_arabia",
        confidence: "high",
        evidence: "test",
      },
    ];
    const mapped = mapLandmarkFromLegacyDoc({
      documentId: "lm_amb",
      data: {
        naim: "Ambiguous city landmark",
        Rev_dolh: "countries/saudi_arabia",
        id_vill: "villages/city_shared",
        acctev: true,
      },
      aliases,
    });
    expect(mapped.mappingStatus).toBe("ambiguousCity");
  });

  it("falls back to legacy img when img1 empty", () => {
    const summary = summarizeLandmarkImages({
      img: "https://example.com/legacy.jpg",
      img1: "",
    });
    expect(summary.hasImage).toBe(true);
    expect(summary.imageCount).toBe(1);
    expect(summary.storageKind).toBe("http_url");
  });

  it("firebase_storage kind for Storage download URLs", () => {
    const summary = summarizeLandmarkImages({
      img1: "https://firebasestorage.googleapis.com/v0/b/x/o/y",
    });
    expect(summary.storageKind).toBe("firebase_storage");
  });
});

describe("Phase 4A-3 listLandmarks Fake repository", () => {
  it("paginates mkan orderBy naim and reports mapping stats", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", [
      kingdomTower,
      kgAlaToo,
      {
        id: "lm_zzz",
        data: {
          naim: "Zoo Place",
          Rev_dolh: "countries/saudi_arabia",
          id_vill: "villages/city_sa_riyadh",
          acctev: true,
        },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page1 = await geo.listLandmarks(ctx(), {}, { limit: 2 });
    expect(page1.items.length).toBe(2);
    expect(geo.lastLandmarkMappingStats?.validMapped).toBe(2);
    const page2 = await geo.listLandmarks(ctx(), {}, {
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.length).toBe(1);
    expect(geo.lastLandmarkMappingStats?.recordsRead).toBe(1);
  });

  it("hard-caps page size at PHASE_4A3_LANDMARKS_MAX_PAGE", async () => {
    const client = new FakeFirestoreReadClient();
    const docs = Array.from({ length: 60 }, (_, i) => ({
      id: `lm_${String(i).padStart(2, "0")}`,
      data: {
        naim: `Landmark ${String(i).padStart(2, "0")}`,
        Rev_dolh: "countries/saudi_arabia",
        id_vill: "villages/city_sa_riyadh",
        acctev: true,
      },
    }));
    client.seed("mkan", docs);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(ctx(), {}, { limit: 100 });
    expect(page.items.length).toBe(PHASE_4A3_LANDMARKS_MAX_PAGE);
  });

  it("applies country scope after mapping", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", [kingdomTower, kgAlaToo]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      {},
      { limit: 20 },
    );
    expect(page.items.every((e) => e.data.countryId === "saudi_arabia")).toBe(
      true,
    );
    expect(page.items.length).toBe(1);
  });

  it("applies city scope after mapping", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", [kingdomTower, kgAlaToo]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(
      ctx({
        scope: {
          type: "city",
          countryIds: ["saudi_arabia"],
          cityIds: ["city_sa_riyadh"],
        },
        serverScopeFilter: {
          countryIds: ["saudi_arabia"],
          cityIds: ["city_sa_riyadh"],
        },
      }),
      {},
      { limit: 20 },
    );
    expect(page.items.every((e) => e.data.cityId === "city_sa_riyadh")).toBe(
      true,
    );
  });

  it("resource gate denies landmarks when allowlist is cities", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", [kingdomTower]);
    const allowed = parseLiveShadowAllowedResources("cities");
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: allowed,
    });
    await expect(
      geo.listLandmarks(ctx(), {}, { limit: 10 }),
    ).rejects.toBeInstanceOf(LiveResourceNotEnabledError);
  });

  it("kill switch blocks listLandmarks", async () => {
    let queries = 0;
    const client = new FakeFirestoreReadClient();
    const orig = client.query.bind(client);
    client.query = async (req) => {
      queries += 1;
      return orig(req);
    };
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: false,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    await expect(
      geo.listLandmarks(ctx(), {}, { limit: 20 }),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    expect(queries).toBe(0);
  });

  it("queries mkan collection not villages/cities for listLandmarks", async () => {
    const client = new FakeFirestoreReadClient();
    const collections: string[] = [];
    const orig = client.query.bind(client);
    client.query = async (req) => {
      collections.push(req.collection);
      return orig(req);
    };
    client.seed("mkan", [kingdomTower]);
    client.seed("villages", [
      {
        id: "city_sa_riyadh",
        data: { naim: "الرياض", dolh: "countries/saudi_arabia", acctev: true },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(ctx(), {}, { limit: 10 });
    expect(collections).toEqual(["mkan"]);
    expect(page.items[0]?.data.source).toBe("legacy_mkan");
  });

  it("does not call listCountries or listCities during listLandmarks", async () => {
    const client = new FakeFirestoreReadClient();
    const collections: string[] = [];
    const orig = client.query.bind(client);
    client.query = async (req) => {
      collections.push(req.collection);
      return orig(req);
    };
    client.seed("mkan", [kingdomTower]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    await repos.geography.listLandmarks(ctx(), {}, { limit: 10 });
    expect(collections).toEqual(["mkan"]);
    expect(collections).not.toContain("countries");
    expect(collections).not.toContain("villages");
  });

  it("collection allowlist still rejects finance collections", async () => {
    const client = new FakeFirestoreReadClient();
    await expect(client.getDocument("ledger", "x")).rejects.toBeInstanceOf(
      CollectionNotAllowedError,
    );
  });

  it("shadow container wiring exposes geography.listLandmarks", async () => {
    const container = createShadowReadContainer({
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    expect(typeof container.productionReads.geography.listLandmarks).toBe(
      "function",
    );
  });

  it("sensitive registry covers landmark raw image and EmailUser", () => {
    const fields = SENSITIVE_FIELD_REGISTRY.filter(
      (r) => r.resource === "landmark",
    ).map((r) => r.field);
    expect(fields).toEqual(
      expect.arrayContaining(["EmailUser", "img1", "img2", "img3", "ser"]),
    );
  });

  it("readiness gate fails when unmappedCity > 0", () => {
    expect(
      landmarkMappingReadyForLiveClose({
        unmappedCountry: 0,
        unmappedCity: 1,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
      }),
    ).toBe(false);
  });

  it("readiness gate passes when all zero", () => {
    expect(
      landmarkMappingReadyForLiveClose({
        unmappedCountry: 0,
        unmappedCity: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
      }),
    ).toBe(true);
  });
});
