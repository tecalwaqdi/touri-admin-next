/**
 * Phase 4A-6 — Agents Fake/unit readiness suite.
 * NO Production Firebase calls. FULL_PII_SHADOW_ENABLED=false. All write flags false.
 * AGENT_WRITE_ENABLED=false. No create/activate/disable/reassign/commission.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetEnvCache, getEnv } from "@/config/env";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  LiveResourceNotEnabledError,
  parseLiveShadowAllowedResources,
  PHASE_4A6_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { mapCanonicalAgentFromLegacyDoc } from "@/domain/agent/mapCanonicalAgentRead";
import {
  isAgentActiveAt,
  mapAgentOperationalActiveState,
} from "@/domain/agent/AgentActiveSemantics";
import {
  AGENT_FINANCIAL_FIELD_NOTES,
  summarizeAgentFinancialPresence,
} from "@/domain/agent/AgentFinancialFieldNotes";
import {
  auditAgentDuplicates,
  agentMappingReadyForLiveClose,
  buildActiveAgentCountryDiagnostics,
  hashAgentPhoneForAudit,
  isTestOrNoncanonicalAgent,
  reconcileAgentAuditPartition,
  rowFromCanonicalAgent,
} from "@/domain/agent/AgentDuplicateIdentityAudit";
import {
  agentLiveClosingGatesPass,
  agentLiveReportHasSensitiveLeak,
  excludedNonAgentHasAuthoritativeEvidence,
  formatAgentMappingNoGoMessage,
  selectAgentDiagnosticsForLiveSummary,
} from "@/domain/agent/AgentMappingDiagnostic";
import {
  classifyAgentMembership,
  classifyContaminatingIdentity,
} from "@/domain/agent/AgentRoleClassification";
import { isPhase4A6LiveAgentsEnabled } from "@/domain/agent/isPhase4A6LiveAgentsEnabled";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  FirebaseProductionAgentReadRepository,
  PHASE_4A6_AGENTS_MAX_PAGE,
  PHASE_4A6_AGENT_DISCRIMINATOR_FIELD,
  PHASE_4A6_AGENT_ORDER_FIELD,
} from "@/infrastructure/production/repositories/FirebaseProductionAgentReadRepository";
import {
  AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER,
  classifyAgentLiveQueryFailure,
} from "@/domain/agent/AgentLiveQueryFailure";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import { assertProductionWriteAllowed } from "@/config/safety";
import { isDocumentIdOrderField } from "@/infrastructure/production/firestore/FirestoreReadClient";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a6",
    permissions: ["agents:read"],
    requestId: "req-4a6",
    correlationId: "corr-4a6",
    ...overrides,
  };
}

const liveAgentsStartupBase = {
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
  LIVE_SHADOW_ALLOWED_RESOURCES: "agents",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const approvedSaAgent = {
  id: "agt_sa_001",
  data: {
    uid: "agt_sa_001",
    Isagent: true,
    isAdminRule: 2,
    actev_user: true,
    display_name: "Agent SA",
    Rev_dloh_agent: { path: "countries/saudi_arabia", id: "saudi_arabia" },
    dolh_agent: "Saudi Arabia",
    Agent_total: 10,
    app_commission_percent: 15,
    vat_percent: 15,
    phone_number: "+966501112233",
    email: "agent@example.com",
    agent_geo_center: { lat: 24.7, lng: 46.7 },
    agent_country_iso: "SA",
    agent_currency_code: "SAR",
    created_time: "2026-09-01T10:00:00.000Z",
  },
};

describe("Phase 4A-6 defaults + startup", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts agents-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveAgentsStartupBase),
    ).not.toThrow();
    expect(PHASE_4A6_LIVE_RESOURCES).toEqual(["agents"]);
  });

  it("startup rejects AGENT_WRITE_ENABLED=true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveAgentsStartupBase,
        AGENT_WRITE_ENABLED: true,
      }),
    ).toThrow(/AGENT_WRITE_ENABLED/);
  });

  it("startup rejects FULL_PII_SHADOW_ENABLED=true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveAgentsStartupBase,
        FULL_PII_SHADOW_ENABLED: true,
      }),
    ).toThrow(/FULL_PII_SHADOW/);
  });

  it("startup rejects drivers+agents multi-resource allowlist", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveAgentsStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "drivers,agents",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("isPhase4A6LiveAgentsEnabled only accepts exact 1", () => {
    expect(isPhase4A6LiveAgentsEnabled(undefined)).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("")).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("0")).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("true")).toBe(false);
    expect(isPhase4A6LiveAgentsEnabled("1")).toBe(true);
  });
});

describe("Phase 4A-6 authoritative source + discriminator", () => {
  it("collection allowlist includes shared user", () => {
    expect(isCollectionAllowedForProductionRead("user")).toBe(true);
  });

  it("primary discriminator is Isagent (not is_agent / ismndob)", () => {
    expect(PHASE_4A6_AGENT_DISCRIMINATOR_FIELD).toBe("Isagent");
    const c = classifyAgentMembership({ Isagent: true, Rev_dloh_agent: "x" });
    expect(c.isAgentCandidate).toBe(true);
    expect(c.discriminatorField).toBe("Isagent");
  });

  it("lowercase isagent alias is candidate with warning path", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "a1",
      data: {
        isagent: true,
        isAdminRule: 2,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
        Agent_total: 5,
        actev_user: true,
      },
    });
    expect(mapped.model.isAgentCandidate).toBe(true);
    expect(mapped.model.discriminatorField).toBe("isagent");
    expect(
      mapped.mappingWarnings.some((w) => w.code === "agent_discriminator_isagent"),
    ).toBe(true);
  });

  it("does not treat ismndob driver as agent", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "d1",
      data: {
        ismndob: true,
        Rev_dolh: { path: "countries/saudi_arabia" },
        actev_mndob: true,
      },
    });
    expect(mapped.model.mappingStatus).toBe("unknownDiscriminator");
    expect(mapped.model.isOperationalAgent).toBe(false);
  });
});

describe("Phase 4A-6 role contamination (shared user)", () => {
  it("SUPERADMIN with Isagent → excludedNonAgent not unmappedCountry", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "ZA8yOrIEYIZnmXx85ja9yyctIJu1",
      data: {
        Isagent: true,
        IsAdmin: true,
        isAdminRule: 1,
        // missing country on purpose — must NOT count as geography failure
      },
    });
    expect(mapped.model.mappingStatus).toBe("excludedNonAgent");
    expect(mapped.model.authoritativeRole).toBe("super_admin");
    expect(mapped.model.isOperationalAgent).toBe(false);
  });

  it("finance / partner / transport contamination excluded", () => {
    for (const [rule, role] of [
      [5, "finance"],
      [3, "partner"],
      [4, "transport"],
    ] as const) {
      const mapped = mapCanonicalAgentFromLegacyDoc({
        documentId: `contam_${role}`,
        data: {
          Isagent: true,
          isAdminRule: rule,
          Rev_dloh_agent: { path: "countries/saudi_arabia" },
          Agent_total: 10,
        },
      });
      expect(mapped.model.mappingStatus).toBe("excludedNonAgent");
      expect(mapped.model.authoritativeRole).toBe(role);
    }
  });

  it("isAdminRule=2 (country_admin panel) is NOT contamination for agents", () => {
    const c = classifyContaminatingIdentity({
      Isagent: true,
      isAdminRule: 2,
      Rev_dloh_agent: { path: "countries/saudi_arabia" },
    });
    expect(c.isContaminatingNonAgentIdentity).toBe(false);
    const m = classifyAgentMembership({
      Isagent: true,
      isAdminRule: 2,
      Rev_dloh_agent: { path: "countries/saudi_arabia" },
      Agent_total: 10,
    });
    expect(m.isOperationalAgent).toBe(true);
    expect(m.authoritativeRole).toBe("agent");
    expect(m.hasCountryAdminPanelRule).toBe(true);
  });

  it("Isagent alone without proven evidence → malformed not agent", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "weak_bool",
      data: { Isagent: true },
    });
    expect(mapped.model.mappingStatus).toBe("malformed");
    expect(mapped.model.isOperationalAgent).toBe(false);
  });
});

describe("Phase 4A-6 identity + country relation", () => {
  it("separates sourceDocumentId vs authUid mismatch", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "doc_a",
      data: {
        ...approvedSaAgent.data,
        uid: "other_uid",
      },
    });
    expect(mapped.model.sourceDocumentId).toBe("doc_a");
    expect(mapped.model.authUid).toBe("other_uid");
    expect(mapped.model.authUidKnowledge).toBe("mismatch");
  });

  it("maps Rev_dloh_agent with path preserved; never invents from name/GPS/phone", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_sa_001",
      data: approvedSaAgent.data,
    });
    expect(mapped.model.countryId.value).toBe("saudi_arabia");
    expect(mapped.model.countrySourcePath).toBe("countries/saudi_arabia");
    expect(mapped.model.mappingStatus).toBe("validMapped");

    const missing = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_no_ref",
      data: {
        Isagent: true,
        isAdminRule: 2,
        Agent_total: 10,
        dolh_agent: "Saudi Arabia",
        agent_geo_center: { lat: 1, lng: 2 },
        phone_number: "+966500000000",
        agent_currency_code: "SAR",
        actev_user: true,
      },
    });
    expect(missing.model.mappingStatus).toBe("unmappedCountry");
    expect(missing.model.countryId.value).toBeNull();
    expect(
      missing.mappingWarnings.some((w) => w.code === "geo_not_inferred_from_non_ref"),
    ).toBe(true);
  });

  it("reuses Phase 4A-1 country canonicalization (demo_saudi alias)", () => {
    expect(resolveCanonicalCountryId("demo_saudi").status).toBe("mapped");
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_demo",
      data: {
        Isagent: true,
        isAdminRule: 2,
        Agent_total: 8,
        actev_user: true,
        Rev_dloh_agent: { path: "countries/demo_saudi", id: "demo_saudi" },
      },
    });
    expect(mapped.model.countryId.value).toBe("saudi_arabia");
  });

  it("assignmentLockDocId derived from country doc id without N+1 fetch", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_sa_001",
      data: approvedSaAgent.data,
    });
    expect(mapped.model.assignmentLockDocId.value).toBe("saudi_arabia");
  });
});

describe("Phase 4A-6 operational vs account vs Auth", () => {
  it("actev_user=false → inactive even with Isagent", () => {
    expect(
      isAgentActiveAt({
        Isagent: true,
        actev_user: false,
      }),
    ).toBe(false);
    const s = mapAgentOperationalActiveState({
      Isagent: true,
      actev_user: false,
    });
    expect(s.accountState).toBe("disabled");
    expect(s.isActive).toBe(false);
    expect(s.authEnabledKnowledge).toBe("not_queried");
  });

  it("Auth enabled knowledge is never invented", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_sa_001",
      data: approvedSaAgent.data,
    });
    expect(mapped.model.authEnabledKnowledge).toBe("not_queried");
    expect(mapped.model.isOperationallyActive).toBe(true);
    expect(mapped.model.accountState).toBe("enabled");
  });

  it("date window future / expired classified", () => {
    const future = mapAgentOperationalActiveState(
      {
        Isagent: true,
        actev_user: true,
        agent_date_reg: "2099-01-01T00:00:00.000Z",
      },
      new Date("2026-09-12T00:00:00.000Z"),
    );
    expect(future.operationalActive).toBe("window_future");
    expect(future.isActive).toBe(false);

    const expired = mapAgentOperationalActiveState(
      {
        Isagent: true,
        actev_user: true,
        agent_date_end: "2020-01-01T00:00:00.000Z",
      },
      new Date("2026-09-12T00:00:00.000Z"),
    );
    expect(expired.operationalActive).toBe("window_expired");
  });
});

describe("Phase 4A-6 ONE COUNTRY = ONE ACTIVE AGENT diagnostics", () => {
  it("reports countriesWithMultipleActiveAgents without auto-merge", () => {
    const rows = [
      rowFromCanonicalAgent(
        mapCanonicalAgentFromLegacyDoc({
          documentId: "a1",
          data: {
            ...approvedSaAgent.data,
            uid: "a1",
          },
        }).model,
      ),
      rowFromCanonicalAgent(
        mapCanonicalAgentFromLegacyDoc({
          documentId: "a2",
          data: {
            ...approvedSaAgent.data,
            uid: "a2",
            display_name: "Agent SA 2",
          },
        }).model,
      ),
    ];
    const diag = buildActiveAgentCountryDiagnostics(rows, [
      "saudi_arabia",
      "kyrgyzstan",
    ]);
    expect(diag.activeAgentsPerCountry.saudi_arabia).toBe(2);
    expect(diag.countriesWithMultipleActiveAgents).toContain("saudi_arabia");
    expect(diag.countriesWithNoAgent).toContain("kyrgyzstan");
    expect(diag.countriesWithOneActiveAgent).not.toContain("saudi_arabia");
  });

  it("closing gate fails when countriesWithMultipleActiveAgents > 0", () => {
    expect(
      agentLiveClosingGatesPass({
        unmappedCountry: 0,
        unknownDiscriminator: 0,
        malformed: 0,
        activeOperationalDuplicates: 0,
        exactDocumentIdDuplicates: 0,
        unexpectedCollections: 0,
        productionWrites: 0,
        excludedNonAgent: 0,
        excludedNonAgentWithoutEvidence: 0,
        countriesWithMultipleActiveAgents: 1,
      }),
    ).toBe(false);
  });

  it("domain policy rejects second active agent for country", () => {
    const decision = agentAssignmentPolicy.canActivateAgent({
      countryId: "saudi_arabia",
      agentId: "new",
      agentStatus: "inactive",
      existingAgents: [
        {
          id: "old",
          name: "Old",
          countryId: "saudi_arabia",
          status: "active",
          commissionPlaceholder: "10%",
          driversCount: 0,
          tripsCount: 0,
          activeFromUtc: null,
          activeToUtc: null,
          createdAtUtc: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("COUNTRY_ALREADY_HAS_ACTIVE_AGENT");
    }
  });
});

describe("Phase 4A-6 financial DOCUMENT_ONLY + PII", () => {
  it("financial rates are DOCUMENT_ONLY and never settlement-safe", () => {
    expect(
      AGENT_FINANCIAL_FIELD_NOTES.every((n) => n.exposure === "DOCUMENT_ONLY"),
    ).toBe(true);
    const fin = summarizeAgentFinancialPresence(approvedSaAgent.data);
    expect(fin.isSettlementSafe).toBe(false);
    expect(fin.isAccountingApproved).toBe(false);
    expect(fin.isAuthoritative).toBe(false);
    expect(fin.fieldsPresent).toContain("Agent_total");
  });

  it("PII blocked on envelope; sensitive registry covers agent", () => {
    expect(
      SENSITIVE_FIELD_REGISTRY.some(
        (r) => r.resource === "agent" && r.field === "phone_number",
      ),
    ).toBe(true);
    const client = new FakeFirestoreReadClient();
    client.seed("user", [approvedSaAgent]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    return repo.list(ctx(), {}, { limit: 10 }).then((page) => {
      const env = page.items[0]!;
      expect(env.meta.piiRedacted).toBe(true);
      expect(env.meta.blockedFields).toContain("phone_number");
      expect(env.meta.blockedFields).toContain("email");
      expect(env.meta.blockedFields).toContain("agent_geo_center");
      const serialized = JSON.stringify(env.data);
      expect(serialized).not.toMatch(/\+966501112233/);
      expect(agentLiveReportHasSensitiveLeak(serialized)).toBe(false);
    });
  });

  it("phone hash for audit never stores raw phone", () => {
    const h = hashAgentPhoneForAudit("+966501112233");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).not.toContain("966");
  });
});

describe("Phase 4A-6 query bounds + resource token + write safety", () => {
  it("resource token agents; page limit ≤50; cursor no offset", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [approvedSaAgent]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    expect(repo.resource).toBe("agents");
    expect(PHASE_4A6_AGENTS_MAX_PAGE).toBe(50);
    await expect(repo.list(ctx(), {}, { limit: 51 })).rejects.toBeInstanceOf(
      QuerySafetyError,
    );
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.queryMeta.discriminatorField).toBe("Isagent");
    expect(page.queryMeta.queryLimit).toBeLessThanOrEqual(50);
    expect(client.queryLog[0]?.startAfterCursor == null).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(client.queryLog[0] ?? {}, "offset"),
    ).toBe(false);
  });

  it("index-free query shape: Isagent + orderBy __name__ asc — no created_time", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [approvedSaAgent]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    const page = await repo.list(ctx(), {}, { limit: 20 });
    const q = client.queryLog[0]!;
    expect(q.collection).toBe("user");
    expect(q.filters).toEqual([
      { field: "Isagent", op: "==", value: true },
    ]);
    expect(q.orderBy).toEqual([{ field: "__name__", direction: "asc" }]);
    expect(q.orderBy?.some((o) => o.field === "created_time")).toBe(false);
    expect(PHASE_4A6_AGENT_ORDER_FIELD).toBe("__name__");
    expect(isDocumentIdOrderField(page.queryMeta.queryTimestampField)).toBe(
      true,
    );
    expect(page.queryMeta.queryOrderDirection).toBe("asc");
    expect(page.queryMeta.discriminatorField).toBe(
      PHASE_4A6_AGENT_DISCRIMINATOR_FIELD,
    );
  });

  it("documentId cursor: lastDocumentId → startAfter; page ≤50; no offset", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "agt_a",
        data: { ...approvedSaAgent.data, uid: "agt_a" },
      },
      {
        id: "agt_b",
        data: { ...approvedSaAgent.data, uid: "agt_b" },
      },
      {
        id: "agt_c",
        data: { ...approvedSaAgent.data, uid: "agt_c" },
      },
    ]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    const page1 = await repo.list(ctx(), {}, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe("agt_b");
    expect(page1.truncated).toBe(true);

    const page2 = await repo.list(
      ctx(),
      {},
      { limit: 2, cursor: page1.nextCursor },
    );
    expect(client.queryLog[1]?.startAfterCursor).toBe("agt_b");
    expect(
      Object.prototype.hasOwnProperty.call(client.queryLog[1] ?? {}, "offset"),
    ).toBe(false);
    expect(page2.items.map((e) => e.data.sourceDocumentId)).toEqual(["agt_c"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("Agents missing created_time remain eligible (not excluded by orderBy)", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      {
        id: "agt_no_created_time",
        data: {
          uid: "agt_no_created_time",
          Isagent: true,
          isAdminRule: 2,
          actev_user: true,
          Rev_dloh_agent: {
            path: "countries/saudi_arabia",
            id: "saudi_arabia",
          },
          Agent_total: 10,
          // intentionally no created_time
        },
      },
      {
        id: "agt_with_created_time",
        data: {
          ...approvedSaAgent.data,
          uid: "agt_with_created_time",
          created_time: "2026-09-01T10:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    const ids = page.items.map((e) => e.data.sourceDocumentId).sort();
    expect(ids).toEqual(["agt_no_created_time", "agt_with_created_time"]);
    expect(
      page.items.find((e) => e.data.sourceDocumentId === "agt_no_created_time")
        ?.data.mappingStatus,
    ).toBe("validMapped");
  });

  it("single Production query on Isagent — lowercase-only alias is mapper/getById path, not second list query", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaAgent,
      {
        id: "agt_lower_only",
        data: {
          uid: "agt_lower_only",
          isagent: true, // lowercase only — writers normally persist Isagent
          isAdminRule: 2,
          actev_user: true,
          Rev_dloh_agent: {
            path: "countries/saudi_arabia",
            id: "saudi_arabia",
          },
          Agent_total: 8,
        },
      },
    ]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(client.queryLog).toHaveLength(1);
    expect(client.queryLog[0]?.filters?.[0]?.field).toBe("Isagent");
    // Primary list misses lowercase-only; getById still accepts alias.
    expect(
      page.items.some((e) => e.data.sourceDocumentId === "agt_lower_only"),
    ).toBe(false);
    const byId = await repo.getById(ctx(), "agt_lower_only");
    expect(byId).not.toBeNull();
    expect(byId!.data.discriminatorField).toBe("isagent");
  });

  it("classifyAgentLiveQueryFailure: index FAILED_PRECONDITION vs generic query failure", () => {
    const indexErr = Object.assign(
      new Error(
        "9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/...",
      ),
      { code: 9 },
    );
    const classified = classifyAgentLiveQueryFailure(indexErr);
    expect(classified.blocker).toBe(AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER);
    expect(classified.productionReadCompleted).toBe(false);
    expect(classified.mappingExecuted).toBe(false);
    expect(classified.safeReason).not.toMatch(/console\.firebase/);

    const other = classifyAgentLiveQueryFailure(new Error("PERMISSION_DENIED"));
    expect(other.blocker).toBe("query_failure");
    expect(other.productionReadCompleted).toBe(false);
    expect(other.mappingExecuted).toBe(false);
  });

  it("live shadow denies agents when allowlist is drivers", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("drivers"),
    });
    await expect(repo.list(ctx(), {}, { limit: 10 })).rejects.toBeInstanceOf(
      LiveResourceNotEnabledError,
    );
  });

  it("kill switch blocks when Production Read disabled", async () => {
    const client = new FakeFirestoreReadClient();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: false,
    });
    await expect(repos.agents.list(ctx(), {}, { limit: 10 })).rejects.toBeInstanceOf(
      ProductionReadDisabledError,
    );
  });

  it("AGENT_WRITE_ENABLED false blocks agent domain writes", () => {
    expect(() => assertProductionWriteAllowed("agent")).toThrow();
  });

  it("shadow trap blocks activate path", () => {
    const trap = shadowTrapForRequest({
      path: "/api/agents/activate",
      method: "POST",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
  });
});

describe("Phase 4A-6 audit partition + closing gates", () => {
  it("partition reconciles and excludedNonAgent has evidence", () => {
    const models = [
      mapCanonicalAgentFromLegacyDoc({
        documentId: "agt_sa_001",
        data: approvedSaAgent.data,
      }).model,
      mapCanonicalAgentFromLegacyDoc({
        documentId: "super_contam",
        data: {
          Isagent: true,
          IsAdmin: true,
          isAdminRule: 1,
        },
      }).model,
      mapCanonicalAgentFromLegacyDoc({
        documentId: "test_agent_x",
        data: {
          Isagent: true,
          isAdminRule: 2,
          Agent_total: 1,
          Rev_dloh_agent: { path: "countries/saudi_arabia" },
          actev_user: true,
          functional_test: true,
        },
      }).model,
    ];
    const rows = models.map((m) => rowFromCanonicalAgent(m));
    const metrics = auditAgentDuplicates(rows, {
      knownCountryIds: ["saudi_arabia"],
    });
    const part = reconcileAgentAuditPartition(metrics);
    expect(part.ok).toBe(true);
    expect(metrics.validMapped).toBe(1);
    expect(metrics.excludedNonAgent).toBe(1);
    expect(metrics.testOrNoncanonical).toBe(1);
    expect(metrics.countriesWithOneActiveAgent).toContain("saudi_arabia");
    expect(metrics.countriesWithMultipleActiveAgents).toHaveLength(0);

    const diags = selectAgentDiagnosticsForLiveSummary(models);
    const excl = diags.find((d) => d.mappingStatus === "excludedNonAgent")!;
    expect(excludedNonAgentHasAuthoritativeEvidence(excl)).toBe(true);

    expect(
      agentMappingReadyForLiveClose(metrics, {
        excludedNonAgentWithoutEvidence: 0,
      }),
    ).toBe(true);
  });

  it("testOrNoncanonical requires evidence markers", () => {
    expect(
      isTestOrNoncanonicalAgent({
        documentId: "normal",
        data: { Isagent: true },
      }),
    ).toBe(false);
    expect(
      isTestOrNoncanonicalAgent({
        documentId: "cp5_agent",
        data: { Isagent: true },
      }),
    ).toBe(true);
  });

  it("formatAgentMappingNoGoMessage is PII-safe", () => {
    const mapped = mapCanonicalAgentFromLegacyDoc({
      documentId: "bad",
      data: {
        Isagent: true,
        isAdminRule: 2,
        Agent_total: 1,
        phone_number: "+966501112233",
      },
    });
    const msg = formatAgentMappingNoGoMessage([
      {
        sourceDocumentId: mapped.model.sourceDocumentId,
        agentCandidate: true,
        authoritativeRole: "agent",
        roleEvidenceKind: "firestore_Agent_total",
        sourceCountryReferencePath: null,
        sourceCountryReferenceId: null,
        isOperationallyActive: false,
        operationalActiveState: "inactive",
        mappingStatus: "unmappedCountry",
        testClassification: "operational",
        countryMapping: "missing",
      },
    ]);
    expect(msg).toContain("NO-GO");
    expect(msg).not.toContain("+966");
  });
});

describe("Phase 4A-6 RBAC scope", () => {
  it("country scope filters post-map Rev_dloh_agent", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaAgent,
      {
        id: "agt_kg_001",
        data: {
          uid: "agt_kg_001",
          Isagent: true,
          isAdminRule: 2,
          actev_user: true,
          Rev_dloh_agent: { path: "countries/kyrgyzstan", id: "kyrgyzstan" },
          Agent_total: 7,
          created_time: "2026-09-02T10:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionAgentReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    const page = await repo.list(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      { countryIds: ["saudi_arabia"] },
      { limit: 20 },
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.data.countryId.value).toBe("saudi_arabia");
  });

  it("agent self-scope cannot read another agent", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      approvedSaAgent,
      {
        id: "agt_sa_002",
        data: {
          ...approvedSaAgent.data,
          uid: "agt_sa_002",
          display_name: "Other",
        },
      },
    ]);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("agents"),
    });
    await expect(
      repos.agents.getById(
        ctx({
          scope: {
            type: "agent",
            countryIds: ["saudi_arabia"],
            agentIds: ["agt_sa_001"],
          },
          serverScopeFilter: {
            countryIds: ["saudi_arabia"],
            agentIds: ["agt_sa_001"],
          },
        }),
        "agt_sa_002",
      ),
    ).rejects.toThrow(/another agent|other agent|SCOPE/i);
  });
});
