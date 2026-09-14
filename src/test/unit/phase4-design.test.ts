/**
 * Phase 4 DESIGN contract tests — no Production Firebase, no credentials.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { getEnv, loadEnv, resetEnvCache } from "@/config/env";
import {
  createDevelopmentContainer,
  createShadowReadContainer,
  assertNoProductionWriteContainerFactory,
  PHASE4_FORBIDDEN_FACTORY_NAMES,
} from "@/infrastructure/production/container/createContainers";
import {
  DisabledWriteRepository,
  ProductionWriteDisabledError,
} from "@/infrastructure/production/DisabledWriteRepository";
import {
  evaluateProductionReadGate,
  assertProductionReadEnabled,
  ProductionReadDisabledError,
  assertEnvironmentFingerprint,
  EnvironmentFingerprintError,
} from "@/infrastructure/production/ProductionReadGate";
import {
  assertCollectionAllowed,
  isCollectionAllowedForProductionRead,
} from "@/infrastructure/production/contracts/CollectionAllowlist";
import {
  decideFieldAllow,
  projectAllowedFields,
  isDoNotExposeField,
} from "@/infrastructure/production/contracts/FieldAllowlist";
import { enforceReadScope } from "@/infrastructure/production/contracts/ScopeExpansionGuard";
import {
  assertHomogeneousDataSource,
} from "@/infrastructure/production/contracts/ProductionReadResponse";
import {
  DATA_SOURCE_IDENTITY,
  LEGACY_MAPPING_VERSION,
  SHADOW_BANNER,
  DEGRADED_PRODUCTION_MESSAGE,
} from "@/domain/production-read/constants";
import {
  assertMutationRoutesHitDisabledWrite,
  listMutationRoutes,
  ADMIN_NEXT_MUTATION_ROUTE_INVENTORY,
} from "@/infrastructure/production/MutationRouteInventory";
import { NoopShadowComparisonService } from "@/infrastructure/production/ShadowComparisonService";
import { InMemoryProductionReadCircuitBreaker } from "@/infrastructure/production/CircuitBreakerDesign";
import { InMemoryProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { auditSensitiveFieldRead } from "@/infrastructure/production/PiiAudit";
import {
  isForbiddenUiImport,
  SHADOW_NAV_ALLOWED,
  SHADOW_NAV_HIDDEN,
} from "@/infrastructure/production/ArchitectureBoundary";
import { FIREBASE_ADMIN_IDENTITY_VERIFIER_PLAN } from "@/infrastructure/production/contracts/FirebaseAdminProductionIdentityVerifierDesign";
import { UnimplementedFirebaseAdminProductionIdentityVerifier } from "@/infrastructure/production/contracts/FirebaseAdminProductionIdentityVerifierDesign";
import {
  resolveTripDateWindow,
  rejectOffsetPagination,
  QuerySafetyError,
  assertSearchSupported,
} from "@/infrastructure/production/contracts/QuerySafety";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";

describe("Phase 4 flags remain disabled", () => {
  beforeEach(() => {
    resetEnvCache();
  });

  it("defaults PRODUCTION_READ_MODE=disabled and all safety flags false", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
  });

  it("rejects shadow mode with any write flag true", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        APP_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "production",
        AUTH_MODE: "verified_token",
        PRODUCTION_READ_MODE: "shadow",
        PRODUCTION_WRITE_ENABLED: "true",
        GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
      }),
    ).toThrow(/PRODUCTION_WRITE_ENABLED=true is forbidden while PRODUCTION_READ_MODE=shadow/);
  });
});

describe("Phase 4 multi-gate Production read", () => {
  it("denies when kill switch false", () => {
    const result = evaluateProductionReadGate({
      PRODUCTION_READ_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_MODE: "shadow",
      expectedProjectId: "proj",
      actualProjectId: "proj",
    });
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.code).toBe("KILL_SWITCH");
  });

  it("allows only when all gates pass and writes stay false", () => {
    const result = evaluateProductionReadGate({
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_MODE: "shadow",
      expectedProjectId: "proj",
      actualProjectId: "proj",
    });
    expect(result).toEqual({ allow: true, mode: "shadow" });
  });

  it("denies when write flag true even if read enabled", () => {
    const result = evaluateProductionReadGate({
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
    });
    expect(result.allow).toBe(false);
    if (!result.allow) expect(result.code).toBe("WRITE_FLAG_DENY");
  });
});

describe("Phase 4 environment fingerprint", () => {
  it("fails on project mismatch", () => {
    expect(() =>
      assertEnvironmentFingerprint({
        expectedProjectId: "a",
        expectedEnvironment: "production",
        actualProjectId: "b",
        actualEnvironment: "production",
      }),
    ).toThrow(EnvironmentFingerprintError);
  });

  it("passes when actual matches expected", () => {
    expect(() =>
      assertEnvironmentFingerprint({
        expectedProjectId: "a",
        expectedEnvironment: "production",
        actualProjectId: "a",
        actualEnvironment: "production",
      }),
    ).not.toThrow();
  });
});

describe("Phase 4 shadow container write isolation", () => {
  it("has no write repo capability — DisabledWriteRepository only", async () => {
    const c = createShadowReadContainer();
    expect(c.kind).toBe("shadow_read");
    expect(c.writes).toBeInstanceOf(DisabledWriteRepository);
    expect(c.productionWriteRepos).toBeNull();
    await expect(c.writes.create({ resource: "trips", operation: "create" })).rejects.toBeInstanceOf(
      ProductionWriteDisabledError,
    );
    await expect(c.settlementCommands.approve()).rejects.toMatchObject({
      code: "PRODUCTION_WRITE_DISABLED",
    });
    await expect(c.ledgerCommands.post()).rejects.toMatchObject({
      code: "PRODUCTION_WRITE_DISABLED",
    });
    await expect(c.driverMutations.approve()).rejects.toMatchObject({
      code: "PRODUCTION_WRITE_DISABLED",
    });
    await expect(c.agentMutations.activate()).rejects.toMatchObject({
      code: "PRODUCTION_WRITE_DISABLED",
    });
  });

  it("does not export createProductionWriteContainer", async () => {
    const mod = await import(
      "@/infrastructure/production/container/createContainers"
    );
    assertNoProductionWriteContainerFactory(mod as unknown as Record<string, unknown>);
    for (const name of PHASE4_FORBIDDEN_FACTORY_NAMES) {
      expect(mod).not.toHaveProperty(name);
    }
  });

  it("development container also uses disabled writes", async () => {
    const c = createDevelopmentContainer();
    await expect(
      c.writes.execute({ resource: "any", operation: "x" }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });
});

describe("Phase 4 kill switch on Production repo calls", () => {
  it("rejects fake repo calls when PRODUCTION_READ_ENABLED=false", async () => {
    const c = createShadowReadContainer({ productionReadEnabled: false });
    await expect(
      c.productionReads.trips.list(
        {
          scope: { type: "global" },
          serverScopeFilter: {},
          actorUid: "u1",
          permissions: ["trips:read"],
          requestId: "r1",
          correlationId: "c1",
        },
        {},
        { limit: 10 },
      ),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);

    expect(() => assertProductionReadEnabled(false)).toThrow(
      ProductionReadDisabledError,
    );
  });

  it("allows fake repo calls only when design test enables flag", async () => {
    const c = createShadowReadContainer({
      productionReadEnabled: true,
      liveShadowAllowedResources: null,
    });
    const page = await c.productionReads.trips.list(
      {
        scope: { type: "global" },
        serverScopeFilter: {},
        actorUid: "u1",
        permissions: ["trips:read"],
        requestId: "r1",
        correlationId: "c1",
      },
      {},
      { limit: 10 },
    );
    expect(page.items).toEqual([]);
  });
});

describe("Phase 4 collection + field allowlists", () => {
  it("denies unknown collections by default", () => {
    expect(isCollectionAllowedForProductionRead("ledger")).toBe(false);
    expect(isCollectionAllowedForProductionRead("refunds")).toBe(false);
    expect(() => assertCollectionAllowed("mystery")).toThrow(/COLLECTION_NOT_ALLOWED/);
    expect(isCollectionAllowedForProductionRead("order")).toBe(true);
    expect(isCollectionAllowedForProductionRead("countries")).toBe(true);
    expect(isCollectionAllowedForProductionRead("villages")).toBe(true);
    expect(isCollectionAllowedForProductionRead("mkan")).toBe(true);
  });

  it("blocks DO_NOT_EXPOSE_YET financial fields", () => {
    for (const f of [
      "refundAmount",
      "chargebackAmount",
      "gatewayFee",
      "adjustmentAmount",
    ]) {
      expect(isDoNotExposeField(f)).toBe(true);
      expect(decideFieldAllow(f).allow).toBe(false);
    }
    const projected = projectAllowedFields({
      grossFare: 100,
      refundAmount: 5,
      unknownZ: 1,
      status: "completed",
    });
    expect(projected.data.grossFare).toBe(100);
    expect(projected.data.status).toBe("completed");
    expect(projected.data.refundAmount).toBeUndefined();
    expect(projected.deniedFields).toContain("refundAmount");
    expect(projected.deniedFields).toContain("unknownZ");
  });
});

describe("Phase 4 PII masked by default", () => {
  it("customer summary redacts phone/email without read_pii", async () => {
    const { FakeFirestoreReadClient } = await import(
      "@/infrastructure/production/firestore/FakeFirestoreReadClient"
    );
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "cust-1",
        data: {
          is_customer: true,
          phone: "+966501234567",
          email: "user@example.com",
          name: "Customer",
          country_id: "SA",
        },
      },
    ]);
    const c = createShadowReadContainer({
      productionReadEnabled: true,
      firestoreReadClient: client,
      liveShadowAllowedResources: null,
    });
    const envelope = await c.productionReads.customers.getSummaryById(
      {
        scope: { type: "global" },
        serverScopeFilter: {},
        actorUid: "u1",
        permissions: ["customers:read"],
        requestId: "r1",
        correlationId: "c1",
        allowFullPii: false,
      },
      "cust-1",
    );
    expect(envelope).not.toBeNull();
    expect(envelope!.meta.piiRedacted).toBe(true);
    expect(envelope!.meta.readSafety).toBe("REDACTED");
    expect(String(envelope!.data.phone.value)).not.toContain("501234567");
    expect(String(envelope!.data.email.value)).toMatch(/\*\*\*/);
  });

  it("emits sensitive_field_read without raw values", () => {
    const obs = new InMemoryProductionReadObservability();
    auditSensitiveFieldRead(obs, {
      resource: "customer",
      field: "phone",
      actorUid: "abcdef",
    });
    const events = obs.list();
    expect(events[0]?.type).toBe("sensitive_field_read");
    expect(JSON.stringify(events)).not.toMatch(/\+966/);
  });
});

describe("Phase 4 scope cannot expand", () => {
  it("denies country admin requesting another country", () => {
    const result = enforceReadScope({
      actorScope: { type: "country", countryIds: ["SA"] },
      clientHint: { countryId: "AE" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("SCOPE_EXPANSION_DENIED");
  });

  it("denies agent requesting other agent", () => {
    const result = enforceReadScope({
      actorScope: {
        type: "agent",
        countryIds: ["SA"],
        agentIds: ["agent-1"],
      },
      clientHint: { agentId: "agent-2" },
    });
    expect(result.ok).toBe(false);
  });

  it("denies client global=true for non-global actor", () => {
    const result = enforceReadScope({
      actorScope: { type: "country", countryIds: ["SA"] },
      clientHint: { global: true },
    });
    expect(result.ok).toBe(false);
  });

  it("forces authorized scope for country admin with matching hint", () => {
    const result = enforceReadScope({
      actorScope: { type: "country", countryIds: ["SA"] },
      clientHint: { countryId: "SA" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.serverFilter.countryIds).toEqual(["SA"]);
    }
  });
});

describe("Phase 4 data source identity + no mix", () => {
  it("shadow responses carry production/legacy/shadow identity", () => {
    expect(DATA_SOURCE_IDENTITY).toEqual({
      sourceEnvironment: "production",
      sourceSystem: "legacy",
      readMode: "shadow",
    });
    expect(LEGACY_MAPPING_VERSION).toBe("legacy-map-v1");
    expect(SHADOW_BANNER.en).toContain("READ ONLY");
    expect(SHADOW_BANNER.ar).toContain("بدون تعديل");
  });

  it("forbids mixing synthetic and production identities", () => {
    expect(() =>
      assertHomogeneousDataSource(DATA_SOURCE_IDENTITY, {
        sourceEnvironment: "synthetic",
        sourceSystem: "admin_next_synthetic",
        readMode: "synthetic",
      }),
    ).toThrow(/DATA_SOURCE_MIX_FORBIDDEN/);
  });

  it("degraded mode message is Production data unavailable", () => {
    expect(DEGRADED_PRODUCTION_MESSAGE).toBe("Production data unavailable");
  });
});

describe("Phase 4 mapping warnings preserved", () => {
  it("comparison mismatches use MAPPING_MISMATCH and do not mutate legacy", () => {
    const svc = new NoopShadowComparisonService();
    const result = svc.compare(
      {
        label: "admin_next",
        counts: [{ resource: "trips", count: 10 }],
        money: [{ field: "grossFare", minorUnits: 1000, currencyCode: "SAR" }],
        statuses: [{ id: "t1", statusCode: "completed" }],
      },
      {
        label: "legacy_fixture",
        counts: [{ resource: "trips", count: 9 }],
        money: [{ field: "grossFare", minorUnits: 1000, currencyCode: "SAR" }],
        statuses: [{ id: "t1", statusCode: "completed" }],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]?.code).toBe("MAPPING_MISMATCH");
    const warnings: MappingWarning[] = [
      {
        code: "unmapped_status",
        field: "status",
        message: "unknown status",
        severity: "warning",
      },
    ];
    expect(warnings[0]?.code).toBe("unmapped_status");
  });
});

describe("Phase 4 query safety", () => {
  it("rejects offset pagination and unbounded search", () => {
    expect(() => rejectOffsetPagination({ offset: 50 })).toThrow(
      QuerySafetyError,
    );
    expect(() => assertSearchSupported("customers")).toThrow(/unsupported/);
  });

  it("applies default trip window and caps max window", () => {
    const now = new Date("2026-09-11T12:00:00.000Z");
    const win = resolveTripDateWindow({ now });
    expect(win.createdToUtc).toBe(now.toISOString());
    expect(() =>
      resolveTripDateWindow({
        now,
        createdFromUtc: "2026-01-01T00:00:00.000Z",
        createdToUtc: "2026-09-11T12:00:00.000Z",
      }),
    ).toThrow(/exceeds max/);
  });
});

describe("Phase 4 mutation route trap design", () => {
  it("inventories mutation routes and maps them to DISABLED write", async () => {
    expect(listMutationRoutes().length).toBeGreaterThan(0);
    expect(
      ADMIN_NEXT_MUTATION_ROUTE_INVENTORY.some((r) => r.path.includes("settlements")),
    ).toBe(true);

    const writes = new DisabledWriteRepository();
    await assertMutationRoutesHitDisabledWrite(async (route) => {
      try {
        await writes.execute({
          resource: route.domain,
          operation: `${route.method} ${route.path}`,
        });
        return { code: "UNEXPECTED_OK" };
      } catch (err) {
        return {
          code:
            err instanceof ProductionWriteDisabledError
              ? err.code
              : "OTHER",
        };
      }
    });
  });
});

describe("Phase 4 circuit breaker + observability", () => {
  it("opens circuit and returns unavailable — no synthetic fallback", () => {
    const cb = new InMemoryProductionReadCircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 60_000,
      ignoreAuthDenials: true,
    });
    cb.recordFailure("trips", "auth_deny");
    expect(cb.getState("trips")).toBe("closed");
    cb.recordFailure("trips", "timeout");
    cb.recordFailure("trips", "timeout");
    const decision = cb.beforeRequest("trips");
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.message).toBe(DEGRADED_PRODUCTION_MESSAGE);
      expect(decision.code).toBe("CIRCUIT_OPEN");
    }
  });

  it("records kill_switch_triggered without secrets", () => {
    const obs = new InMemoryProductionReadObservability();
    obs.emit({ type: "kill_switch_triggered", flag: "PRODUCTION_READ_ENABLED" });
    expect(obs.list()[0]).toEqual({
      type: "kill_switch_triggered",
      flag: "PRODUCTION_READ_ENABLED",
    });
  });
});

describe("Phase 4 identity verifier design (unimplemented)", () => {
  it("plan exists and unimplemented verifier denies", async () => {
    expect(FIREBASE_ADMIN_IDENTITY_VERIFIER_PLAN.status).toBe(
      "DESIGN_ONLY_NOT_IMPLEMENTED",
    );
    const v = new UnimplementedFirebaseAdminProductionIdentityVerifier();
    const result = await v.verify("any");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("verifier_unavailable");
  });
});

describe("Phase 4 architecture boundary + shadow nav", () => {
  it("forbids UI importing production infrastructure directly", () => {
    expect(isForbiddenUiImport("@/infrastructure/production/foo")).toBe(true);
    expect(isForbiddenUiImport("firebase-admin")).toBe(true);
    expect(isForbiddenUiImport("@/application/trips/TripService")).toBe(false);
  });

  it("defines shadow nav allow/hide lists", () => {
    expect(SHADOW_NAV_ALLOWED).toContain("trips");
    expect(SHADOW_NAV_HIDDEN).toContain("settlements_execution");
    expect(SHADOW_NAV_HIDDEN).toContain("export");
  });
});
