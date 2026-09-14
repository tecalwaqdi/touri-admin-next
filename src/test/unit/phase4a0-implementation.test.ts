/**
 * Phase 4A-0 — Production Read implementation tests.
 * Fake / Emulator / Test doubles ONLY. Zero Production Firebase calls.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { getEnv, resetEnvCache } from "@/config/env";
import {
  createShadowReadContainer,
  assertShadowHasNoMutationServices,
  assertNoProductionWriteContainerFactory,
} from "@/infrastructure/production/container/createContainers";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import {
  evaluateProductionReadGate,
  ProductionReadDisabledError,
} from "@/infrastructure/production/ProductionReadGate";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  CollectionNotAllowedError,
  FakeIndexCapabilityChecker,
  InvalidQueryLimitError,
  QueryNotSupportedError,
} from "@/infrastructure/production/firestore/FirestoreReadClient";
import {
  FirebaseAdminFactory,
  assertProductionReadStartupOrThrow,
} from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import {
  FirebaseAdminProductionIdentityVerifier,
  FakeFirebaseAuthAdminClient,
  assertNoTrustedIdentityHeaders,
  safeFirebaseAuthErrorCode,
  type AuthVerifyDiagnosticEvent,
} from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import type { FirebaseAuthAdminClient } from "@/infrastructure/production/firebase/FirebaseProductionContext";
import {
  assertExpectedFirebaseProject,
  FakeProductionCredentialProvider,
  MissingProductionCredentialProvider,
  ProductionCredentialError,
  ProjectFingerprintMismatchError,
  sanitizeCredentialMessage,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  createProductionReadRepositories,
} from "@/infrastructure/production/repositories/createProductionReadRepositories";
import {
  FullPiiShadowDisabledError,
  ScopeDeniedError,
} from "@/infrastructure/production/repositories/productionReadHelpers";
import { DefaultLegacyTripMapper } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { mapCityWithAliasGuard } from "@/infrastructure/production/mappers/LegacyProductionMappers";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { DefaultShadowComparisonService } from "@/infrastructure/production/ShadowComparisonService";
import { InMemoryProductionReadCircuitBreaker } from "@/infrastructure/production/CircuitBreakerDesign";
import { InMemoryProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import {
  isForbiddenUiImport,
  isForbiddenApplicationImport,
  isForbiddenDomainImport,
} from "@/infrastructure/production/ArchitectureBoundary";
import { scanProductionWriteSurface } from "../../../scripts/scan-production-write-surface";
import { resolveAdminNextUiMode } from "@/domain/ui/AdminNextUiMode";
import { emptyShadowDashboard } from "@/domain/ui/ShadowDashboard";
import { DEGRADED_PRODUCTION_MESSAGE } from "@/domain/production-read/constants";
import { shouldRetryProductionRead } from "@/infrastructure/production/ops/QueryBudgetOps";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";

function ctx(
  partial: Partial<ProductionReadContext> & {
    scope: ProductionReadContext["scope"];
  },
): ProductionReadContext {
  return {
    serverScopeFilter: partial.serverScopeFilter ?? {},
    actorUid: partial.actorUid ?? "actor-1",
    permissions: partial.permissions ?? ["trips:read", "drivers:read", "agents:read", "customers:read"],
    requestId: partial.requestId ?? "req-1",
    correlationId: partial.correlationId ?? "corr-1",
    allowFullPii: partial.allowFullPii,
    scope: partial.scope,
  };
}

describe("Phase 4A-0 flags remain disabled", () => {
  beforeEach(() => resetEnvCache());

  it("defaults all production safety flags false including FULL_PII", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
  });

  it("UI mode stays development_synthetic when read disabled", () => {
    expect(
      resolveAdminNextUiMode({
        PRODUCTION_READ_ENABLED: false,
        PRODUCTION_READ_MODE: "disabled",
        APP_ENV: "development",
      }),
    ).toBe("development_synthetic");
  });
});

describe("Phase 4A-0 Firebase Admin fail-closed init", () => {
  beforeEach(() => {
    FirebaseAdminFactory.resetSingletonForTests();
  });

  it("getApp fails with PRODUCTION_READ_DISABLED before credentials", async () => {
    const factory = new FirebaseAdminFactory({
      env: {
        APP_ENV: "production",
        AUTH_MODE: "verified_token",
        PRODUCTION_READ_ENABLED: false,
        PRODUCTION_READ_MODE: "shadow",
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        EXPECTED_PROJECT_ID: "proj",
        EXPECTED_ENVIRONMENT: "production",
      },
      credentialProvider: new FakeProductionCredentialProvider({
        projectId: "proj",
        kind: "fake",
      }),
    });
    await expect(factory.getApp()).rejects.toMatchObject({
      code: "PRODUCTION_READ_DISABLED",
    });
  });

  it("denies wrong APP_ENV / mock auth / write flag / project mismatch", () => {
    expect(
      evaluateProductionReadGate({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        APP_ENV: "staging",
        AUTH_MODE: "verified_token",
        PRODUCTION_READ_MODE: "shadow",
        expectedProjectId: "proj",
        actualProjectId: "proj",
      }).allow,
    ).toBe(false);

    expect(
      evaluateProductionReadGate({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        APP_ENV: "production",
        AUTH_MODE: "mock",
        PRODUCTION_READ_MODE: "shadow",
        expectedProjectId: "proj",
        actualProjectId: "proj",
      }).allow,
    ).toBe(false);

    expect(
      evaluateProductionReadGate({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        APP_ENV: "production",
        AUTH_MODE: "verified_token",
        PRODUCTION_READ_MODE: "shadow",
        expectedProjectId: "proj",
        actualProjectId: "proj",
      }).allow,
    ).toBe(false);

    const mismatch = evaluateProductionReadGate({
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_MODE: "shadow",
      expectedProjectId: "proj-a",
      actualProjectId: "proj-b",
    });
    expect(mismatch.allow).toBe(false);
    if (!mismatch.allow) {
      expect(mismatch.code).toBe("PROJECT_FINGERPRINT_MISMATCH");
    }
  });

  it("startup fails when read enabled without credentials — no mock fallback", async () => {
    await expect(
      assertProductionReadStartupOrThrow({
        PRODUCTION_READ_ENABLED: true,
        credentialProvider: new MissingProductionCredentialProvider(),
      }),
    ).rejects.toBeInstanceOf(ProductionCredentialError);
  });

  it("startup ok when read disabled even without credentials", async () => {
    await expect(
      assertProductionReadStartupOrThrow({
        PRODUCTION_READ_ENABLED: false,
        credentialProvider: new MissingProductionCredentialProvider(),
      }),
    ).resolves.toBeUndefined();
  });
});

describe("Phase 4A-0 identity verifier (Fake Auth Admin)", () => {
  const baseClaims = {
    uid: "uid-1",
    email: "a@b.com",
    email_verified: true,
    iss: "https://securetoken.google.com/fake-project",
    aud: "fake-project",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    auth_time: Math.floor(Date.now() / 1000) - 60,
    country_admin: true,
    country_id: "SA",
  };

  it("verifies valid token → VerifiedIdentity without Firebase types", async () => {
    const auth = new FakeFirebaseAuthAdminClient({
      "good-token": baseClaims,
    });
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: auth,
      config: {
        expectedIssuer: "https://securetoken.google.com/fake-project",
        expectedAudience: "fake-project",
      },
    });
    const result = await verifier.verify("good-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.uid).toBe("uid-1");
      expect(result.identity.claims.country_admin).toBe(true);
      expect(result.identity.emailVerified).toBe(true);
    }
  });

  it("rejects expired / wrong issuer / disabled", async () => {
    const auth = new FakeFirebaseAuthAdminClient({
      expired: { ...baseClaims, exp: Math.floor(Date.now() / 1000) - 120 },
      badiss: { ...baseClaims, iss: "https://evil.example" },
      disabled: { ...baseClaims, disabled: true },
    });
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: auth,
      config: {
        expectedIssuer: "https://securetoken.google.com/fake-project",
        expectedAudience: "fake-project",
      },
    });
    expect((await verifier.verify("expired")).ok).toBe(false);
    expect((await verifier.verify("badiss")).ok).toBe(false);
    const d = await verifier.verify("disabled");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("disabled_user");
  });

  it("diagnosticOnInvalidToken classifies VERIFY_ID_TOKEN vs GET_USER (no secrets)", async () => {
    const events: AuthVerifyDiagnosticEvent[] = [];
    const verifyFailClient: FirebaseAuthAdminClient = {
      async verifyIdToken() {
        const err = Object.assign(new Error("redacted"), {
          code: "auth/id-token-revoked",
        });
        throw err;
      },
    };
    const v1 = new FirebaseAdminProductionIdentityVerifier({
      authClient: verifyFailClient,
      config: {
        expectedIssuer: "https://securetoken.google.com/fake-project",
        expectedAudience: "fake-project",
      },
      diagnosticOnInvalidToken: (e) => events.push(e),
    });
    const r1 = await v1.verify("any");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("token_verification_failed");
    expect(events).toEqual([
      {
        stage: "VERIFY_ID_TOKEN_EXCEPTION",
        errorCode: "auth/id-token-revoked",
      },
    ]);

    events.length = 0;
    const getUserFailClient: FirebaseAuthAdminClient = {
      async verifyIdToken() {
        return { ...baseClaims };
      },
      async getUser() {
        const err = Object.assign(new Error("redacted"), {
          code: "auth/user-not-found",
        });
        throw err;
      },
    };
    const v2 = new FirebaseAdminProductionIdentityVerifier({
      authClient: getUserFailClient,
      config: {
        expectedIssuer: "https://securetoken.google.com/fake-project",
        expectedAudience: "fake-project",
      },
      checkDisabledViaGetUser: true,
      diagnosticOnInvalidToken: (e) => events.push(e),
    });
    const r2 = await v2.verify("any");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("user_lookup_failed");
    expect(events).toEqual([
      { stage: "GET_USER_EXCEPTION", errorCode: "auth/user-not-found" },
    ]);
    expect(safeFirebaseAuthErrorCode({ code: "auth/argument-error" })).toBe(
      "auth/argument-error",
    );
  });

  it("rejects untrusted identity headers in staging/production", () => {
    expect(() =>
      assertNoTrustedIdentityHeaders(
        { "x-user-id": "hack" },
        { APP_ENV: "production" },
      ),
    ).toThrow(/UNTRUSTED_IDENTITY_HEADER/);
    expect(() =>
      assertNoTrustedIdentityHeaders(
        { "x-role": "super_admin" },
        { APP_ENV: "staging" },
      ),
    ).toThrow(/UNTRUSTED_IDENTITY_HEADER/);
  });
});

describe("Phase 4A-0 Firestore read client + allowlists", () => {
  it("denies non-allowlisted collections", async () => {
    const client = new FakeFirestoreReadClient();
    await expect(client.getDocument("ledger", "x")).rejects.toBeInstanceOf(
      CollectionNotAllowedError,
    );
  });

  it("allows countries/cities/villages/mkan/order/user and pages with cursor", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("countries", [
      { id: "SA", data: { name: "Saudi Arabia", currencyCode: "SAR" } },
      { id: "AE", data: { name: "UAE", currencyCode: "AED" } },
      { id: "KG", data: { name: "Kyrgyzstan", currencyCode: "KGS" } },
    ]);
    client.seed("villages", [
      { id: "city_sa_riyadh", data: { naim: "الرياض", dolh: "countries/saudi_arabia", acctev: true } },
    ]);
    client.seed("mkan", [
      {
        id: "lm_sa_riyadh_1",
        data: {
          naim: "برج المملكة",
          Rev_dolh: "countries/saudi_arabia",
          id_vill: "villages/city_sa_riyadh",
          acctev: true,
        },
      },
    ]);
    const page1 = await client.query({
      collection: "countries",
      orderBy: [{ field: "name", direction: "asc" }],
      limit: 2,
    });
    expect(page1.docs).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await client.query({
      collection: "countries",
      orderBy: [{ field: "name", direction: "asc" }],
      limit: 2,
      startAfterCursor: page1.nextCursor,
    });
    expect(page2.docs.length).toBeGreaterThan(0);
    const villages = await client.query({
      collection: "villages",
      orderBy: [{ field: "naim", direction: "asc" }],
      limit: 10,
    });
    expect(villages.docs).toHaveLength(1);
    const landmarks = await client.query({
      collection: "mkan",
      orderBy: [{ field: "naim", direction: "asc" }],
      limit: 10,
    });
    expect(landmarks.docs).toHaveLength(1);
  });

  it("rejects INVALID_QUERY_LIMIT > 100", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("order", [{ id: "t1", data: { status: "completed" } }]);
    await expect(
      client.query({ collection: "order", limit: 101 }),
    ).rejects.toBeInstanceOf(InvalidQueryLimitError);
  });

  it("Fake IndexCapabilityChecker returns QUERY_NOT_SUPPORTED", () => {
    const checker = new FakeIndexCapabilityChecker(new Set(["countries::"]));
    expect(() =>
      checker.assertQuerySupported({
        collection: "mystery",
        filters: [{ field: "x", op: "==", value: 1 }],
        orderBy: [{ field: "y", direction: "asc" }],
      }),
    ).toThrow(QueryNotSupportedError);
  });
});

describe("Phase 4A-0 Production repositories (Fake client)", () => {
  it("lists trips with date window, scope intersect, and max page", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [
      {
        id: "t-sa",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/saudi_arabia",
          vill: "villages/city_sa_riyadh",
          agent_id: "ag1",
          data_order: "2026-09-10T00:00:00.000Z",
          PaymentMethod: "Cash",
          payment_status: "cash_collected",
          USER: "user/cust1",
          mndob_user: "user/drv1",
          total_app: 7.5,
          total_vat: 0,
          total_mndob: 42.5,
          total_mndob2: 50,
        },
      },
      {
        id: "t-kg",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/kyrgyzstan",
          vill: "villages/city_kg_bishkek",
          data_order: "2026-09-10T00:00:00.000Z",
        },
      },
      {
        id: "t-old",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/saudi_arabia",
          vill: "villages/city_sa_riyadh",
          data_order: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repos.trips.list(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      {},
      { limit: 50 },
    );
    expect(page.items.every((i) => i.data.countryId.value === "saudi_arabia")).toBe(true);
    expect(page.items.some((i) => i.data.id === "t-old")).toBe(false);
    expect(page.items[0]?.meta.sourceEnvironment).toBe("production");
    expect(page.items[0]?.meta.readMode).toBe("shadow");

    await expect(
      repos.trips.list(
        ctx({ scope: { type: "global" }, serverScopeFilter: {} }),
        {},
        { limit: 101 },
      ),
    ).rejects.toBeInstanceOf(InvalidQueryLimitError);
  });

  it("denies country_admin SA requesting KG → SCOPE_DENIED", async () => {
    const client = new FakeFirestoreReadClient();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
    });
    await expect(
      repos.trips.list(
        ctx({
          scope: { type: "country", countryIds: ["SA"] },
          serverScopeFilter: { countryIds: ["SA"] },
        }),
        { countryIds: ["KG"] },
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(ScopeDeniedError);
  });

  it("denies agent requesting another agent → SCOPE_DENIED", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "agent-1",
        data: {
          Isagent: true,
          isAdminRule: 2,
          actev_user: true,
          Rev_dloh_agent: { path: "countries/saudi_arabia", id: "saudi_arabia" },
          Agent_total: 10,
          display_name: "A1",
          created_time: "2026-09-01T10:00:00.000Z",
        },
      },
      {
        id: "agent-2",
        data: {
          Isagent: true,
          isAdminRule: 2,
          actev_user: true,
          Rev_dloh_agent: { path: "countries/saudi_arabia", id: "saudi_arabia" },
          Agent_total: 10,
          display_name: "A2",
          created_time: "2026-09-01T11:00:00.000Z",
        },
      },
    ]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
    });
    await expect(
      repos.agents.getById(
        ctx({
          scope: {
            type: "agent",
            countryIds: ["saudi_arabia"],
            agentIds: ["agent-1"],
          },
          serverScopeFilter: {
            countryIds: ["saudi_arabia"],
            agentIds: ["agent-1"],
          },
        }),
        "agent-2",
      ),
    ).rejects.toBeInstanceOf(ScopeDeniedError);
  });

  it("masks customer PII and traps FULL_PII when flag false", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "c1",
        data: {
          uid: "c1",
          actev_user: true,
          phone_number: "+966501234567",
          email: "full@example.com",
          display_name: "Cust",
          Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        },
      },
    ]);
    const obs = new InMemoryProductionReadObservability();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      fullPiiShadowEnabled: false,
      observability: obs,
    });
    const masked = await repos.customers.getSummaryById(
      ctx({
        scope: { type: "global" },
        permissions: ["customers:read", "customers:read_pii"],
      }),
      "c1",
    );
    expect(masked?.meta.piiRedacted).toBe(true);
    expect(String(masked?.data.phone.value)).not.toContain("501234567");
    expect(String(masked?.data.phone.value)).toMatch(/\*\*\*\d{4}/);

    await expect(
      repos.customers.getSummaryById(
        ctx({
          scope: { type: "global" },
          permissions: ["customers:read", "customers:read_pii"],
          allowFullPii: true,
        }),
        "c1",
      ),
    ).rejects.toBeInstanceOf(FullPiiShadowDisabledError);
  });

  it("maps unknown trip status and blocks financial fields", () => {
    const mapper = new DefaultLegacyTripMapper();
    const mapped = mapper.map({
      resource: "trip",
      sourceCollection: "order",
      sourceDocumentId: "t1",
      sourceSchemaVersion: "unknown",
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: {
        status_code: "weird_legacy_status",
        refundAmount: 50,
        chargebackAmount: 10,
        gatewayFee: 1,
        adjustmentAmount: 2,
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        data_order: "2026-09-10T00:00:00.000Z",
      },
    });
    expect(mapped.model.status.value).toBe("unmapped");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "unmapped_status"),
    ).toBe(true);
    expect(
      mapped.mappingWarnings.some((w) => w.code === "financial_field_blocked"),
    ).toBe(true);
  });

  it("AMBIGUOUS_CITY does not auto-pick", () => {
    const result = mapCityWithAliasGuard("city_dup", [
      {
        aliasId: "city_dup",
        canonicalCityId: "city_a",
        countryId: "SA",
        confidence: "high",
        evidence: "test",
      },
      {
        aliasId: "city_dup",
        canonicalCityId: "city_b",
        countryId: "SA",
        confidence: "high",
        evidence: "test",
      },
    ]);
    expect(result.ambiguous).toBe(true);
    expect(result.cityId).toBeNull();
    expect(result.warnings[0]?.code).toBe("AMBIGUOUS_CITY");
  });

  it("incomplete financial value stays null — incomplete ≠ zero", () => {
    const mapper = new DefaultLegacyTripMapper();
    const mapped = mapper.map({
      resource: "trip",
      sourceCollection: "order",
      sourceDocumentId: "t2",
      sourceSchemaVersion: "unknown",
      sourceVersion: null,
      fetchedAtUtc: new Date().toISOString(),
      raw: { status_code: "completed" },
    });
    expect(mapped.model.countryId.value).toBeNull();
    expect(mapped.model.incompleteReasons).toContain("countryId_missing");
    expect(mapped.model.countryId.provenance.availabilityStatus).toBe("missing");
    expect(mapped.model.financialSafeRead.totalApp.value).toBeNull();
    expect(mapped.model.financialSafeRead.totalAppKnowledge).toBe("missing");
  });
});

describe("Phase 4A-0 shadow container + traps", () => {
  it("has disabled writes and no mutation services", async () => {
    const c = createShadowReadContainer();
    assertShadowHasNoMutationServices(c);
    expect(c.fullPiiShadowEnabled).toBe(false);
    await expect(c.writes.create({ resource: "x", operation: "y" })).rejects.toBeInstanceOf(
      ProductionWriteDisabledError,
    );
    await expect(c.settlementCommands.approve()).rejects.toMatchObject({
      code: "PRODUCTION_WRITE_DISABLED",
    });
  });

  it("mutation/export/settlement traps", () => {
    expect(
      shadowTrapForRequest({
        method: "POST",
        path: "/api/agents/activate",
        productionReadMode: "shadow",
        allowSyntheticMutations: false,
      }),
    ).toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });

    expect(
      shadowTrapForRequest({
        method: "GET",
        path: "/api/reports/export",
        productionReadMode: "shadow",
        allowSyntheticMutations: false,
      }),
    ).toMatchObject({ code: "SHADOW_EXPORT_DISABLED" });

    expect(
      shadowTrapForRequest({
        method: "POST",
        path: "/api/settlements",
        productionReadMode: "shadow",
        allowSyntheticMutations: false,
      }),
    ).toMatchObject({ code: "SHADOW_SETTLEMENT_DISABLED" });
  });

  it("dynamic kill switch denies next request when flag false", async () => {
    const c = createShadowReadContainer({ productionReadEnabled: false });
    await expect(
      c.productionReads.geography.listCountries(
        ctx({ scope: { type: "global" } }),
        {},
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
  });
});

describe("Phase 4A-0 observability + circuit + comparison + credentials", () => {
  it("emits events without sensitive payloads", () => {
    const obs = new InMemoryProductionReadObservability();
    obs.emit({
      type: "production_read_request",
      resource: "trips",
      actorUidHash: "ab12",
    });
    obs.emit({ type: "pii_redacted", resource: "customers", fieldCount: 2 });
    obs.emit({ type: "circuit_breaker_open", resource: "trips" });
    obs.emit({ type: "kill_switch_triggered", flag: "PRODUCTION_READ_ENABLED" });
    const json = JSON.stringify(obs.list());
    expect(json).not.toMatch(/\+966|Bearer |private_key|@example\.com/);
  });

  it("circuit breaker opens → CIRCUIT_OPEN, no synthetic fallback", () => {
    const cb = new InMemoryProductionReadCircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60_000,
      ignoreAuthDenials: true,
    });
    cb.recordFailure("trips", "timeout");
    const d = cb.beforeRequest("trips");
    expect(d.allow).toBe(false);
    if (!d.allow) {
      expect(d.code).toBe("CIRCUIT_OPEN");
      expect(d.message).toBe(DEGRADED_PRODUCTION_MESSAGE);
    }
  });

  it("shadow comparison outcomes match|mismatch|warning|not_comparable", () => {
    const svc = new DefaultShadowComparisonService();
    expect(
      svc.compare(
        {
          label: "admin_next",
          counts: [{ resource: "trips", count: 1 }],
          money: [{ field: "grossFare", minorUnits: 100, currencyCode: "SAR" }],
          statuses: [],
        },
        {
          label: "legacy_fixture",
          counts: [{ resource: "trips", count: 1 }],
          money: [{ field: "grossFare", minorUnits: 100, currencyCode: "SAR" }],
          statuses: [],
        },
      ).outcome,
    ).toBe("match");

    expect(
      svc.compare(
        {
          label: "admin_next",
          counts: [{ resource: "trips", count: 1 }],
          money: [],
          statuses: [],
        },
        {
          label: "legacy_fixture",
          counts: [{ resource: "trips", count: 2 }],
          money: [],
          statuses: [],
        },
      ).outcome,
    ).toBe("mismatch");

    expect(
      svc.compare(
        {
          label: "admin_next",
          counts: [],
          money: [{ field: "grossFare", minorUnits: 100, currencyCode: "SAR" }],
          statuses: [],
        },
        {
          label: "legacy_fixture",
          counts: [],
          money: [{ field: "grossFare", minorUnits: 100, currencyCode: "AED" }],
          statuses: [],
        },
      ).outcome,
    ).toBe("not_comparable");

    expect(
      svc.compare(
        {
          label: "admin_next",
          counts: [{ resource: "trips", count: 1 }],
          money: [],
          statuses: [],
          warnings: ["soft"],
        },
        {
          label: "legacy_fixture",
          counts: [{ resource: "trips", count: 1 }],
          money: [],
          statuses: [],
        },
      ).outcome,
    ).toBe("warning");
  });

  it("credential errors never leak secrets; fingerprint match/mismatch", () => {
    expect(
      sanitizeCredentialMessage("failed private_key BEGIN PRIVATE KEY data"),
    ).toBe("Credential error (details redacted)");
    expect(() => assertExpectedFirebaseProject("a", "a")).not.toThrow();
    expect(() => assertExpectedFirebaseProject("a", "b")).toThrow(
      ProjectFingerprintMismatchError,
    );
  });

  it("retry policy skips auth/scope/kill_switch", () => {
    expect(shouldRetryProductionRead("timeout")).toBe(true);
    expect(shouldRetryProductionRead("auth_deny")).toBe(false);
    expect(shouldRetryProductionRead("scope_denied")).toBe(false);
    expect(shouldRetryProductionRead("kill_switch")).toBe(false);
  });

  it("shadow dashboard contract has no production data attached", () => {
    const d = emptyShadowDashboard();
    expect(d.productionDataAttached).toBe(false);
    expect(d.counts.tripCount).toBe(0);
  });
});

describe("Phase 4A-0 architecture boundary + write static scan", () => {
  it("forbids UI/application/domain firebase-admin imports", () => {
    expect(isForbiddenUiImport("firebase-admin")).toBe(true);
    expect(isForbiddenUiImport("@/infrastructure/production/firebase/x")).toBe(
      true,
    );
    expect(isForbiddenApplicationImport("firebase-admin")).toBe(true);
    expect(
      isForbiddenDomainImport("@/infrastructure/production/firebase/Foo"),
    ).toBe(true);
  });

  it("scans UI src for forbidden production firebase imports", () => {
    const uiRoots = [
      join(process.cwd(), "src/components"),
      join(process.cwd(), "src/features"),
      join(process.cwd(), "src/app"),
    ];
    const bad: string[] = [];
    function walk(dir: string) {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const e of entries) {
        const full = join(dir, e);
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(full)) {
          const text = readFileSync(full, "utf8");
          const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
            (m) => m[1]!,
          );
          for (const imp of imports) {
            if (isForbiddenUiImport(imp) && !full.includes("/api/")) {
              // API routes may import shadow helpers under infrastructure/http — UI pages must not
              if (
                full.includes("/components/") ||
                full.includes("/features/") ||
                (full.includes("/app/") && !full.includes("/api/"))
              ) {
                if (imp.includes("infrastructure/production")) {
                  bad.push(`${full} → ${imp}`);
                }
              }
            }
          }
        }
      }
    }
    for (const r of uiRoots) walk(r);
    expect(bad).toEqual([]);
  });

  it("production write static scan prefers zero write API usage", () => {
    const result = scanProductionWriteSurface();
    // Filter false positives: DisabledWriteRepository is allowlisted inside scanner;
    // also ignore `.create(` on Disabled* ports if any slipped — report remaining.
    const real = result.violations.filter(
      (v) =>
        !v.file.includes("DisabledWriteRepository") &&
        // Type-only / interface method signatures in Fake repos may mention create — check patterns
        !(v.pattern === ".create(" && v.file.includes("Disabled")),
    );
    // Prefer zero — if any remain, fail with detail
    if (real.length) {
      // Allow only comment-adjacent noise already skipped; fail otherwise
      expect(real).toEqual([]);
    }
    expect(result.credentialPathHits).toEqual([]);
  });

  it("does not export createProductionWriteContainer", async () => {
    const mod = await import(
      "@/infrastructure/production/container/createContainers"
    );
    assertNoProductionWriteContainerFactory(
      mod as unknown as Record<string, unknown>,
    );
  });
});
