/**
 * Phase 4A-2 — Cities (Legacy villages) Fake/unit readiness suite.
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
import { mapCityFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import {
  FirebaseProductionGeographyReadRepository,
  PHASE_4A2_CITIES_MAX_PAGE,
} from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { CollectionNotAllowedError } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import type { CityAliasEntry } from "@/domain/geography/CityAliasResolver";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a2",
    permissions: ["geography:read"],
    requestId: "req-4a2",
    correlationId: "corr-4a2",
    ...overrides,
  };
}

const liveCitiesStartupBase = {
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
  LIVE_SHADOW_ALLOWED_RESOURCES: "cities",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const saRiyadh = {
  id: "city_sa_riyadh",
  data: {
    naim: "الرياض",
    dolh: "countries/saudi_arabia",
    cities: "cities/region_sa_riyadh",
    acctev: true,
  },
};

const kgBishkek = {
  id: "city_kg_bishkek",
  data: {
    naim: "Bishkek",
    dolh: { path: "countries/kyrgyzstan", id: "kyrgyzstan" },
    cities: "cities/region_kg_chuy",
    acctev: true,
  },
};

describe("Phase 4A-2 defaults + startup", () => {
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

  it("startup accepts cities-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveCitiesStartupBase),
    ).not.toThrow();
  });

  it("startup rejects cities+countries widen", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveCitiesStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "cities,countries",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("loadEnv accepts cities-only live config", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_READ_MODE: "shadow",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      EXPECTED_ENVIRONMENT: "production",
      LIVE_SHADOW_ALLOWED_RESOURCES: "cities",
      PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
      FULL_PII_SHADOW_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    });
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("cities");
  });
});

describe("Phase 4A-2 mapCityFromLegacyDoc", () => {
  it("maps valid SA city with country+region", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: saRiyadh.id,
      data: saRiyadh.data,
      aliases: [
        {
          aliasId: "city_sa_riyadh",
          canonicalCityId: "city_sa_riyadh",
          countryId: "saudi_arabia",
          confidence: "high",
          evidence: "test",
        },
      ],
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.countryId).toBe("saudi_arabia");
    expect(mapped.regionId).toBe("region_sa_riyadh");
    expect(mapped.safeName).toBe("الرياض");
    expect(mapped.activeStatus).toBe("active");
    expect(mapped.source).toBe("legacy_villages");
    expect(mapped.sourceDocumentId).toBe("city_sa_riyadh");
    expect(mapped.canonicalCityId).toBe("city_sa_riyadh");
    expect(mapped.sourceDocumentId).toBe(mapped.canonicalCityId);
  });

  it("maps other mapped country (kyrgyzstan)", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: kgBishkek.id,
      data: kgBishkek.data,
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.countryId).toBe("kyrgyzstan");
    expect(mapped.regionId).toBe("region_kg_chuy");
  });

  it("marks missing country relation as unmappedCountry (no name invent)", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "orphan_city",
      data: { naim: "LooksLikeSaudi", acctev: true },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    expect(mapped.countryId).toBe("");
    expect(mapped.warnings.some((w) => w.code === "missing_country_relation")).toBe(
      true,
    );
  });

  it("marks unknown country relation as unmappedCountry", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "city_xx",
      data: {
        naim: "Somewhere",
        dolh: "countries/atlantis",
        acctev: true,
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    expect(mapped.countryId).toBe("atlantis");
  });

  it("marks inactive via acctev=false", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "city_sa_taif",
      data: {
        naim: "الطائف",
        dolh: "countries/saudi_arabia",
        acctev: false,
      },
    });
    expect(mapped.activeStatus).toBe("inactive");
    expect(mapped.mappingStatus).toBe("validMapped");
  });

  it("marks CP5-associated city as testOrNoncanonical", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "cp5_city_1",
      data: {
        naim: "FUNCTIONAL TEST CITY",
        dolh: "countries/cp5_country_123",
        acctev: true,
        functional_test: true,
        functional_test_checkpoint: "ADMIN_CP5",
      },
    });
    expect(mapped.mappingStatus).toBe("testOrNoncanonical");
    expect(mapped.countryId).toBe("cp5_country_123");
  });

  it("marks malformed missing document data path", () => {
    const mapped = mapCityFromLegacyDoc({
      documentId: "",
      data: { naim: "x" },
    });
    expect(mapped.mappingStatus).toBe("malformed");
  });

  it("ambiguous city alias → ambiguousCountry; keeps dolh country", () => {
    const aliases: CityAliasEntry[] = [
      {
        aliasId: "city_dup",
        canonicalCityId: "city_a",
        countryId: "saudi_arabia",
        confidence: "high",
        evidence: "t",
      },
      {
        aliasId: "city_dup",
        canonicalCityId: "city_b",
        countryId: "saudi_arabia",
        confidence: "high",
        evidence: "t",
      },
    ];
    const mapped = mapCityFromLegacyDoc({
      documentId: "city_dup",
      data: {
        naim: "Dup",
        dolh: "countries/saudi_arabia",
        acctev: true,
      },
      aliases,
    });
    expect(mapped.mappingStatus).toBe("ambiguousCountry");
    expect(mapped.countryId).toBe("saudi_arabia");
    expect(mapped.id).toBe("city_dup");
  });
});

describe("Phase 4A-2 listCities Fake repository", () => {
  it("lists valid cities ordered by naim with pagination + cursor", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("villages", [
      {
        id: "c_b",
        data: {
          naim: "Beta",
          dolh: "countries/portugal",
          acctev: true,
        },
      },
      {
        id: "c_a",
        data: {
          naim: "Alpha",
          dolh: "countries/spain",
          acctev: true,
        },
      },
      {
        id: "c_c",
        data: {
          naim: "Charlie",
          dolh: "countries/morocco",
          acctev: true,
        },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    const page1 = await geo.listCities(ctx(), {}, { limit: 2 });
    expect(page1.items.map((i) => i.data.safeName)).toEqual(["Alpha", "Beta"]);
    expect(page1.nextCursor).toBeTruthy();
    expect(geo.lastCityMappingStats?.validMapped).toBe(2);
    const page2 = await geo.listCities(ctx(), {}, {
      limit: 2,
      cursor: page1.nextCursor ?? undefined,
    });
    expect(page2.items.map((i) => i.data.safeName)).toEqual(["Charlie"]);
    expect(geo.lastCityMappingStats?.validMapped).toBe(1);
    expect(geo.lastCityMappingStats?.recordsRead).toBe(1);
  });

  it("hard-caps page size at PHASE_4A2_CITIES_MAX_PAGE", async () => {
    const client = new FakeFirestoreReadClient();
    const docs = Array.from({ length: 60 }, (_, i) => ({
      id: `c_${String(i).padStart(2, "0")}`,
      data: {
        naim: `City ${String(i).padStart(2, "0")}`,
        dolh: "countries/india",
        acctev: true,
      },
    }));
    client.seed("villages", docs);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    const page = await geo.listCities(ctx(), {}, { limit: 100 });
    expect(page.items.length).toBe(PHASE_4A2_CITIES_MAX_PAGE);
    expect(page.truncated).toBe(true);
  });

  it("country scope prevents cross-country leakage", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("villages", [saRiyadh, kgBishkek]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    const page = await geo.listCities(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      {},
      { limit: 20 },
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.data.countryId).toBe("saudi_arabia");
    expect(page.items.every((i) => i.data.countryId === "saudi_arabia")).toBe(
      true,
    );
  });

  it("filter.countryId scopes to that country only", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("villages", [saRiyadh, kgBishkek]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    const page = await geo.listCities(
      ctx(),
      { countryId: "kyrgyzstan" },
      { limit: 20 },
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.data.id).toBe("city_kg_bishkek");
  });

  it("resource gate rejects countries when only cities allowed", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("countries", [
      { id: "saudi_arabia", data: { naim: "السعودية" } },
    ]);
    client.seed("villages", [saRiyadh]);
    const allowed = parseLiveShadowAllowedResources("cities");
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: allowed,
    });
    await expect(
      repos.geography.listCountries(ctx(), {}, { limit: 10 }),
    ).rejects.toBeInstanceOf(LiveResourceNotEnabledError);
    const cities = await repos.geography.listCities(ctx(), {}, { limit: 10 });
    expect(cities.items.length).toBe(1);
    await expect(
      repos.trips.list(ctx(), {}, { limit: 10 }),
    ).rejects.toMatchObject({ code: "LIVE_RESOURCE_NOT_ENABLED" });
  });

  it("kill switch denies cities without Firestore when disabled", async () => {
    const client = new FakeFirestoreReadClient();
    let queries = 0;
    const orig = client.query.bind(client);
    client.query = async (req) => {
      queries += 1;
      return orig(req);
    };
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: false,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    await expect(
      geo.listCities(ctx(), {}, { limit: 20 }),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    expect(queries).toBe(0);
  });

  it("collection allowlist rejects non-city mystery collections", async () => {
    const client = new FakeFirestoreReadClient();
    await expect(client.getDocument("ledger", "x")).rejects.toBeInstanceOf(
      CollectionNotAllowedError,
    );
    await expect(
      client.query({ collection: "settlements", limit: 1 }),
    ).rejects.toBeInstanceOf(CollectionNotAllowedError);
  });

  it("queries villages collection not cities for listCities", async () => {
    const client = new FakeFirestoreReadClient();
    const collections: string[] = [];
    const orig = client.query.bind(client);
    client.query = async (req) => {
      collections.push(req.collection);
      return orig(req);
    };
    client.seed("villages", [saRiyadh]);
    // Poison: if code wrongly queries cities, would return this with wrong fields
    client.seed("cities", [
      {
        id: "region_poison",
        data: { name: "Poison Region", countryId: "saudi_arabia" },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    const page = await geo.listCities(ctx(), {}, { limit: 10 });
    expect(collections).toEqual(["villages"]);
    expect(page.items[0]?.data.safeName).toBe("الرياض");
    expect(page.items[0]?.data.source).toBe("legacy_villages");
  });

  it("shadow container can enable cities allowlist without Production", async () => {
    const c = createShadowReadContainer({
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["cities"]),
    });
    expect([...c.liveShadowAllowedResources]).toEqual(["cities"]);
    expect(c.productionReadEnabled).toBe(true);
    expect(c.fullPiiShadowEnabled).toBe(false);
  });
});
