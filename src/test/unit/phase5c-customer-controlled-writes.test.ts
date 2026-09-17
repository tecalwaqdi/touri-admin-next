/**
 * Phase 5C — Customer Controlled Writes exhaustive Fake matrix (§§22–24).
 * Production calls = 0. Production writes = 0.
 * Finance writes NOT started. Driver/Agent remain Production-disabled.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  createDisableCustomerCommand,
  createBlockCustomerCommand,
  createReactivateCustomerCommand,
  executeCustomerControlledWrite,
  FakeCustomerWriteRepository,
  DisabledCustomerWriteRepository,
  EmulatorCustomerWriteRepository,
  ProductionCustomerWriteRepository,
  createProductionRuntimeCustomerWriteRepository,
  InMemoryCustomerWriteIdempotencyStore,
  InMemoryCustomerWriteAuditPort,
  PROVEN_CUSTOMER_STATE_TRANSITIONS,
  isProvenCustomerTransition,
  resolveCustomerTransition,
  allowedFromStatesForCustomerAction,
  actorMayWriteCustomers,
  CUSTOMER_WRITE_ERROR_CODES,
  CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE,
  CUSTOMER_AUTH_WRITE_HARD_FALSE,
  isProvenOperationalCustomer,
  assertCustomerAuthWriteEnabled,
  type CustomerWriteSnapshot,
  type CustomerWriteFlagGate,
  type VerifiedCustomerWriteActor,
  type CustomerControlledWriteServiceDeps,
  type CustomerConflictingRole,
} from "@/application/controlled-writes/customers";
import { assertAuditPayloadHasNoRawPii } from "@/application/controlled-writes/ControlledWriteAudit";
import {
  CUSTOMER_WRITE_ENABLED_RUNTIME,
  CUSTOMER_AUTH_WRITE_ENABLED_RUNTIME,
  DRIVER_WRITE_ENABLED_RUNTIME,
  AGENT_WRITE_ENABLED_RUNTIME,
  FINANCE_WRITE_IMPLEMENTED,
} from "./phase5c-customer-controlled-writes.test.helpers";

const FLAGS_FALSE: CustomerWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
};

const superAdmin: VerifiedCustomerWriteActor = {
  uid: "actor_sa",
  role: "super_admin",
  permissions: [
    "customers:manage",
    "customers:read",
    "drivers:read",
    "agents:read",
  ],
  scope: { type: "global" },
};

const opsManager: VerifiedCustomerWriteActor = {
  uid: "actor_ops",
  role: "operations_manager",
  permissions: ["customers:manage", "customers:read"],
  scope: { type: "global" },
};

const countryAdminSa: VerifiedCustomerWriteActor = {
  uid: "actor_ca",
  role: "country_admin",
  permissions: ["customers:manage", "customers:read"],
  scope: { type: "country", countryIds: ["SA"] },
};

const auditor: VerifiedCustomerWriteActor = {
  uid: "actor_aud",
  role: "auditor",
  permissions: ["audit:read", "customers:read"],
  scope: { type: "global" },
};

const supportAgent: VerifiedCustomerWriteActor = {
  uid: "actor_sup",
  role: "support_agent",
  permissions: ["customers:read", "customers:read_pii", "trips:read"],
  scope: { type: "global" },
};

const agentUser: VerifiedCustomerWriteActor = {
  uid: "actor_agt",
  role: "agent_user",
  permissions: ["customers:read", "drivers:read"],
  scope: { type: "agent", agentIds: ["AGT_SELF"] },
};

function baseSnapshot(
  partial: Partial<CustomerWriteSnapshot> &
    Pick<CustomerWriteSnapshot, "customerId">,
): CustomerWriteSnapshot {
  return {
    exists: true,
    isOperationalCustomer: true,
    isCustomerCandidate: true,
    hasPositiveCustomerEvidence: true,
    excludedNonCustomer: false,
    excludedUnknownIdentity: false,
    mappingStatus: "operational",
    conflictingRole: "none",
    operationalState: "enabled",
    accountEnabled: "enabled",
    tripState: "idle",
    countryId: "SA",
    countryScopeKind: "mapped",
    preconditionToken: "tok_1",
    updateGeneration: "g1",
    ...partial,
  };
}

function makeDeps(opts?: {
  repo?: FakeCustomerWriteRepository;
  allowOffline?: boolean;
  flags?: CustomerWriteFlagGate;
  audit?: InMemoryCustomerWriteAuditPort;
  idempotency?: InMemoryCustomerWriteIdempotencyStore;
}): {
  deps: CustomerControlledWriteServiceDeps;
  repo: FakeCustomerWriteRepository;
  audit: InMemoryCustomerWriteAuditPort;
  idempotency: InMemoryCustomerWriteIdempotencyStore;
} {
  const repo = opts?.repo ?? new FakeCustomerWriteRepository();
  const audit = opts?.audit ?? new InMemoryCustomerWriteAuditPort();
  const idempotency =
    opts?.idempotency ?? new InMemoryCustomerWriteIdempotencyStore();
  const deps: CustomerControlledWriteServiceDeps = {
    flags: opts?.flags ?? FLAGS_FALSE,
    repository: repo,
    audit,
    idempotency,
    allowOfflineExecution: opts?.allowOffline ?? true,
    loadPort: {
      loadForWrite: async (id) => repo.get(id) ?? null,
    },
  };
  return { deps, repo, audit, idempotency };
}

describe("Phase 5C — state transition matrix", () => {
  it("encodes only proven transitions", () => {
    expect(PROVEN_CUSTOMER_STATE_TRANSITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "enabled",
          to: "disabled",
          action: "disable",
        }),
        expect.objectContaining({
          from: "enabled",
          to: "blocked",
          action: "block",
        }),
        expect.objectContaining({
          from: "disabled",
          to: "enabled",
          action: "reactivate",
        }),
        expect.objectContaining({
          from: "blocked",
          to: "enabled",
          action: "reactivate",
        }),
      ]),
    );
    expect(PROVEN_CUSTOMER_STATE_TRANSITIONS).toHaveLength(4);
  });

  it("rejects unproven transitions with INVALID_CUSTOMER_STATE_TRANSITION", () => {
    expect(resolveCustomerTransition("disable", "disabled").ok).toBe(false);
    expect(resolveCustomerTransition("disable", "blocked").ok).toBe(false);
    expect(resolveCustomerTransition("block", "disabled").ok).toBe(false);
    expect(resolveCustomerTransition("block", "blocked").ok).toBe(false);
    expect(resolveCustomerTransition("reactivate", "enabled").ok).toBe(false);
    expect(resolveCustomerTransition("reactivate", "deleted").ok).toBe(false);
    expect(resolveCustomerTransition("reactivate", "unknown").ok).toBe(false);
    expect(resolveCustomerTransition("disable", "deleted").ok).toBe(false);
    expect(resolveCustomerTransition("block", "unknown").ok).toBe(false);
    expect(isProvenCustomerTransition("deleted", "enabled", "reactivate")).toBe(
      false,
    );
    expect(allowedFromStatesForCustomerAction("disable")).toEqual(["enabled"]);
    expect(allowedFromStatesForCustomerAction("block")).toEqual(["enabled"]);
    expect(allowedFromStatesForCustomerAction("reactivate")).toEqual([
      "disabled",
      "blocked",
    ]);
  });
});

describe("Phase 5C — Production gate & write trap", () => {
  it("env-gates Production customer writes; CUSTOMER_WRITE_ENABLED stays false by default", () => {
    expect(CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
    expect(CUSTOMER_AUTH_WRITE_HARD_FALSE).toBe(false);
    expect(CUSTOMER_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(CUSTOMER_AUTH_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(FLAGS_FALSE.CUSTOMER_WRITE_ENABLED).toBe(false);
    expect(ProductionCustomerWriteRepository.isReachable(FLAGS_FALSE)).toBe(
      false,
    );
    expect(
      ProductionCustomerWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        CUSTOMER_WRITE_ENABLED: true,
        CUSTOMER_AUTH_WRITE_ENABLED: false,
      }),
    ).toBe(true);
  });

  it("Production path → PRODUCTION_WRITE_DISABLED without mutation", async () => {
    const repo = new FakeCustomerWriteRepository();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const { deps } = makeDeps({ repo, allowOffline: false });
    deps.repository = createProductionRuntimeCustomerWriteRepository(FLAGS_FALSE);

    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_prod_gate_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("PRODUCTION_WRITE_DISABLED");
    }
    expect(outcome.productionWriteExecuted).toBe(false);
    expect(outcome.authWriteExecuted).toBe(false);
    expect(repo.applied).toHaveLength(0);
  });

  it("DisabledCustomerWriteRepository always throws PRODUCTION_WRITE_DISABLED", async () => {
    const disabled = new DisabledCustomerWriteRepository();
    await expect(
      disabled.apply({
        command: createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_dis_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        snapshot: baseSnapshot({ customerId: "CUS1" }),
        fromState: "enabled",
        toState: "disabled",
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });

  it("ProductionCustomerWriteRepository requires write port when flags armed", async () => {
    const prod = new ProductionCustomerWriteRepository({
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: true,
      CUSTOMER_WRITE_ENABLED: true,
      CUSTOMER_AUTH_WRITE_ENABLED: false,
    });
    await expect(
      prod.apply({
        command: createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_unreach_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        snapshot: baseSnapshot({ customerId: "CUS1" }),
        fromState: "enabled",
        toState: "disabled",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_WRITE_FAILURE" });
  });

  it("Auth sync prepareAuthSync → AUTH_WRITE_DISABLED", async () => {
    const prod = new ProductionCustomerWriteRepository(FLAGS_FALSE);
    await expect(
      prod.prepareAuthSync({
        customerId: "CUS1",
        desiredAuthDisabled: true,
      }),
    ).rejects.toMatchObject({ code: "AUTH_WRITE_DISABLED" });

    try {
      assertCustomerAuthWriteEnabled({
        ...FLAGS_FALSE,
        CUSTOMER_AUTH_WRITE_ENABLED: true,
      });
      expect.fail("expected AUTH_WRITE_DISABLED");
    } catch (err) {
      expect(err).toMatchObject({ code: "AUTH_WRITE_DISABLED" });
    }
  });

  it("Driver / Agent remain Production-disabled; Finance not started", () => {
    expect(DRIVER_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(AGENT_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(FINANCE_WRITE_IMPLEMENTED).toBe(false);
  });
});

describe("Phase 5C — command happy paths (Fake)", () => {
  let repo: FakeCustomerWriteRepository;
  let deps: CustomerControlledWriteServiceDeps;
  let audit: InMemoryCustomerWriteAuditPort;

  beforeEach(() => {
    const built = makeDeps();
    repo = built.repo;
    deps = built.deps;
    audit = built.audit;
  });

  it("DisableCustomerCommand: enabled → disabled", async () => {
    repo.seed(baseSnapshot({ customerId: "CUS_DIS" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_DIS",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_dis_ok_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
        note: "temporary operational hold",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.status).toBe("applied");
      expect(outcome.fromState).toBe("enabled");
      expect(outcome.toState).toBe("disabled");
      expect(outcome.countryId).toBe("SA");
      expect(outcome.authWriteExecuted).toBe(false);
    }
    expect(repo.get("CUS_DIS")?.operationalState).toBe("disabled");
    expect(repo.get("CUS_DIS")?.accountEnabled).toBe("disabled");
    expect(audit.intents).toHaveLength(1);
    expect(audit.results).toHaveLength(1);
    expect(outcome.productionWriteExecuted).toBe(false);
  });

  it("BlockCustomerCommand: enabled → blocked (distinct from disable)", async () => {
    repo.seed(baseSnapshot({ customerId: "CUS_BLK" }));
    const outcome = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: opsManager,
        customerId: "CUS_BLK",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_blk_ok_001",
        correlationId: "corr_5c",
        reasonCode: "fraud",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fromState).toBe("enabled");
      expect(outcome.toState).toBe("blocked");
    }
    expect(repo.get("CUS_BLK")?.operationalState).toBe("blocked");
    expect(audit.intents[0]!.reasonCode).toBe("fraud");
  });

  it("ReactivateCustomerCommand: disabled → enabled", async () => {
    repo.seed(
      baseSnapshot({
        customerId: "CUS_RE_DIS",
        operationalState: "disabled",
        accountEnabled: "disabled",
      }),
    );
    const outcome = await executeCustomerControlledWrite(
      createReactivateCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_RE_DIS",
        expectedCurrentState: "disabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_re_dis_001",
        correlationId: "corr_5c",
        reasonCode: "error_correction",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.toState).toBe("enabled");
    expect(repo.get("CUS_RE_DIS")?.accountEnabled).toBe("enabled");
  });

  it("ReactivateCustomerCommand: blocked → enabled", async () => {
    repo.seed(
      baseSnapshot({
        customerId: "CUS_RE_BLK",
        operationalState: "blocked",
        accountEnabled: "disabled",
      }),
    );
    const outcome = await executeCustomerControlledWrite(
      createReactivateCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_RE_BLK",
        expectedCurrentState: "blocked",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_re_blk_001",
        correlationId: "corr_5c",
        reasonCode: "appeal_approved",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.fromState).toBe("blocked");
      expect(outcome.toState).toBe("enabled");
    }
  });
});

describe("Phase 5C — membership protection (4A-7)", () => {
  it("exists-only user/{uid} without positive evidence → NOT_OPERATIONAL_CUSTOMER", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        customerId: "CUS_EXISTS",
        isOperationalCustomer: false,
        isCustomerCandidate: true,
        hasPositiveCustomerEvidence: false,
        mappingStatus: "unknown",
      }),
    );
    expect(isProvenOperationalCustomer(repo.get("CUS_EXISTS")!)).toBe(false);
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_EXISTS",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_mem_exists_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_CUSTOMER");
    expect(repo.applied).toHaveLength(0);
  });

  it("excludedNonCustomer → NOT_OPERATIONAL_CUSTOMER", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        customerId: "CUS_EXCL",
        isOperationalCustomer: false,
        excludedNonCustomer: true,
        mappingStatus: "excludedNonCustomer",
        conflictingRole: "driver",
      }),
    );
    const outcome = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_EXCL",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_mem_excl_001",
        correlationId: "corr_5c",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_CUSTOMER");
  });

  it("excludedUnknownIdentity → NOT_OPERATIONAL_CUSTOMER", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        customerId: "CUS_UNK",
        isOperationalCustomer: false,
        excludedUnknownIdentity: true,
        mappingStatus: "excludedUnknownIdentity",
        hasPositiveCustomerEvidence: false,
      }),
    );
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_UNK",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_mem_unk_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_CUSTOMER");
  });

  it.each([
    "driver",
    "agent",
    "super_admin",
    "finance",
    "country_admin",
    "partner",
    "transport",
    "tour_guide",
  ] as const satisfies readonly CustomerConflictingRole[])(
    "shared-user contamination role=%s → NOT_OPERATIONAL_CUSTOMER",
    async (role) => {
      const { deps, repo } = makeDeps();
      repo.seed(
        baseSnapshot({
          customerId: `CUS_${role}`,
          isOperationalCustomer: false,
          excludedNonCustomer: true,
          mappingStatus: "excludedNonCustomer",
          conflictingRole: role,
        }),
      );
      const outcome = await executeCustomerControlledWrite(
        createDisableCustomerCommand({
          actor: superAdmin,
          customerId: `CUS_${role}`,
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_contam_${role}_001`,
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        deps,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.code).toBe("NOT_OPERATIONAL_CUSTOMER");
      expect(repo.applied).toHaveLength(0);
    },
  );
});

describe("Phase 5C — RBAC", () => {
  it("auditor never writes", async () => {
    expect(actorMayWriteCustomers(auditor, "disable")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: auditor,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_aud_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
    expect(repo.applied).toHaveLength(0);
  });

  it("support_agent DENY (no automatic manage powers)", async () => {
    expect(actorMayWriteCustomers(supportAgent, "block")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: supportAgent,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_sup_001",
        correlationId: "corr_5c",
        reasonCode: "abuse",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
  });

  it("agent_user must NOT block / manage Customers", async () => {
    expect(actorMayWriteCustomers(agentUser, "block")).toBe(false);
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: agentUser,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_agt_001",
        correlationId: "corr_5c",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PERMISSION_DENIED");
  });

  it("country_admin with customers:manage may write in own country", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1", countryId: "SA" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: countryAdminSa,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_rbac_ca_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
  });

  it("super_admin and operations_manager ALLOW", () => {
    expect(actorMayWriteCustomers(superAdmin, "disable")).toBe(true);
    expect(actorMayWriteCustomers(opsManager, "block")).toBe(true);
    expect(actorMayWriteCustomers(opsManager, "reactivate")).toBe(true);
  });
});

describe("Phase 5C — scope & geography-not-represented", () => {
  it("country_admin outside country → SCOPE_DENIED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1", countryId: "AE" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: countryAdminSa,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_scope_out_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
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
          customerId: "CUS1",
          countryId: kind === "not_represented" ? null : "??",
          countryScopeKind: kind,
        }),
      );
      const outcome = await executeCustomerControlledWrite(
        createDisableCustomerCommand({
          actor: countryAdminSa,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_scope_${kind}_001`,
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        deps,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.code).toBe("SCOPE_DENIED");
    },
  );

  it("global actor MAY manage geography-not-represented operational Customer", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({
        customerId: "CUS_GEO",
        countryId: null,
        countryScopeKind: "not_represented",
      }),
    );
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_GEO",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_geo_global_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.countryId).toBeNull();
  });

  it("global actor may proceed when country mapped", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1", countryId: "SA" }));
    const outcome = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_scope_global_001",
        correlationId: "corr_5c",
        reasonCode: "policy_violation",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("Phase 5C — preconditions, concurrency, active-trip", () => {
  it("CUSTOMER_NOT_FOUND", async () => {
    const { deps } = makeDeps();
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "MISSING",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_nf_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("CUSTOMER_NOT_FOUND");
  });

  it("expectedCurrentState mismatch → PRECONDITION_FAILED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ customerId: "CUS1", operationalState: "disabled" }),
    );
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_exp_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PRECONDITION_FAILED");
  });

  it("preconditionToken mismatch → PRECONDITION_FAILED (no LWW)", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1", preconditionToken: "tok_B" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_A",
        idempotencyKey: "idem_tok_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("PRECONDITION_FAILED");
    expect(repo.applied).toHaveLength(0);
  });

  it("deleted → reactivate → INVALID_CUSTOMER_STATE_TRANSITION", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ customerId: "CUS1", operationalState: "deleted" }),
    );
    const outcome = await executeCustomerControlledWrite(
      createReactivateCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "deleted",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_del_re_001",
        correlationId: "corr_5c",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("INVALID_CUSTOMER_STATE_TRANSITION");
    }
  });

  it("unknown → enabled/blocked denied", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ customerId: "CUS1", operationalState: "unknown" }),
    );
    const reactivate = await executeCustomerControlledWrite(
      createReactivateCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "unknown",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_unk_re_001",
        correlationId: "corr_5c",
      }),
      deps,
    );
    expect(reactivate.ok).toBe(false);
    if (!reactivate.ok) {
      expect(reactivate.code).toBe("INVALID_CUSTOMER_STATE_TRANSITION");
    }

    const block = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "unknown",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_unk_blk_001",
        correlationId: "corr_5c",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(block.ok).toBe(false);
    if (!block.ok) {
      expect(block.code).toBe("INVALID_CUSTOMER_STATE_TRANSITION");
    }
  });

  it("disable/block with active trip → CUSTOMER_HAS_ACTIVE_TRIP (no auto-cancel)", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(
      baseSnapshot({ customerId: "CUS_TRIP", tripState: "active" }),
    );
    const disable = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_TRIP",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_trip_dis_001",
        correlationId: "corr_5c",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(disable.ok).toBe(false);
    if (!disable.ok) expect(disable.code).toBe("CUSTOMER_HAS_ACTIVE_TRIP");

    const block = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_TRIP",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_trip_blk_001",
        correlationId: "corr_5c",
        reasonCode: "safety",
      }),
      deps,
    );
    expect(block.ok).toBe(false);
    if (!block.ok) expect(block.code).toBe("CUSTOMER_HAS_ACTIVE_TRIP");
    expect(repo.applied).toHaveLength(0);
    expect(repo.get("CUS_TRIP")?.tripState).toBe("active");
  });

  it("race: concurrent disable same customer → exactly one success", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS_RACE" }));

    const [a, b] = await Promise.all([
      executeCustomerControlledWrite(
        createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS_RACE",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_race_a_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        deps,
      ),
      executeCustomerControlledWrite(
        createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS_RACE",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_race_b_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        deps,
      ),
    ]);

    const successes = [a, b].filter((o) => o.ok);
    const denials = [a, b].filter((o) => !o.ok);
    expect(successes).toHaveLength(1);
    expect(denials).toHaveLength(1);
    if (!denials[0]!.ok) {
      expect(denials[0]!.code).toBe("PRECONDITION_FAILED");
    }
    expect(repo.applied).toHaveLength(1);
    expect(repo.get("CUS_RACE")?.operationalState).toBe("disabled");
  });
});

describe("Phase 5C — idempotency", () => {
  it("idempotency store replay returns prior result without second write", async () => {
    const { deps, repo, idempotency } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const cmd = createDisableCustomerCommand({
      actor: superAdmin,
      customerId: "CUS1",
      expectedCurrentState: "enabled",
      preconditionToken: "tok_1",
      idempotencyKey: "idem_replay_002",
      correlationId: "corr_5c",
      reasonCode: "operational",
    });
    const first = await executeCustomerControlledWrite(cmd, deps);
    expect(first.ok).toBe(true);

    const stored = await idempotency.get("idem_replay_002");
    expect(stored).not.toBeNull();
    expect(repo.applied).toHaveLength(1);

    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const second = await executeCustomerControlledWrite(cmd, deps);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.status).toBe("idempotent_replay");
    expect(repo.applied).toHaveLength(1);
  });

  it("same key different fingerprint → IDEMPOTENCY_CONFLICT", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const first = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_conflict_001",
        correlationId: "corr_5c",
        reasonCode: "fraud",
      }),
      deps,
    );
    expect(first.ok).toBe(true);

    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const conflict = await executeCustomerControlledWrite(
      createBlockCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_conflict_001",
        correlationId: "corr_5c",
        reasonCode: "abuse",
      }),
      deps,
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(repo.applied).toHaveLength(1);
  });
});

describe("Phase 5C — validation & audit", () => {
  it("disable without reasonCode → REASON_REQUIRED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      {
        ...createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_reason_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        reasonCode: undefined as unknown as "operational",
      },
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("REASON_REQUIRED");
  });

  it("block with invalid reasonCode → VALIDATION_FAILED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      {
        ...createBlockCustomerCommand({
          actor: superAdmin,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_bad_reason_001",
          correlationId: "corr_5c",
          reasonCode: "fraud",
        }),
        reasonCode: "not_a_real_code" as "fraud",
      },
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_FAILED");
  });

  it("PII-like note → VALIDATION_FAILED", async () => {
    const { deps, repo } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_pii_001",
        correlationId: "corr_5c",
        reasonCode: "other",
        note: "call customer at +966501234567",
      }),
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("VALIDATION_FAILED");
  });

  it("audit payloads contain no raw PII; productionWriteExecuted=false", async () => {
    const { deps, repo, audit } = makeDeps();
    repo.seed(baseSnapshot({ customerId: "CUS1" }));
    await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_audit_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    for (const a of [...audit.intents, ...audit.results]) {
      expect(assertAuditPayloadHasNoRawPii(a).ok).toBe(true);
      expect(a.productionWriteExecuted).toBe(false);
      expect(a.authWriteExecuted).toBe(false);
    }
  });

  it("stable error code catalog is complete", () => {
    expect(CUSTOMER_WRITE_ERROR_CODES).toEqual([
      "PRODUCTION_WRITE_DISABLED",
      "PERMISSION_DENIED",
      "SCOPE_DENIED",
      "CUSTOMER_NOT_FOUND",
      "NOT_OPERATIONAL_CUSTOMER",
      "INVALID_CUSTOMER_STATE_TRANSITION",
      "PRECONDITION_FAILED",
      "IDEMPOTENCY_CONFLICT",
      "CUSTOMER_HAS_ACTIVE_TRIP",
      "REASON_REQUIRED",
      "AUTH_WRITE_DISABLED",
      "VALIDATION_FAILED",
      "INTERNAL_WRITE_FAILURE",
    ]);
  });
});

describe("Phase 5C — emulator availability", () => {
  it("documents emulator unavailable when not injected", async () => {
    const emu = new EmulatorCustomerWriteRepository({ available: false });
    expect(emu.isAvailable).toBe(false);
    await expect(
      emu.apply({
        command: createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS1",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_emu_001",
          correlationId: "corr_5c",
          reasonCode: "operational",
        }),
        snapshot: baseSnapshot({ customerId: "CUS1" }),
        fromState: "enabled",
        toState: "disabled",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_WRITE_FAILURE" });
  });

  it("synthetic emulator path applies when available=true", async () => {
    const emu = new EmulatorCustomerWriteRepository({ available: true });
    emu.seed(baseSnapshot({ customerId: "CUS_EMU" }));
    const { deps } = makeDeps();
    deps.repository = emu;
    deps.loadPort = {
      loadForWrite: async (id) => emu.getSyntheticStore().get(id) ?? null,
    };
    const outcome = await executeCustomerControlledWrite(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_EMU",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_emu_ok_001",
        correlationId: "corr_5c",
        reasonCode: "operational",
      }),
      deps,
    );
    expect(outcome.ok).toBe(true);
    expect(emu.applied).toHaveLength(1);
  });
});

describe("Phase 5C — Finance isolation", () => {
  it("command surface has no wallet/payment/refund/settlement fields", () => {
    const cmd = createDisableCustomerCommand({
      actor: superAdmin,
      customerId: "CUS1",
      expectedCurrentState: "enabled",
      preconditionToken: "tok_1",
      idempotencyKey: "idem_fin_iso_001",
      correlationId: "corr_5c",
      reasonCode: "operational",
    });
    expect(cmd).not.toHaveProperty("walletId");
    expect(cmd).not.toHaveProperty("refundAmount");
    expect(cmd).not.toHaveProperty("settlementId");
    expect(cmd).not.toHaveProperty("paymentId");
    expect(FINANCE_WRITE_IMPLEMENTED).toBe(false);
  });
});
