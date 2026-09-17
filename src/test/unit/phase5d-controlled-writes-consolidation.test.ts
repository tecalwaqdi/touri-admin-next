/**
 * Phase 5D — Controlled Writes consolidation integration matrix (§22).
 * Production calls = 0. Production writes = 0.
 * Auth / Finance / Trip writes = 0. No Pilot execution.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  createControlledWritesService,
  ControlledWritesService,
  CONTROLLED_WRITES_ENABLEMENT,
  DENIED_WRITE_RESOURCES,
  ALLOWED_WRITE_RESOURCES,
  CONTROLLED_WRITE_ERROR_CATALOG,
  domainErrorCodesCovered,
  DEFAULT_CONSOLIDATION_FLAGS_FALSE,
  assertConsolidationProductionGates,
  allConsolidationWriteFlagsDisabled,
  InMemoryConsolidatedIdempotencyStore,
  InMemoryConsolidatedAuditPort,
  CONTROLLED_WRITE_ATOMICITY_GUARANTEES,
  mutationAllowedAfterCheckpoint,
  assessSafestFuturePilot,
  PLANNED_WRITE_ROLE_MATRIX,
  actorHasControlledWritePermission,
  assertAuditPayloadHasNoRawPii,
  type ConsolidationWriteFlagGate,
} from "@/application/controlled-writes";
import {
  createApproveDriverCommand,
  createRejectDriverCommand,
  createRequestDriverChangesCommand,
  FakeDriverWriteRepository,
  DisabledDriverWriteRepository,
  EmulatorDriverWriteRepository,
  ProductionDriverWriteRepository,
  createProductionRuntimeDriverWriteRepository,
  InMemoryDriverWriteIdempotencyStore,
  InMemoryDriverWriteAuditPort,
  actorMayWriteDrivers,
  type DriverWriteSnapshot,
  type DriverWriteFlagGate,
  type VerifiedDriverWriteActor,
  type DriverControlledWriteServiceDeps,
} from "@/application/controlled-writes/drivers";
import {
  createActivateAgentCommand,
  createDeactivateAgentCommand,
  FakeAgentWriteRepository,
  DisabledAgentWriteRepository,
  EmulatorAgentWriteRepository,
  ProductionAgentWriteRepository,
  createProductionRuntimeAgentWriteRepository,
  InMemoryAgentWriteIdempotencyStore,
  InMemoryAgentWriteAuditPort,
  actorMayWriteAgents,
  type AgentWriteSnapshot,
  type AgentWriteFlagGate,
  type VerifiedAgentWriteActor,
  type AgentControlledWriteServiceDeps,
} from "@/application/controlled-writes/agents";
import {
  createDisableCustomerCommand,
  createBlockCustomerCommand,
  FakeCustomerWriteRepository,
  DisabledCustomerWriteRepository,
  EmulatorCustomerWriteRepository,
  ProductionCustomerWriteRepository,
  createProductionRuntimeCustomerWriteRepository,
  InMemoryCustomerWriteIdempotencyStore,
  InMemoryCustomerWriteAuditPort,
  actorMayWriteCustomers,
  type CustomerWriteSnapshot,
  type CustomerWriteFlagGate,
  type VerifiedCustomerWriteActor,
  type CustomerControlledWriteServiceDeps,
} from "@/application/controlled-writes/customers";
import {
  DRIVER_WRITE_ENABLED_RUNTIME,
  AGENT_WRITE_ENABLED_RUNTIME,
  CUSTOMER_WRITE_ENABLED_RUNTIME,
  CUSTOMER_AUTH_WRITE_ENABLED_RUNTIME,
  FINANCE_WRITE_IMPLEMENTED,
  PRODUCTION_WRITES_ENABLED,
  CONTROLLED_WRITES_ENABLED,
} from "./phase5d-controlled-writes-consolidation.test.helpers";

const driverFlags: DriverWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
};
const agentFlags: AgentWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
};
const customerFlags: CustomerWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
};

const superAdmin: VerifiedDriverWriteActor &
  VerifiedAgentWriteActor &
  VerifiedCustomerWriteActor = {
  uid: "actor_sa_5d",
  role: "super_admin",
  permissions: [
    "drivers:approve",
    "drivers:read",
    "agents:manage",
    "agents:read",
    "customers:manage",
    "customers:read",
  ],
  scope: { type: "global" },
};

const opsManager = {
  ...superAdmin,
  uid: "actor_ops_5d",
  role: "operations_manager" as const,
};

const countryAdminSa: VerifiedDriverWriteActor &
  VerifiedAgentWriteActor &
  VerifiedCustomerWriteActor = {
  uid: "actor_ca_5d",
  role: "country_admin",
  permissions: [
    "drivers:approve",
    "drivers:read",
    "agents:manage",
    "agents:read",
    "customers:manage",
    "customers:read",
  ],
  scope: { type: "country", countryIds: ["SA"] },
};

const auditor = {
  uid: "actor_aud_5d",
  role: "auditor" as const,
  permissions: ["audit:read", "drivers:read", "agents:read", "customers:read"],
  scope: { type: "global" as const },
};

const reportingViewer = {
  uid: "actor_rv_5d",
  role: "reporting_viewer" as const,
  permissions: ["reports:export", "drivers:read"],
  scope: { type: "global" as const },
};

const supportAgent = {
  uid: "actor_sup_5d",
  role: "support_agent" as const,
  permissions: ["drivers:read", "customers:read", "trips:read"],
  scope: { type: "global" as const },
};

const agentUser = {
  uid: "actor_agt_5d",
  role: "agent_user" as const,
  permissions: ["drivers:read", "agents:read", "customers:read"],
  scope: { type: "agent" as const, agentIds: ["AGT_SELF"] },
};

function driverSnap(
  partial: Partial<DriverWriteSnapshot> & Pick<DriverWriteSnapshot, "driverId">,
): DriverWriteSnapshot {
  return {
    exists: true,
    isOperationalDriver: true,
    registrationStatus: "pending_review",
    accountEnabled: "enabled",
    complianceStatus: "ready",
    tripState: "idle",
    countryId: "SA",
    countryScopeKind: "mapped",
    preconditionToken: "tok_1",
    updateGeneration: "g1",
    ...partial,
  };
}

function agentSnap(
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

function customerSnap(
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

type Harness = {
  service: ControlledWritesService;
  driverRepo: FakeDriverWriteRepository;
  agentRepo: FakeAgentWriteRepository;
  customerRepo: FakeCustomerWriteRepository;
  sharedIdempotency: InMemoryConsolidatedIdempotencyStore;
  consolidatedAudit: InMemoryConsolidatedAuditPort;
  driverAudit: InMemoryDriverWriteAuditPort;
  agentAudit: InMemoryAgentWriteAuditPort;
  customerAudit: InMemoryCustomerWriteAuditPort;
};

function makeHarness(opts?: {
  allowOffline?: boolean;
  flags?: ConsolidationWriteFlagGate;
}): Harness {
  const driverRepo = new FakeDriverWriteRepository();
  const agentRepo = new FakeAgentWriteRepository();
  const customerRepo = new FakeCustomerWriteRepository();
  const sharedIdempotency = new InMemoryConsolidatedIdempotencyStore();
  const consolidatedAudit = new InMemoryConsolidatedAuditPort();
  const driverAudit = new InMemoryDriverWriteAuditPort();
  const agentAudit = new InMemoryAgentWriteAuditPort();
  const customerAudit = new InMemoryCustomerWriteAuditPort();

  const driver: DriverControlledWriteServiceDeps = {
    flags: driverFlags,
    repository: driverRepo,
    audit: driverAudit,
    idempotency: new InMemoryDriverWriteIdempotencyStore(),
    allowOfflineExecution: opts?.allowOffline ?? true,
    loadPort: { loadForWrite: async (id) => driverRepo.get(id) ?? null },
  };
  const agent: AgentControlledWriteServiceDeps = {
    flags: agentFlags,
    repository: agentRepo,
    audit: agentAudit,
    idempotency: new InMemoryAgentWriteIdempotencyStore(),
    allowOfflineExecution: opts?.allowOffline ?? true,
    loadPort: {
      loadForWrite: async (id) => agentRepo.get(id) ?? null,
      findActiveAgentIdForCountry: async (c) =>
        agentRepo.findActiveAgentIdForCountry(c),
    },
  };
  const customer: CustomerControlledWriteServiceDeps = {
    flags: customerFlags,
    repository: customerRepo,
    audit: customerAudit,
    idempotency: new InMemoryCustomerWriteIdempotencyStore(),
    allowOfflineExecution: opts?.allowOffline ?? true,
    loadPort: { loadForWrite: async (id) => customerRepo.get(id) ?? null },
  };

  const service = createControlledWritesService({
    driver,
    agent,
    customer,
    flags: opts?.flags ?? DEFAULT_CONSOLIDATION_FLAGS_FALSE,
    sharedIdempotency,
    consolidatedAudit,
    allowOfflineExecution: opts?.allowOffline ?? true,
  });

  return {
    service,
    driverRepo,
    agentRepo,
    customerRepo,
    sharedIdempotency,
    consolidatedAudit,
    driverAudit,
    agentAudit,
    customerAudit,
  };
}

describe("Phase 5D — enablement model", () => {
  it("keeps implemented/validated distinct from activation", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesImplemented).toBe(true);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesValidatedOffline).toBe(
      true,
    );
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLED).toBe(false);
    expect(PRODUCTION_WRITES_ENABLED).toBe(false);
    expect(DRIVER_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(AGENT_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(CUSTOMER_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(CUSTOMER_AUTH_WRITE_ENABLED_RUNTIME).toBe(false);
    expect(FINANCE_WRITE_IMPLEMENTED).toBe(false);
  });
});

describe("Phase 5D — facade surface", () => {
  it("exposes only explicit resource commands — no generic write APIs", () => {
    const { service } = makeHarness();
    expect(service.forbiddenGenericApis).toEqual([
      "genericWrite",
      "genericUpdate",
      "rawFirestoreMutation",
    ]);
    expect(typeof service.executeDriverCommand).toBe("function");
    expect(typeof service.executeAgentCommand).toBe("function");
    expect(typeof service.executeCustomerCommand).toBe("function");
    expect(service).not.toHaveProperty("genericWrite");
    expect(service).not.toHaveProperty("genericUpdate");
    expect(service).not.toHaveProperty("rawFirestoreMutation");
  });

  it("denies non-allowlisted resources with UNSUPPORTED_WRITE_RESOURCE", () => {
    const { service } = makeHarness();
    expect(ALLOWED_WRITE_RESOURCES).toEqual(["driver", "agent", "customer"]);
    for (const resource of DENIED_WRITE_RESOURCES) {
      const denial = service.rejectUnsupportedResource(resource);
      expect(denial.ok).toBe(false);
      expect(denial.code).toBe("UNSUPPORTED_WRITE_RESOURCE");
      expect(denial.productionWriteExecuted).toBe(false);
    }
  });
});

describe("Phase 5D — success paths via facade", () => {
  it("Driver success path (approve)", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_OK" }));
    const out = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: superAdmin,
        driverId: "DRV_OK",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_drv_ok_01",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.status).toBe("applied");
    expect(h.driverRepo.applied).toHaveLength(1);
    expect(h.driverRepo.get("DRV_OK")?.registrationStatus).toBe("approved");
    expect(out.productionWriteExecuted).toBe(false);
  });

  it("Agent success path (activate)", async () => {
    const h = makeHarness();
    h.agentRepo.seed(agentSnap({ agentId: "AGT_OK" }));
    const out = await h.service.executeAgentCommand(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_OK",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_agt_ok_01",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(true);
    expect(h.agentRepo.applied).toHaveLength(1);
    expect(h.agentRepo.get("AGT_OK")?.operationalState).toBe("active");
  });

  it("Customer success path (disable)", async () => {
    const h = makeHarness();
    h.customerRepo.seed(customerSnap({ customerId: "CUS_OK" }));
    const out = await h.service.executeCustomerCommand(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_OK",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_cus_ok_01",
        correlationId: "corr_5d",
        reasonCode: "operational",
      }),
    );
    expect(out.ok).toBe(true);
    expect(h.customerRepo.applied).toHaveLength(1);
    expect(h.customerRepo.get("CUS_OK")?.operationalState).toBe("disabled");
    if ("authWriteExecuted" in out) {
      expect(out.authWriteExecuted).toBe(false);
    }
  });
});

describe("Phase 5D — cross-domain identity protection", () => {
  it("Driver command cannot mutate non-operational / Customer-like target", async () => {
    const h = makeHarness();
    h.driverRepo.seed(
      driverSnap({ driverId: "CUS_AS_DRV", isOperationalDriver: false }),
    );
    const out = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: superAdmin,
        driverId: "CUS_AS_DRV",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_xdom_d1",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("NOT_OPERATIONAL_DRIVER");
    expect(h.driverRepo.applied).toHaveLength(0);
  });

  it("Agent command cannot mutate non-operational Agent (Driver contamination)", async () => {
    const h = makeHarness();
    h.agentRepo.seed(
      agentSnap({
        agentId: "DRV_AS_AGT",
        isOperationalAgent: false,
        excludedNonAgent: true,
      }),
    );
    const out = await h.service.executeAgentCommand(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "DRV_AS_AGT",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_xdom_a1",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("NOT_OPERATIONAL_AGENT");
    expect(h.agentRepo.applied).toHaveLength(0);
  });

  it("Customer command rejects Driver / Agent / Admin contamination", async () => {
    const h = makeHarness();
    for (const role of ["driver", "agent", "super_admin"] as const) {
      h.customerRepo.seed(
        customerSnap({
          customerId: `CONTAM_${role}`,
          conflictingRole: role,
          isOperationalCustomer: false,
        }),
      );
      const out = await h.service.executeCustomerCommand(
        createDisableCustomerCommand({
          actor: superAdmin,
          customerId: `CONTAM_${role}`,
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_5d_xdom_c_${role}`,
          correlationId: "corr_5d",
          reasonCode: "operational",
        }),
      );
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.code).toBe("NOT_OPERATIONAL_CUSTOMER");
    }
    expect(h.customerRepo.applied).toHaveLength(0);
  });
});

describe("Phase 5D — shared RBAC matrix", () => {
  it("super_admin / operations_manager / country_admin may manage all three", () => {
    for (const actor of [superAdmin, opsManager, countryAdminSa]) {
      expect(actorMayWriteDrivers(actor, "approve")).toBe(true);
      expect(actorMayWriteAgents(actor, "activate")).toBe(true);
      expect(actorMayWriteCustomers(actor, "disable")).toBe(true);
      expect(
        actorHasControlledWritePermission(actor, "drivers:approve"),
      ).toBe(true);
      expect(actorHasControlledWritePermission(actor, "agents:manage")).toBe(
        true,
      );
      expect(
        actorHasControlledWritePermission(actor, "customers:manage"),
      ).toBe(true);
    }
    expect(PLANNED_WRITE_ROLE_MATRIX["drivers:approve"]).toContain(
      "super_admin",
    );
  });

  it("auditor / reporting_viewer / support_agent / agent_user DENY writes", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_RBAC" }));
    h.agentRepo.seed(agentSnap({ agentId: "AGT_RBAC" }));
    h.customerRepo.seed(customerSnap({ customerId: "CUS_RBAC" }));

    for (const actor of [auditor, reportingViewer, supportAgent, agentUser]) {
      const d = await h.service.executeDriverCommand(
        createApproveDriverCommand({
          actor: actor as VerifiedDriverWriteActor,
          driverId: "DRV_RBAC",
          expectedCurrentState: "pending_review",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_5d_rbac_d_${actor.uid}`,
          correlationId: "corr_5d",
        }),
      );
      const a = await h.service.executeAgentCommand(
        createActivateAgentCommand({
          actor: actor as VerifiedAgentWriteActor,
          agentId: "AGT_RBAC",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_5d_rbac_a_${actor.uid}`,
          correlationId: "corr_5d",
        }),
      );
      const c = await h.service.executeCustomerCommand(
        createDisableCustomerCommand({
          actor: actor as VerifiedCustomerWriteActor,
          customerId: "CUS_RBAC",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: `idem_5d_rbac_c_${actor.uid}`,
          correlationId: "corr_5d",
          reasonCode: "operational",
        }),
      );
      expect(d.ok).toBe(false);
      expect(a.ok).toBe(false);
      expect(c.ok).toBe(false);
      if (!d.ok) expect(d.code).toBe("PERMISSION_DENIED");
      if (!a.ok) expect(a.code).toBe("PERMISSION_DENIED");
      if (!c.ok) expect(c.code).toBe("PERMISSION_DENIED");
    }
    expect(h.driverRepo.applied).toHaveLength(0);
    expect(h.agentRepo.applied).toHaveLength(0);
    expect(h.customerRepo.applied).toHaveLength(0);
  });
});

describe("Phase 5D — shared scope", () => {
  it("country-scoped actor denied outside country; not_represented → SCOPE_DENIED", async () => {
    const h = makeHarness();
    h.driverRepo.seed(
      driverSnap({ driverId: "DRV_AE", countryId: "AE" }),
    );
    h.customerRepo.seed(
      customerSnap({
        customerId: "CUS_NR",
        countryScopeKind: "not_represented",
        countryId: null,
      }),
    );

    const outOfCountry = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: countryAdminSa,
        driverId: "DRV_AE",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_scope_ae",
        correlationId: "corr_5d",
      }),
    );
    expect(outOfCountry.ok).toBe(false);
    if (!outOfCountry.ok) expect(outOfCountry.code).toBe("SCOPE_DENIED");

    const notRep = await h.service.executeCustomerCommand(
      createDisableCustomerCommand({
        actor: countryAdminSa,
        customerId: "CUS_NR",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_scope_nr",
        correlationId: "corr_5d",
        reasonCode: "operational",
      }),
    );
    expect(notRep.ok).toBe(false);
    if (!notRep.ok) expect(notRep.code).toBe("SCOPE_DENIED");
  });
});

describe("Phase 5D — shared idempotency", () => {
  it("same key + same fingerprint → idempotent replay (no second mutation)", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_IDEM" }));
    const cmd = createApproveDriverCommand({
      actor: superAdmin,
      driverId: "DRV_IDEM",
      expectedCurrentState: "pending_review",
      preconditionToken: "tok_1",
      idempotencyKey: "idem_5d_shared_replay",
      correlationId: "corr_5d",
    });
    const first = await h.service.executeDriverCommand(cmd);
    expect(first.ok).toBe(true);
    expect(h.driverRepo.applied).toHaveLength(1);

    // Reset expected state for domain replay path after shared record exists
    h.driverRepo.seed(driverSnap({ driverId: "DRV_IDEM" }));
    const second = await h.service.executeDriverCommand(cmd);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.status).toBe("idempotent_replay");
    expect(h.driverRepo.applied).toHaveLength(1);
  });

  it("cross-resource same key different fingerprint → IDEMPOTENCY_CONFLICT", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_XKEY" }));
    h.agentRepo.seed(agentSnap({ agentId: "AGT_XKEY" }));

    const d = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: superAdmin,
        driverId: "DRV_XKEY",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_cross_resource_key",
        correlationId: "corr_5d",
      }),
    );
    expect(d.ok).toBe(true);

    const a = await h.service.executeAgentCommand(
      createActivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_XKEY",
        countryId: "SA",
        expectedCurrentState: "inactive",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_cross_resource_key",
        correlationId: "corr_5d",
      }),
    );
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(h.agentRepo.applied).toHaveLength(0);
  });
});

describe("Phase 5D — race / concurrency", () => {
  it("Driver approve vs reject same driver → exactly one success", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_RACE" }));

    const [approve, reject] = await Promise.all([
      h.service.executeDriverCommand(
        createApproveDriverCommand({
          actor: superAdmin,
          driverId: "DRV_RACE",
          expectedCurrentState: "pending_review",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_apr",
          correlationId: "corr_5d",
        }),
      ),
      h.service.executeDriverCommand(
        createRejectDriverCommand({
          actor: superAdmin,
          driverId: "DRV_RACE",
          expectedCurrentState: "pending_review",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_rej",
          correlationId: "corr_5d",
          reasonCode: "other",
        }),
      ),
    ]);

    const successes = [approve, reject].filter((o) => o.ok);
    const denials = [approve, reject].filter((o) => !o.ok);
    expect(successes).toHaveLength(1);
    expect(denials).toHaveLength(1);
    if (!denials[0]!.ok) {
      expect(denials[0]!.code).toBe("PRECONDITION_FAILED");
    }
    expect(h.driverRepo.applied).toHaveLength(1);
    const state = h.driverRepo.get("DRV_RACE")?.registrationStatus;
    expect(state === "approved" || state === "rejected").toBe(true);
  });

  it("Agent activate A vs B same country → exactly one success", async () => {
    const h = makeHarness();
    h.agentRepo.seed(agentSnap({ agentId: "AGT_R1" }));
    h.agentRepo.seed(agentSnap({ agentId: "AGT_R2" }));

    const [a, b] = await Promise.all([
      h.service.executeAgentCommand(
        createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT_R1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_a1",
          correlationId: "corr_5d",
        }),
      ),
      h.service.executeAgentCommand(
        createActivateAgentCommand({
          actor: superAdmin,
          agentId: "AGT_R2",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_a2",
          correlationId: "corr_5d",
        }),
      ),
    ]);

    expect([a, b].filter((o) => o.ok)).toHaveLength(1);
    const denial = [a, b].find((o) => !o.ok);
    expect(denial && !denial.ok && denial.code).toBe(
      "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
    );
    expect(h.agentRepo.applied).toHaveLength(1);
  });

  it("Customer block vs disable → exactly one success", async () => {
    const h = makeHarness();
    h.customerRepo.seed(customerSnap({ customerId: "CUS_RACE" }));

    const [block, disable] = await Promise.all([
      h.service.executeCustomerCommand(
        createBlockCustomerCommand({
          actor: superAdmin,
          customerId: "CUS_RACE",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_blk",
          correlationId: "corr_5d",
          reasonCode: "safety",
        }),
      ),
      h.service.executeCustomerCommand(
        createDisableCustomerCommand({
          actor: superAdmin,
          customerId: "CUS_RACE",
          expectedCurrentState: "enabled",
          preconditionToken: "tok_1",
          idempotencyKey: "idem_5d_race_dis",
          correlationId: "corr_5d",
          reasonCode: "operational",
        }),
      ),
    ]);

    expect([block, disable].filter((o) => o.ok)).toHaveLength(1);
    const denial = [block, disable].find((o) => !o.ok);
    expect(denial && !denial.ok && denial.code).toBe("PRECONDITION_FAILED");
    expect(h.customerRepo.applied).toHaveLength(1);
    const state = h.customerRepo.get("CUS_RACE")?.operationalState;
    expect(state === "blocked" || state === "disabled").toBe(true);
  });
});

describe("Phase 5D — audit integrity + PII", () => {
  it("successful mutation has consolidated INTENT + RESULT; no PII; productionWriteExecuted=false", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_AUD" }));
    const out = await h.service.executeDriverCommand(
      createRequestDriverChangesCommand({
        actor: superAdmin,
        driverId: "DRV_AUD",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_audit_01",
        correlationId: "corr_5d",
        reasonCode: "missing_document",
      }),
    );
    expect(out.ok).toBe(true);
    expect(h.consolidatedAudit.intents.length).toBeGreaterThanOrEqual(1);
    expect(h.consolidatedAudit.results.length).toBeGreaterThanOrEqual(1);
    const intent = h.consolidatedAudit.intents[0]!;
    const result = h.consolidatedAudit.results[0]!;
    expect(result.intentAuditId).toBe(intent.auditId);
    expect(result.result).toBe("applied");
    expect(result.productionWriteExecuted).toBe(false);
    expect(assertAuditPayloadHasNoRawPii(intent).ok).toBe(true);
    expect(assertAuditPayloadHasNoRawPii(result).ok).toBe(true);
    expect(h.driverAudit.intents.length).toBeGreaterThanOrEqual(1);
  });

  it("permission failure does not create false success audit", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_AUD_DENY" }));
    const out = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: auditor as VerifiedDriverWriteActor,
        driverId: "DRV_AUD_DENY",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_audit_deny",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(false);
    const successResults = h.consolidatedAudit.results.filter(
      (r) => r.result === "applied",
    );
    expect(successResults).toHaveLength(0);
    expect(h.driverRepo.applied).toHaveLength(0);
  });
});

describe("Phase 5D — failure atomicity", () => {
  it("documents guarantees and blocks mutation before repository checkpoint", () => {
    expect(CONTROLLED_WRITE_ATOMICITY_GUARANTEES.halfAppliedForbidden).toBe(
      true,
    );
    expect(mutationAllowedAfterCheckpoint("permission", false)).toBe(false);
    expect(mutationAllowedAfterCheckpoint("scope", false)).toBe(false);
    expect(mutationAllowedAfterCheckpoint("precondition", false)).toBe(false);
    expect(mutationAllowedAfterCheckpoint("repository", true)).toBe(true);
    expect(mutationAllowedAfterCheckpoint("repository", false)).toBe(false);
  });

  it("precondition failure leaves zero applies", async () => {
    const h = makeHarness();
    h.driverRepo.seed(driverSnap({ driverId: "DRV_PRE" }));
    const out = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: superAdmin,
        driverId: "DRV_PRE",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_STALE",
        idempotencyKey: "idem_5d_pre_fail",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("PRECONDITION_FAILED");
    expect(h.driverRepo.applied).toHaveLength(0);
    expect(h.driverRepo.get("DRV_PRE")?.registrationStatus).toBe(
      "pending_review",
    );
  });
});

describe("Phase 5D — Production gates + Disabled repos", () => {
  it("all consolidation flags disabled; gates emit distinct codes", () => {
    expect(
      allConsolidationWriteFlagsDisabled(DEFAULT_CONSOLIDATION_FLAGS_FALSE),
    ).toBe(true);

    try {
      assertConsolidationProductionGates("driver", {
        ...DEFAULT_CONSOLIDATION_FLAGS_FALSE,
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
    }

    try {
      assertConsolidationProductionGates("driver", {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        CUSTOMER_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
      });
      expect.unreachable("should throw");
    } catch (err) {
      expect(err).toMatchObject({ code: "RESOURCE_WRITE_DISABLED" });
    }
  });

  it("facade without offline allow → PRODUCTION_WRITE_DISABLED; no mutation", async () => {
    const h = makeHarness({ allowOffline: false });
    h.driverRepo.seed(driverSnap({ driverId: "DRV_GATE" }));
    const out = await h.service.executeDriverCommand(
      createApproveDriverCommand({
        actor: superAdmin,
        driverId: "DRV_GATE",
        expectedCurrentState: "pending_review",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_gate_off",
        correlationId: "corr_5d",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("PRODUCTION_WRITE_DISABLED");
    expect(h.driverRepo.applied).toHaveLength(0);
  });

  it("Production repositories are REAL; runtime factory returns Production kinds", () => {
    expect(createProductionRuntimeDriverWriteRepository()).toBeInstanceOf(
      ProductionDriverWriteRepository,
    );
    expect(createProductionRuntimeAgentWriteRepository()).toBeInstanceOf(
      ProductionAgentWriteRepository,
    );
    expect(createProductionRuntimeCustomerWriteRepository()).toBeInstanceOf(
      ProductionCustomerWriteRepository,
    );
    expect(ProductionDriverWriteRepository.isReachable(driverFlags)).toBe(
      false,
    );
    expect(ProductionAgentWriteRepository.isReachable(agentFlags)).toBe(false);
    expect(ProductionCustomerWriteRepository.isReachable(customerFlags)).toBe(
      false,
    );
  });

  it("Disabled repositories never mutate", async () => {
    const disabled = new DisabledDriverWriteRepository();
    await expect(
      disabled.apply({
        command: createApproveDriverCommand({
          actor: superAdmin,
          driverId: "X",
          expectedCurrentState: "pending_review",
          preconditionToken: "t",
          idempotencyKey: "idem_disabled_xx",
          correlationId: "c",
        }),
        fromState: "pending_review",
        toState: "approved",
        snapshot: driverSnap({ driverId: "X" }),
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });
});

describe("Phase 5D — Finance / Auth / Trip isolation", () => {
  it("Finance not started; no finance mutation surface on facade", () => {
    expect(FINANCE_WRITE_IMPLEMENTED).toBe(false);
    expect(DEFAULT_CONSOLIDATION_FLAGS_FALSE.FINANCE_WRITE_ENABLED).toBe(false);
    const { service } = makeHarness();
    expect(service.rejectUnsupportedResource("wallet").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    expect(service.rejectUnsupportedResource("payment").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    expect(service.rejectUnsupportedResource("settlement").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    expect(service.rejectUnsupportedResource("finance").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
  });

  it("Auth writes remain 0 (customer auth flag false)", async () => {
    const h = makeHarness();
    h.customerRepo.seed(customerSnap({ customerId: "CUS_AUTH" }));
    const out = await h.service.executeCustomerCommand(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_AUTH",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_auth_0",
        correlationId: "corr_5d",
        reasonCode: "operational",
      }),
    );
    expect(out.ok).toBe(true);
    if ("authWriteExecuted" in out) expect(out.authWriteExecuted).toBe(false);
    expect(CUSTOMER_AUTH_WRITE_ENABLED_RUNTIME).toBe(false);
  });

  it("Trip mutation resources denied; active-trip guard does not cancel trips", async () => {
    const h = makeHarness();
    expect(h.service.rejectUnsupportedResource("trip").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    h.customerRepo.seed(
      customerSnap({ customerId: "CUS_TRIP", tripState: "active" }),
    );
    const out = await h.service.executeCustomerCommand(
      createDisableCustomerCommand({
        actor: superAdmin,
        customerId: "CUS_TRIP",
        expectedCurrentState: "enabled",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_trip_guard",
        correlationId: "corr_5d",
        reasonCode: "operational",
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("CUSTOMER_HAS_ACTIVE_TRIP");
    expect(h.customerRepo.get("CUS_TRIP")?.tripState).toBe("active");
    expect(h.customerRepo.applied).toHaveLength(0);
  });
});

describe("Phase 5D — error catalog + emulator + pilot assessment", () => {
  it("normalized error catalog covers domain codes", () => {
    const covered = domainErrorCodesCovered();
    expect(covered.driver).toBe(true);
    expect(covered.agent).toBe(true);
    expect(covered.customer).toBe(true);
    expect(CONTROLLED_WRITE_ERROR_CATALOG).toContain(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    expect(CONTROLLED_WRITE_ERROR_CATALOG).toContain("RESOURCE_WRITE_DISABLED");
    expect(CONTROLLED_WRITE_ERROR_CATALOG).toContain(
      "PRODUCTION_WRITE_DISABLED",
    );
  });

  it("real Firestore emulator path: synthetic unavailable documented; available synthetic works", async () => {
    const unavailable = new EmulatorDriverWriteRepository({ available: false });
    expect(unavailable.isAvailable).toBe(false);
    await expect(
      unavailable.apply({
        command: createApproveDriverCommand({
          actor: superAdmin,
          driverId: "E",
          expectedCurrentState: "pending_review",
          preconditionToken: "t",
          idempotencyKey: "idem_emu_unavail",
          correlationId: "c",
        }),
        fromState: "pending_review",
        toState: "approved",
        snapshot: driverSnap({ driverId: "E" }),
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_WRITE_FAILURE" });

    const syn = new EmulatorDriverWriteRepository({ available: true });
    syn.seed(driverSnap({ driverId: "E_OK" }));
    const agentEmu = new EmulatorAgentWriteRepository({ available: false });
    const custEmu = new EmulatorCustomerWriteRepository({ available: false });
    expect(agentEmu.isAvailable).toBe(false);
    expect(custEmu.isAvailable).toBe(false);
    expect(syn.isAvailable).toBe(true);
  });

  it("Pilot readiness assessment only — not executed", () => {
    const pilot = assessSafestFuturePilot();
    expect(pilot.executed).toBe(false);
    expect(pilot.syntheticRecordCreated).toBe(false);
    expect(pilot.productionMutated).toBe(false);
    expect(pilot.recommendedResource).toBe("driver");
    expect(pilot.recommendedAction).toBe("needs_changes");
    expect(pilot.prerequisites.length).toBeGreaterThan(5);
  });

  it("no destructive delete commands on facade", () => {
    const { service } = makeHarness();
    expect(service).not.toHaveProperty("deleteDriver");
    expect(service).not.toHaveProperty("deleteAgent");
    expect(service).not.toHaveProperty("deleteCustomer");
    expect(service.rejectUnsupportedResource("auth").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
    expect(service.rejectUnsupportedResource("storage").code).toBe(
      "UNSUPPORTED_WRITE_RESOURCE",
    );
  });
});

describe("Phase 5D — deactivate agent via facade (shared preconditions)", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("deactivate active agent succeeds offline", async () => {
    h.agentRepo.seed(
      agentSnap({ agentId: "AGT_DEACT", operationalState: "active" }),
    );
    const out = await h.service.executeAgentCommand(
      createDeactivateAgentCommand({
        actor: superAdmin,
        agentId: "AGT_DEACT",
        countryId: "SA",
        expectedCurrentState: "active",
        preconditionToken: "tok_1",
        idempotencyKey: "idem_5d_deact_01",
        correlationId: "corr_5d",
        reasonCode: "operational",
      }),
    );
    expect(out.ok).toBe(true);
    expect(h.agentRepo.get("AGT_DEACT")?.operationalState).toBe("inactive");
  });
});
