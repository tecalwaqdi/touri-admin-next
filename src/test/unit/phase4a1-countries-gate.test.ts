/**
 * Phase 4A-1 — countries-only live gates, startup, observability sinks.
 * Fake / local ONLY — no Production Firebase calls in this suite.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv, resetEnvCache, getEnv } from "@/config/env";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import { LiveResourceNotEnabledError } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import {
  FileNdjsonProductionReadObservability,
  StructuredLoggerProductionReadObservability,
} from "@/infrastructure/production/ObservabilityEvents";
import { mapCountryFromLegacyDoc } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { FirebaseProductionGeographyReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";

function ctx(): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-1",
    permissions: ["geography:read", "trips:read", "customers:read"],
    requestId: "req-4a1",
    correlationId: "corr-4a1",
  };
}

const liveStartupBase = {
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
  LIVE_SHADOW_ALLOWED_RESOURCES: "countries",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

describe("Phase 4A-1 live shadow startup gates", () => {
  beforeEach(() => resetEnvCache());

  it("defaults remain disabled with empty live allowlist", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.PRODUCTION_READ_OBSERVABILITY_SINK).toBe("memory");
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
  });

  it("FAIL STARTUP when read enabled with write flag true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        PRODUCTION_WRITE_ENABLED: true,
      }),
    ).toThrow(/PRODUCTION_WRITE_ENABLED=true/);
  });

  it("FAIL STARTUP when live allowlist is not a single controlled window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "countries,cities",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("accepts cities-only allowlist for Phase 4A-2 startup", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "cities",
      }),
    ).not.toThrow();
  });

  it("accepts landmarks-only allowlist for Phase 4A-3 startup", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "landmarks",
      }),
    ).not.toThrow();
  });

  it("FAIL STARTUP when observability sink is memory-only", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveStartupBase,
        PRODUCTION_READ_OBSERVABILITY_SINK: "memory",
      }),
    ).toThrow(/OBSERVABILITY_SINK/);
  });

  it("loadEnv rejects Production read enablement without full gates", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        AUTH_MODE: "verified_token",
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_READ_MODE: "shadow",
        EXPECTED_PROJECT_ID: "proj",
        LIVE_SHADOW_ALLOWED_RESOURCES: "countries",
        PRODUCTION_READ_OBSERVABILITY_SINK: "memory",
        FULL_PII_SHADOW_ENABLED: false,
      }),
    ).toThrow(/Environment validation failed/);
  });

  it("loadEnv accepts countries-only live config with structured logger", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_READ_MODE: "shadow",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      EXPECTED_ENVIRONMENT: "production",
      LIVE_SHADOW_ALLOWED_RESOURCES: "countries",
      PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      FULL_PII_SHADOW_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    });
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("countries");
  });
});

describe("Phase 4A-1 LIVE_SHADOW_ALLOWED_RESOURCES runtime", () => {
  it("allows countries and denies cities/trips/customers", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("countries", [
      { id: "saudi_arabia", data: { naim: "Saudi Arabia", currencyCode: "SAR" } },
      { id: "country_kg", data: { naim: "Kyrgyzstan", currency: "KGS" } },
    ]);
    client.seed("cities", [
      { id: "riyadh", data: { name: "Riyadh", countryId: "saudi_arabia" } },
    ]);
    const allowed = new Set(["countries"]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: allowed,
    });

    const countries = await repos.geography.listCountries(ctx(), {}, { limit: 20 });
    expect(countries.items.length).toBe(2);
    expect(countries.items.map((i) => i.data.id).sort()).toEqual([
      "kyrgyzstan",
      "saudi_arabia",
    ]);

    await expect(
      repos.geography.listCities(ctx(), {}, { limit: 10 }),
    ).rejects.toBeInstanceOf(LiveResourceNotEnabledError);

    await expect(
      repos.trips.list(ctx(), {}, { limit: 10 }),
    ).rejects.toMatchObject({ code: "LIVE_RESOURCE_NOT_ENABLED" });

    await expect(
      repos.customers.getSummaryById(ctx(), "x"),
    ).rejects.toMatchObject({ code: "LIVE_RESOURCE_NOT_ENABLED" });
  });

  it("shadow container defaults to countries-only when read enabled", async () => {
    const c = createShadowReadContainer({ productionReadEnabled: true });
    expect([...c.liveShadowAllowedResources]).toEqual(["countries"]);
    await expect(
      c.productionReads.trips.list(ctx(), {}, { limit: 5 }),
    ).rejects.toMatchObject({ code: "LIVE_RESOURCE_NOT_ENABLED" });
  });

  it("kill switch denies countries without Firestore when disabled", async () => {
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
      liveShadowAllowedResources: new Set(["countries"]),
    });
    await expect(
      geo.listCountries(ctx(), {}, { limit: 20 }),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    expect(queries).toBe(0);
  });
});

describe("Phase 4A-1 country mapper + stats", () => {
  it("maps aliases via Legacy Geography Mapper", () => {
    const mapped = mapCountryFromLegacyDoc({
      documentId: "country_sa",
      data: { naim: "Saudi Arabia", currencyCode: "SAR" },
    });
    expect(mapped.canonicalId).toBe("saudi_arabia");
    expect(mapped.unmapped).toBe(false);
    expect(mapped.recordClassification).toBe("valid_candidate");
  });

  it("classifies CP5 functional test country without aliasing", () => {
    const mapped = mapCountryFromLegacyDoc({
      documentId: "cp5_country_1787562918003",
      data: {
        naim: "FUNCTIONAL TEST COUNTRY",
        name: "FUNCTIONAL TEST COUNTRY",
        functional_test: true,
        functional_test_checkpoint: "ADMIN_CP5",
      },
    });
    expect(mapped.recordClassification).toBe("test_or_noncanonical");
    expect(mapped.unmapped).toBe(true);
    expect(mapped.canonicalId).toBe("cp5_country_1787562918003");
    expect(
      mapped.warnings.some((w) => w.code === "test_or_noncanonical_country"),
    ).toBe(true);
  });

  it("maps Africa-three Production IDs + Arabic naim to canonical countries", () => {
    const cases = [
      { id: "niger", naim: "النيجر", canonical: "niger" },
      { id: "chad", naim: "تشاد", canonical: "chad" },
      { id: "nigeria", naim: "نيجيريا", canonical: "nigeria" },
    ] as const;
    for (const c of cases) {
      const mapped = mapCountryFromLegacyDoc({
        documentId: c.id,
        data: { naim: c.naim },
      });
      expect(mapped.unmapped).toBe(false);
      expect(mapped.recordClassification).toBe("valid_candidate");
      expect(mapped.canonicalId).toBe(c.canonical);
      expect(mapped.name).toBe(c.naim);
    }
  });

  it("resolves exact Arabic country aliases without fuzzy match", () => {
    expect(resolveCanonicalCountryId("النيجر")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "niger",
      matchedVia: "alias",
    });
    expect(resolveCanonicalCountryId("تشاد")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "chad",
      matchedVia: "alias",
    });
    expect(resolveCanonicalCountryId("نيجيريا")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "nigeria",
      matchedVia: "alias",
    });
  });

  it("resolves demo_saudi as exact Legacy Saudi alias only", () => {
    expect(resolveCanonicalCountryId("demo_saudi")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "saudi_arabia",
      matchedVia: "alias",
    });
    expect(resolveCanonicalCountryId("countries/demo_saudi")).toMatchObject({
      status: "mapped",
      canonicalCountryId: "saudi_arabia",
    });
    expect(resolveCanonicalCountryId("demo_unknown").status).toBe("unmapped");
  });

  it("keeps CP5 as testOrNoncanonical after Africa-three mapping", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("countries", [
      { id: "niger", data: { naim: "النيجر" } },
      { id: "chad", data: { naim: "تشاد" } },
      { id: "nigeria", data: { naim: "نيجيريا" } },
      {
        id: "cp5_country_1787562918003",
        data: {
          naim: "FUNCTIONAL TEST COUNTRY",
          name: "FUNCTIONAL TEST COUNTRY",
          functional_test: true,
          functional_test_checkpoint: "ADMIN_CP5",
        },
      },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["countries"]),
    });
    await geo.listCountries(ctx(), {}, { limit: 20 });
    expect(geo.lastCountryMappingStats).toMatchObject({
      recordsRead: 4,
      validMapped: 3,
      unmappedValid: 0,
      testOrNoncanonical: 1,
      malformed: 0,
      duplicates: 0,
    });
  });

  it("records mapping stats distinguishing test vs unmappedValid", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("countries", [
      { id: "saudi_arabia", data: { naim: "Saudi Arabia" } },
      { id: "country_sa", data: { naim: "KSA" } },
      { id: "mystery_land", data: { naim: "Mystery" } },
      {
        id: "cp5_country_1787562918003",
        data: {
          naim: "FUNCTIONAL TEST COUNTRY",
          name: "FUNCTIONAL TEST COUNTRY",
          functional_test: true,
          functional_test_checkpoint: "ADMIN_CP5",
        },
      },
      { id: "name_only_ghost", data: { name: "Has English name only" } },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["countries"]),
    });
    const page = await geo.listCountries(ctx(), {}, { limit: 20 });
    // orderBy(naim) excludes name_only_ghost (Firestore field-existence semantics)
    expect(geo.lastCountryMappingStats).toEqual({
      recordsRead: 4,
      mapped: 2,
      withWarnings: 3, // alias + unmappedValid + test
      unmapped: 1, // unmappedValid only
      duplicates: 1,
      validMapped: 2,
      unmappedValid: 1,
      testOrNoncanonical: 1,
      malformed: 0,
    });
    expect(page.items.some((i) => i.data.id === "mystery_land")).toBe(true);
    expect(
      page.items.some((i) => i.data.id === "cp5_country_1787562918003"),
    ).toBe(true);
    expect(page.items.some((i) => i.data.id === "name_only_ghost")).toBe(false);
  });

  it("orderBy naim matches Legacy country list field", async () => {
    const client = new FakeFirestoreReadClient();
    let seenOrderBy: string | undefined;
    const orig = client.query.bind(client);
    client.query = async (req) => {
      seenOrderBy = req.orderBy?.[0]?.field;
      return orig(req);
    };
    client.seed("countries", [
      { id: "saudi_arabia", data: { naim: "السعودية" } },
    ]);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["countries"]),
    });
    await geo.listCountries(ctx(), {}, { limit: 20 });
    expect(seenOrderBy).toBe("naim");
  });
});

describe("Phase 4A-1 observability sinks beyond InMemory", () => {
  it("structured logger sink records events", () => {
    const obs = new StructuredLoggerProductionReadObservability();
    obs.emit({ type: "production_read_request", resource: "countries" });
    obs.emit({
      type: "production_read_denied",
      reason: "kill",
      code: "PRODUCTION_READ_DISABLED",
    });
    expect(obs.list().map((e) => e.type)).toEqual([
      "production_read_request",
      "production_read_denied",
    ]);
  });

  it("file NDJSON sink writes scrubbed events", () => {
    const dir = mkdtempSync(join(tmpdir(), "touri-obs-"));
    const file = join(dir, "events.ndjson");
    try {
      const obs = new FileNdjsonProductionReadObservability(file);
      obs.emit({ type: "kill_switch_triggered", flag: "PRODUCTION_READ_ENABLED" });
      const line = readFileSync(file, "utf8").trim();
      expect(line).toContain("kill_switch_triggered");
      expect(line).not.toMatch(/BEGIN PRIVATE KEY|Bearer /);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Phase 4A-1 Application Default Credentials provider", () => {
  it("returns application_default kind and refuses GOOGLE_APPLICATION_CREDENTIALS JSON key path", async () => {
    const {
      ApplicationDefaultProductionCredentialProvider,
      ProductionCredentialError,
    } = await import(
      "@/infrastructure/production/credentials/ProductionCredentialProvider"
    );
    const prev = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const adc = new ApplicationDefaultProductionCredentialProvider(
      "tutorial-multi-language-70gx4j",
    );
    await expect(adc.getCredentials()).resolves.toEqual({
      projectId: "tutorial-multi-language-70gx4j",
      kind: "application_default",
    });

    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/fake-sa.json";
    await expect(adc.getCredentials()).rejects.toBeInstanceOf(
      ProductionCredentialError,
    );
    if (prev === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = prev;
  });
});
