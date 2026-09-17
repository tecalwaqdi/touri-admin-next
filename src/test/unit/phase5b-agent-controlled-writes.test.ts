/**
 * Phase 5B — Agent Controlled Writes exhaustive Fake matrix.
 * Production calls = 0. Production writes = 0.
 * Customer / Finance writes NOT started. Driver 5A unchanged.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  createActivateAgentCommand,
  createDeactivateAgentCommand,
  createSuspendAgentCommand,
  executeAgentControlledWrite,
  FakeAgentWriteRepository,
  DisabledAgentWriteRepository,
  EmulatorAgentWriteRepository,
  ProductionAgentWriteRepository,
  createProductionRuntimeAgentWriteRepository,
  InMemoryAgentWriteIdempotencyStore,
  InMemoryAgentWriteAuditPort,
  PROVEN_AGENT_STATE_TRANSITIONS,
  isProvenAgentTransition,
  resolveAgentTransition,
  allowedFromStatesForAgentAction,
  actorMayWriteAgents,
  AGENT_WRITE_ERROR_CODES,
  AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE,
  type AgentWriteSnapshot,
  type AgentWriteFlagGate,
  type VerifiedAgentWriteActor,
  type AgentControlledWriteServiceDeps,
} from "@/application/controlled-writes/agents";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import {
  AGENT_WRITE_ENABLED_RUNTIME,
  CUSTOMER_WRITE_IMPLEMENTED,
  FINANCE_WRITE_IMPLEMENTED,
} from "./phase5b-agent-controlled-writes.test.helpers";

const FLAGS_FALSE: AgentWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
};

const superAdmin: VerifiedAgentWriteActor = {
  uid: "actor_sa",
  role: "super_admin",
  permissions: [
    "agents:manage",
    "agents:read",
    "drivers:read",
    "customers:read",
  ],
  scope: { type: "global" },
};

const opsManager: VerifiedAgentWriteActor = {
  uid: "actor_ops",
  role: "operations_manager",
  permissions: ["agents:manage", "agents:read"],
  scope: { type: "global" },
};

const countryAdminSa: VerifiedAgentWriteActor = {
  uid: "actor_ca",
  role: "country_admin",
  permissions: ["agents:manage", "agents:read"],
  scope: { type: "country", countryIds: ["SA"] },
};

const auditor: VerifiedAgentWriteActor = {
  uid: "actor_aud",
  role: "auditor",
  permissions: ["audit:read", "agents:read"],
  scope: { type: "global" },
};

const supportAgent: VerifiedAgentWriteActor = {
  uid: "actor_sup",
  role: "support_agent",
  permissions: ["agents:read", "trips:read"],
  scope: { type: "global" },
};

const agentUser: VerifiedAgentWriteActor = {
  uid: "actor_agt",
  role: "agent_user",
  permissions: ["agents:read", "drivers:read"],
  scope: { type: "agent", agentIds: ["AGT_SELF"] },
};

function baseSnapshot(
  partial: Partial<AgentWriteSnapshot> & Pick<AgentWriteSnapshot, "agentId">,
): AgentWriteSnapshot {
  return {
    exists: true,
    isOperationalAgent: true,
    excludedNonAgent: false,
    operationalState: "inactive",
    accountEnabled: "enabled",
    countryId: "SA",
    countryScopeKind: "mapped",
    preconditionToken: "tok_1",
    updateGeneration: "g1",
    ...partial,
  };
}

function makeDeps(opts?: {
  repo?: FakeAgentWriteRepository;
  allowOffline?: boolean;
  flags?: AgentWriteFlagGate;
  audit?: InMemoryAgentWriteAuditPort;
  idempotency?: InMemoryAgentWriteIdempotencyStore;
}): {
  deps: AgentControlledWriteServiceDeps;
  repo: FakeAgentWriteRepository;
  audit: InMemoryAgentWriteAuditPort;
  idempotency: InMemoryAgentWriteIdempotencyStore;
} {
  const repo = opts?.repo ?? new FakeAgentWriteRepository();
  const audit = opts?.audit ?? new InMemoryAgentWriteAuditPort();
  const idempotency =
    opts?.idempotency ?? new InMemoryAgentWriteIdempotencyStore();
  const deps: AgentControlledWriteServiceDeps = {
    flags: opts?.flags ?? FLAGS_FALSE,
    repository: repo,
    audit,
    idempotency,
    allowOfflineExecution: opts?.allowOffline ?? true,
    loadPort: {
      loadForWrite: async (id) => repo.get(id) ?? null,
      findActiveAgentIdForCountry: async (countryId) =>
        repo.findActiveAgentIdForCountry(countryId),
    },
  };
  return { deps, repo, audit, idempotency };
}

describe("Phase 5B — state transition matrix", () => {
  it("encodes only proven transitions", () => {
    expect(PROVEN_AGENT_STATE_TRANSITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "inactive",
          to: "active",
          action: "activate",
        }),
        expect.objectContaining({
          from: "pending",
          to: "active",
          action: "activate",
        }),
        expect.objectContaining({
          from: "suspended",
          to: "active",
          action: "activate",
        }),
        expect.objectContaining({
          from: "active",
          to: "inactive",
          action: "deactivate",
        }),
        expect.objectContaining({
          from: "active",
          to: "suspended",
          action: "suspend",
        }),
      ]),
    );
    expect(PROVEN_AGENT_STATE_TRANSITIONS).toHaveLength(5);
  });

  it("rejects unproven transitions with INVALID_AGENT_STATE_TRANSITION", () => {
    expect(resolveAgentTransition("activate", "active").ok).toBe(false);
    expect(resolveAgentTransition("activate", "unknown").ok).toBe(false);
    expect(resolveAgentTransition("deactivate", "inactive").ok).toBe(false);
    expect(resolveAgentTransition("deactivate", "suspended").ok).toBe(false);
    expect(resolveAgentTransition("suspend", "inactive").ok).toBe(false);
    expect(resolveAgentTransition("suspend", "pending").ok).toBe(false);
    expect(isProvenAgentTransition("inactive", "suspended", "suspend")).toBe(
      false,
    );
    expect(allowedFromStatesForAgentAction("activate")).toEqual([
      "inactive",
      "pending",
      "suspended",
    ]);
  });
});

describe("Phase 5B — Production gate & write trap", () => {
  it("env-gates Production agent writes; default AGENT_WRITE_ENABLED false", () => {
    expect(AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
    expect(AGENT_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(FLAGS_FALSE.AGENT_WRITE_ENABLED).toBe(false);
    expect(ProductionAgentWriteRepository.isReachable(FLAGS_FALSE)).toBe(
      false,
    );
    expect(
      ProductionAgentWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        AGENT_WRITE_ENABLED: true,
      }),
    ).toBe(true);
  });

  it("Production path → PRODUCTION_WRITE_DISABLED without mutation", async () => {
    const repo = new FakeAgentWriteRepository();
    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    const { deps } = makeDeps({ repo, allowOffline: false });
    deps.repository = createProductionRuntimeAgentWriteRepository(FLAGS_FALSE);

    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_prod_gate_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("PRODUCTION_WRITE_DISABLED");
    }
    expect(outcome.productionWriteExecuted).toBe(false);
    expect(repo.applied).toHaveLength(0);
  });

  it("DisabledAgentWriteRepository always throws PRODUCTION_WRITE_DISABLED", async () => {
    const disabled = new DisabledAgentWriteRepository();
    await expect(
      disabled.apply({
        command: createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_dis_001",
          correlationId: "corr_5b",
        }),
        snapshot: baseSnapshot({ agentId: "AGT1" }),
        fromState: "inactive",
        toState: "active",
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });

  it("ProductionAgentWriteRepository requires write port when flags armed", async () => {
    const prod = new ProductionAgentWriteRepository({
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: true,
      AGENT_WRITE_ENABLED: true,
    });
    await expect(
      prod.apply({
        command: createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_unreach_001",
          correlationId: "corr_5b",
        }),
        snapshot: baseSnapshot({ agentId: "AGT1" }),
        fromState: "inactive",
        toState: "active",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_WRITE_FAILURE" });
  });

  it("Finance writes remain not started; Customer writes deferred to 5C Production flags", () => {
    // CUSTOMER_WRITE_IMPLEMENTED may be true after Phase 5C offline implementation;
    // Production CUSTOMER_WRITE_ENABLED must stay false (asserted in 5C suite).
    expect(FINANCE_WRITE_IMPLEMENTED).toBe(false);
    void CUSTOMER_WRITE_IMPLEMENTED;
  });
});

describe("Phase 5B — command happy paths (Fake)", () => {
  let repo: FakeAgentWriteRepository;
  let deps: AgentControlledWriteServiceDeps;
  let audit: InMemoryAgentWriteAuditPort;

  beforeEach(() => {
    const built = makeDeps();
    repo = built.repo;
    deps = built.deps;
    audit = built.audit;
  });

  it("ActivateAgentCommand: inactive → active", async () => {
    repo.seed(baseSnapshot({ agentId: "AGT_IN" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_IN",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_act_inactive_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.status).toBe("applied");
      expect(outcome.fromState).toBe("inactive");
      expect(outcome.toState).toBe("active");
      expect(outcome.countryId).toBe("SA");
    }
    expect(repo.get("AGT_IN")?.operationalState).toBe("active");
    expect(audit.intents).toHaveLength(1);
    expect(audit.results).toHaveLength(1);
    expect(outcome.productionWriteExecuted).toBe(false);
  });

  it("ActivateAgentCommand: pending → active", async () => {
    repo.seed(
      baseSnapshot({ agentId: "AGT_PE", operationalState: "pending" }),
    );
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: opsManager,
        agentId: "AGT_PE",
        countryId: "SA",
        expectedCurrentState: "pending",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_act_pending_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.toState).toBe("active");
  });

  it("ActivateAgentCommand: suspended → active", async () => {
    repo.seed(
      baseSnapshot({
        agentId: "AGT_SU_ACT",
        operationalState: "suspended",
        accountEnabled: "disabled",
      }),
    );
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_SU_ACT",
        countryId: "SA",
        expectedCurrentState: "suspended",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_act_sus_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fromState).toBe("suspended");
      expect(outcome.toState).toBe("active");
    }
    expect(repo.get("AGT_SU_ACT")?.accountEnabled).toBe("enabled");
  });

  it("DeactivateAgentCommand: active → inactive (no transfer)", async () => {
    repo.seed(
      baseSnapshot({ agentId: "AGT_DE", operationalState: "active" }),
    );
    const outcome = await executeAgentControlledWrite(
      createDeactivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_DE",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_deact_001",
        correlationId: "corr_5b",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.toState).toBe("inactive");
    expect(repo.findActiveAgentIdForCountry("SA")).toBeNull();
  });

  it("SuspendAgentCommand: active → suspended with reason", async () => {
    repo.seed(
      baseSnapshot({ agentId: "AGT_SU", operationalState: "active" }),
    );
    const outcome = await executeAgentControlledWrite(
      createSuspendAgentCommand({
        actor: superAdmin,
        agentId: "AGT_SU",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_suspend_001",
        correlationId: "corr_5b",
        reasonCode: "policy_violation",
        note: "operational policy breach",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.toState).toBe("suspended");
    expect(repo.get("AGT_SU")?.accountEnabled).toBe("disabled");
    expect(audit.intents[0]!.reasonCode).toBe("policy_violation");
  });
});

describe("Phase 5B — one-country-one-active Agent", () => {
  it("activate when another active exists → ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT_EXISTING", operationalState: "active" }),
    );
    repo.seed(baseSnapshot({ agentId: "AGT_NEW", operationalState: "inactive" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_NEW",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_uniq_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY");
    }
    expect(repo.applied).toHaveLength(0);
    expect(repo.get("AGT_EXISTING")?.operationalState).toBe("active");
    expect(repo.get("AGT_NEW")?.operationalState).toBe("inactive");
  });

  it("does not auto-deactivate existing active on conflict", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT_A", operationalState: "active" }),
    );
    repo.seed(baseSnapshot({ agentId: "AGT_B", operationalState: "pending" }));
    await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_B",
        countryId: "SA",
        expectedCurrentState: "pending",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_no_auto_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(repo.get("AGT_A")?.operationalState).toBe("active");
    expect(repo.findActiveAgentIdForCountry("SA")).toBe("AGT_A");
  });

  it("race: two concurrent activates same country → exactly one success", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT_R1", operationalState: "inactive" }),
    );
    repo.seed(
      baseSnapshot({ agentId: "AGT_R2", operationalState: "inactive" }),
    );

    const [a, b] = await Promise.all([
      executeAgentControlledWrite(
        createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT_R1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_race_r1_001",
          correlationId: "corr_5b",
        }),
        deps,
      ),
      executeAgentControlledWrite(
        createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT_R2",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_race_r2_001",
          correlationId: "corr_5b",
        }),
        deps,
      ),
    ]);

    const successes = [a, b].filter((o) => o.ok);
    const denials = [a, b].filter((o) => !o.ok);
    expect(successes).toHaveLength(1);
    expect(denials).toHaveLength(1);
    if (!denials[0]!.ok) {
      expect(denials[0]!.code).toBe("ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY");
    }
    expect(repo.applied).toHaveLength(1);
    const activeId = repo.findActiveAgentIdForCountry("SA");
    expect(activeId === "AGT_R1" || activeId === "AGT_R2").toBe(true);
    const otherId = activeId === "AGT_R1" ? "AGT_R2" : "AGT_R1";
    expect(repo.get(otherId)?.operationalState).toBe("inactive");
  });

  it("different countries may each have one active", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        agentId: "AGT_SA",
        countryId: "SA",
        operationalState: "inactive",
      }),
    );
    repo.seed(
      baseSnapshot({
        agentId: "AGT_AE",
        countryId: "AE",
        operationalState: "inactive",
      }),
    );
    const sa = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_SA",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_multi_sa_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    const ae = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_AE",
        countryId: "AE",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_multi_ae_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(sa.ok).toBe(true);
    expect(ae.ok).toBe(true);
    expect(repo.findActiveAgentIdForCountry("SA")).toBe("AGT_SA");
    expect(repo.findActiveAgentIdForCountry("AE")).toBe("AGT_AE");
  });
});

describe("Phase 5B — RBAC", () => {
  it("auditor never writes", async () => {
    expect(actorMayWriteAgents(auditor, "activate")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: auditor,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_aud_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
    expect(repo.applied).toHaveLength(0);
  });

  it("support_agent DENY", async () => {
    expect(actorMayWriteAgents(supportAgent, "activate")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: supportAgent,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_sup_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
  });

  it("agent_user must NOT manage other Agents", async () => {
    expect(actorMayWriteAgents(agentUser, "activate")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT_OTHER" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: agentUser,
        agentId: "AGT_OTHER",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_agt_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
  });

  it("country_admin with agents:manage may write in scope", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1", countryId: "SA" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: countryAdminSa,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_ca_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
  });

  it("super_admin and operations_manager ALLOW", () => {
    expect(actorMayWriteAgents(superAdmin, "activate")).toBe(true);
    expect(actorMayWriteAgents(opsManager, "suspend")).toBe(true);
  });
});

describe("Phase 5B — scope", () => {
  it("country_admin outside country → SCOPE_DENIED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1", countryId: "AE" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: countryAdminSa,
        agentId: "AGT1",
        countryId: "AE",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_scope_out_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("SCOPE_DENIED");
  });

  it.each(["not_represented", "unknown", "unmapped"] as const)(
    "country-scoped actor + countryScopeKind=%s → SCOPE_DENIED",
    async (kind) => {
      const { deps, repo } = makeDeps();
      repo.seed(
        baseSnapshot({
          agentId: "AGT1",
          countryId: kind === "not_represented" ? null : "??",
          countryScopeKind: kind,
        }),
      );
      const outcome = await executeAgentControlledWrite(
        createActivateAgentCommand({
          actor: countryAdminSa,
          agentId: "AGT1",
          countryId: kind === "not_represented" ? "SA" : "??",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_scope_${kind}_001`,
          correlationId: "corr_5b",
        }),
        deps,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        // Scope denied before country match, or PRECONDITION/reassignment after
        expect([
          "SCOPE_DENIED",
          "PRECONDITION_FAILED",
          "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
        ]).toContain(outcome.code);
      }
    },
  );

  it("global actor may proceed when country mapped", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1", countryId: "SA" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_scope_global_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("Phase 5B — preconditions & concurrency", () => {
  it("AGENT_NOT_FOUND", async () => {
    const { deps } = makeDeps();
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "MISSING",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_nf_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("AGENT_NOT_FOUND");
  });

  it("NOT_OPERATIONAL_AGENT", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", isOperationalAgent: false }),
    );
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_nop_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_AGENT");
  });

  it("excludedNonAgent → NOT_OPERATIONAL_AGENT", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        agentId: "AGT1",
        excludedNonAgent: true,
        isOperationalAgent: false,
      }),
    );
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_excl_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_AGENT");
  });

  it("expectedCurrentState mismatch → PRECONDITION_FAILED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "active" }),
    );
    const outcome = await executeAgentControlledWrite(
      createSuspendAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_exp_001",
        correlationId: "corr_5b",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PRECONDITION_FAILED");
  });

  it("preconditionToken mismatch → PRECONDITION_FAILED (no LWW)", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1", preconditionToken: "tok_B" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_A",
        idempotencyKey: "idem_tok_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PRECONDITION_FAILED");
    expect(repo.applied).toHaveLength(0);
  });

  it("invalid transition → INVALID_AGENT_STATE_TRANSITION", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "unknown" }),
    );
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "unknown",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_inv_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("INVALID_AGENT_STATE_TRANSITION");
    }
  });

  it("country mismatch → COUNTRY_REASSIGNMENT_NOT_ALLOWED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1", countryId: "SA" }));
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "AE",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_reassign_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("COUNTRY_REASSIGNMENT_NOT_ALLOWED");
    }
    expect(repo.applied).toHaveLength(0);
  });
});

describe("Phase 5B — idempotency", () => {
  it("idempotency store replay returns prior result without second write", async () => {
    const { deps, repo, idempotency } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    const cmd = createActivateAgentCommand({
      actor: superAdmin,
      agentId: "AGT1",
      countryId: "SA",
      expectedCurrentState: "inactive",
      preconditionToken: "tok_1",
      idempotencyKey: "idem_replay_002",
      correlationId: "corr_5b",
    });
    const first = await executeAgentControlledWrite(cmd, deps);
    expect(first.ok).toBe(true);

    const stored = await idempotency.get("idem_replay_002");
    expect(stored).not.toBeNull();
    expect(stored!.result.ok).toBe(true);
    expect(repo.applied).toHaveLength(1);

    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    const second = await executeAgentControlledWrite(cmd, deps);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.status).toBe("idempotent_replay");
    expect(repo.applied).toHaveLength(1);
  });

  it("same key different fingerprint → IDEMPOTENCY_CONFLICT", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "active" }),
    );
    const first = await executeAgentControlledWrite(
      createSuspendAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_conflict_001",
        correlationId: "corr_5b",
        reasonCode: "policy_violation",
      }),
      deps,
    );
    expect(first.ok).toBe(true);

    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "active" }),
    );
    const conflict = await executeAgentControlledWrite(
      createSuspendAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_conflict_001",
        correlationId: "corr_5b",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(repo.applied).toHaveLength(1);
  });
});

describe("Phase 5B — validation & audit", () => {
  it("suspend without reason → VALIDATION_FAILED at construct time via payload", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "active" }),
    );
    const outcome = await executeAgentControlledWrite(
      {
        ...createSuspendAgentCommand({
          actor: superAdmin,
          agentId: "AGT1",
          countryId: "SA",
          expectedCurrentState: "active",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_sus_bad_001",
          correlationId: "corr_5b",
          reasonCode: "policy_violation",
        }),
        reasonCode: "not_a_real_code" as "policy_violation",
      },
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_FAILED");
  });

  it("PII-like note → VALIDATION_FAILED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ agentId: "AGT1", operationalState: "active" }),
    );
    const outcome = await executeAgentControlledWrite(
      createSuspendAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_pii_001",
        correlationId: "corr_5b",
        reasonCode: "other",
        note: "call agent at +966501234567",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_FAILED");
  });

  it("audit payloads contain no raw PII", async () => {
    const { deps, repo, audit } = makeDeps();
    repo.seed(baseSnapshot({ agentId: "AGT1" }));
    await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT1",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_audit_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    for (const a of [...audit.intents, ...audit.results]) {
      expect(assertAuditPayloadHasNoRawPii(a).ok).toBe(true);
    }
  });

  it("stable error code catalog is complete", () => {
    expect(AGENT_WRITE_ERROR_CODES).toEqual([
      "PRODUCTION_WRITE_DISABLED",
      "PERMISSION_DENIED",
      "SCOPE_DENIED",
      "AGENT_NOT_FOUND",
      "NOT_OPERATIONAL_AGENT",
      "INVALID_AGENT_STATE_TRANSITION",
      "PRECONDITION_FAILED",
      "IDEMPOTENCY_CONFLICT",
      "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
      "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
      "VALIDATION_FAILED",
      "INTERNAL_WRITE_FAILURE",
    ]);
  });
});

describe("Phase 5B — emulator availability", () => {
  it("documents emulator unavailable when not injected", async () => {
    const emu = new EmulatorAgentWriteRepository({ available: false });
    expect(emu.isAvailable).toBe(false);
    await expect(
      emu.apply({
        command: createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_emu_001",
          correlationId: "corr_5b",
        }),
        snapshot: baseSnapshot({ agentId: "AGT1" }),
        fromState: "inactive",
        toState: "active",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_WRITE_FAILURE" });
  });

  it("synthetic emulator path applies when available=true", async () => {
    const emu = new EmulatorAgentWriteRepository({ available: true });
    emu.seed(baseSnapshot({ agentId: "AGT_EMU" }));
    const { deps } = makeDeps();
    deps.repository = emu;
    deps.loadPort = {
      loadForWrite: async (id) => emu.getSyntheticStore().get(id) ?? null,
      findActiveAgentIdForCountry: async (countryId) =>
        emu.getSyntheticStore().findActiveAgentIdForCountry(countryId),
    };
    const outcome = await executeAgentControlledWrite(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_EMU",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_emu_ok_001",
        correlationId: "corr_5b",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    expect(emu.applied).toHaveLength(1);
  });
});
