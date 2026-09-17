/**
 * Phase 5 — Controlled Writes readiness (offline contracts only).
 * Production calls = 0. Production writes = 0. Finance not started.
 */

import { describe, expect, it } from "vitest";
import {
  AGENT_WRITE_CANDIDATES,
  CUSTOMER_WRITE_CANDIDATES,
  DEFERRED_CONTROLLED_WRITE_ACTIONS,
  DRIVER_WRITE_CANDIDATES,
  CONTROLLED_WRITES_ENABLED_HARD_FALSE,
  CONTROLLED_WRITE_PERMISSION_BY_ACTION,
  CONTROLLED_WRITE_TRANSACTION_STRATEGY,
  FAKE_EMULATOR_VALIDATION_PLAN,
  FakeOfflineControlledWriteRepository,
  InMemoryIdempotencyStore,
  ProductionDisabledControlledWriteRepository,
  allControlledWriteFlagsDisabled,
  assertAuditPayloadHasNoRawPii,
  assertControlledWriteFlagsAllow,
  defaultDeniedPipelineDeps,
  evaluateControlledWritePreconditions,
  isControlledWriteCandidate,
  isDeferredControlledWriteAction,
  requiredPermissionFor,
  runControlledWritePipeline,
  scoreControlledWritesReadiness,
  snapshotWriteFlags,
  type ControlledWriteActor,
  type ControlledWriteCommand,
  type ControlledWriteFlagSnapshot,
} from "@/application/controlled-writes";
import {
  derivePhase4BWriteReadinessFlags,
  isControlledWritesEnabled,
} from "@/application/shadow-validation";

const ALL_FLAGS_FALSE: ControlledWriteFlagSnapshot = {
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
};

const superAdmin: ControlledWriteActor = {
  uid: "actor_sa",
  role: "super_admin",
  permissions: [
    "drivers:approve",
    "drivers:read",
    "agents:read",
    "customers:read",
  ],
  scope: { type: "global" },
};

const countryAdminSa: ControlledWriteActor = {
  uid: "actor_ca",
  role: "country_admin",
  permissions: ["drivers:approve", "drivers:read"],
  scope: { type: "country", countryIds: ["SA"] },
};

const auditor: ControlledWriteActor = {
  uid: "actor_aud",
  role: "auditor",
  permissions: ["audit:read", "drivers:read"],
  scope: { type: "global" },
};

function cmd(
  partial: Partial<ControlledWriteCommand> &
    Pick<ControlledWriteCommand, "resource" | "action" | "resourceId">,
): ControlledWriteCommand {
  return {
    countryId: "SA",
    idempotencyKey: `idem_${partial.resource}_${partial.action}_001`,
    correlationId: "corr_phase5_test",
    reasonCode: "test",
    expected: { preconditionToken: "tok_1" },
    ...partial,
  };
}

describe("Phase 5 Controlled Writes — flags & semantics", () => {
  it("hard-locks controlledWritesEnabled and keeps all write flags false", () => {
    expect(CONTROLLED_WRITES_ENABLED_HARD_FALSE).toBe(false);
    expect(allControlledWriteFlagsDisabled(ALL_FLAGS_FALSE)).toBe(true);
    expect(isControlledWritesEnabled()).toBe(false);

    const gate = assertControlledWriteFlagsAllow("driver", ALL_FLAGS_FALSE);
    expect(gate.ok).toBe(false);
    expect(gate.code).toMatch(/WRITE|DISABLED/);
  });

  it("allows when resource flags are true (env gates are the only Production arm)", () => {
    const flags: ControlledWriteFlagSnapshot = {
      ...ALL_FLAGS_FALSE,
      PRODUCTION_WRITE_ENABLED: true,
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      DRIVER_WRITE_ENABLED: true,
    };
    const gate = assertControlledWriteFlagsAllow("driver", flags);
    expect(gate.ok).toBe(true);
  });

  it("Phase 4B PASS → eligible A true, B false", () => {
    const flags = derivePhase4BWriteReadinessFlags({
      overallStatus: "PASS",
      productionWrites: 0,
      killSwitchPass: true,
      writeTrapsPass: true,
    });
    expect(flags.shadowValidationPassed).toBe(true);
    expect(flags.eligibleForControlledWritesPhase).toBe(true);
    expect(flags.controlledWritesEnabled).toBe(false);
    expect(flags.readyForControlledWrites).toBe(true);
  });
});

describe("Phase 5 Controlled Writes — candidates & deferrals", () => {
  it("lists low-risk Driver / Agent / Customer candidates", () => {
    expect([...DRIVER_WRITE_CANDIDATES]).toEqual([
      "approve",
      "reject",
      "needs_changes",
      "suspend",
    ]);
    expect([...AGENT_WRITE_CANDIDATES]).toEqual([
      "activate",
      "deactivate",
      "suspend",
    ]);
    expect([...CUSTOMER_WRITE_CANDIDATES]).toEqual([
      "disable",
      "block",
      "reactivate",
    ]);
    expect(isControlledWriteCandidate("driver", "approve")).toBe(true);
    expect(isControlledWriteCandidate("agent", "activate")).toBe(true);
    expect(isControlledWriteCandidate("customer", "disable")).toBe(true);
  });

  it("defers delete, country reassignment, wallet, finance, UI→Firestore", () => {
    expect(isDeferredControlledWriteAction("driver.delete")).toBe(true);
    expect(isDeferredControlledWriteAction("agent.country_reassignment")).toBe(
      true,
    );
    expect(isDeferredControlledWriteAction("finance.settlement")).toBe(true);
    expect(isDeferredControlledWriteAction("wallet.any")).toBe(true);
    expect(isDeferredControlledWriteAction("ui_direct_firestore")).toBe(true);
    expect(DEFERRED_CONTROLLED_WRITE_ACTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("maps RBAC permissions for each candidate", () => {
    expect(requiredPermissionFor("driver", "approve")).toBe("drivers:approve");
    expect(requiredPermissionFor("agent", "activate")).toBe("agents:manage");
    expect(requiredPermissionFor("customer", "block")).toBe("customers:manage");
    expect(Object.keys(CONTROLLED_WRITE_PERMISSION_BY_ACTION)).toHaveLength(
      DRIVER_WRITE_CANDIDATES.length +
        AGENT_WRITE_CANDIDATES.length +
        CUSTOMER_WRITE_CANDIDATES.length,
    );
  });
});

describe("Phase 5 Controlled Writes — preconditions", () => {
  it("driver approve requires pending_review|needs_changes", () => {
    const ok = evaluateControlledWritePreconditions(
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      {
        resource: "driver",
        resourceId: "DRV1",
        countryId: "SA",
        exists: true,
        observed: {
          registrationStatus: "pending_review",
          preconditionToken: "tok_1",
        },
      },
    );
    expect(ok.ok).toBe(true);

    const bad = evaluateControlledWritePreconditions(
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      {
        resource: "driver",
        resourceId: "DRV1",
        countryId: "SA",
        exists: true,
        observed: { registrationStatus: "approved", preconditionToken: "tok_1" },
      },
    );
    expect(bad.ok).toBe(false);
    expect(bad.code).toBe("PRECONDITION_FAILED");
  });

  it("agent activate DENY when another active agent exists (no auto-deactivate)", () => {
    const result = evaluateControlledWritePreconditions(
      cmd({ resource: "agent", action: "activate", resourceId: "AGT_NEW" }),
      {
        resource: "agent",
        resourceId: "AGT_NEW",
        countryId: "SA",
        exists: true,
        observed: {
          agentAccountState: "enabled",
          agentOperationalActive: false,
          preconditionToken: "tok_1",
        },
        otherAgentsInCountry: [
          {
            id: "AGT_OLD",
            name: "Existing",
            countryId: "SA",
            status: "active",
            commissionPlaceholder: "n/a",
            driversCount: 0,
            tripsCount: 0,
            activeFromUtc: null,
            activeToUtc: null,
            createdAtUtc: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("AGENT_COUNTRY_ACTIVE_CONFLICT");
    expect(result.detail).toMatch(/no auto-deactivate/i);
  });

  it("customer reactivate DENY when account unknown", () => {
    const result = evaluateControlledWritePreconditions(
      cmd({
        resource: "customer",
        action: "reactivate",
        resourceId: "CUS1",
      }),
      {
        resource: "customer",
        resourceId: "CUS1",
        countryId: "SA",
        exists: true,
        observed: {
          customerAccountState: "unknown",
          preconditionToken: "tok_1",
        },
      },
    );
    expect(result.ok).toBe(false);
  });

  it("preconditionToken mismatch → concurrency deny", () => {
    const result = evaluateControlledWritePreconditions(
      cmd({
        resource: "driver",
        action: "suspend",
        resourceId: "DRV1",
        expected: { preconditionToken: "tok_A" },
      }),
      {
        resource: "driver",
        resourceId: "DRV1",
        countryId: "SA",
        exists: true,
        observed: {
          registrationStatus: "approved",
          accountEnabled: "enabled",
          preconditionToken: "tok_B",
        },
      },
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/preconditionToken/i);
  });
});

describe("Phase 5 Controlled Writes — pipeline (offline)", () => {
  it("Production path denies with DisabledWriteRepository (writes=0)", async () => {
    const outcome = await runControlledWritePipeline(
      superAdmin,
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      defaultDeniedPipelineDeps(ALL_FLAGS_FALSE),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.productionWriteExecuted).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toMatch(/WRITE|DISABLED|GLOBAL/);
    }
  });

  it("RBAC denies auditor for driver approve even in fake offline", async () => {
    const outcome = await runControlledWritePipeline(
      auditor,
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      {
        flags: ALL_FLAGS_FALSE,
        idempotency: new InMemoryIdempotencyStore(),
        repository: new FakeOfflineControlledWriteRepository(),
        allowFakeOfflineExecution: true,
        loadPrecondition: async () => ({
          resource: "driver",
          resourceId: "DRV1",
          countryId: "SA",
          exists: true,
          observed: {
            registrationStatus: "pending_review",
            preconditionToken: "tok_1",
          },
        }),
      },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("RBAC_DENIED");
    }
    expect(outcome.productionWriteExecuted).toBe(false);
  });

  it("scope denies country_admin outside assigned country", async () => {
    const outcome = await runControlledWritePipeline(
      countryAdminSa,
      cmd({
        resource: "driver",
        action: "approve",
        resourceId: "DRV1",
        countryId: "AE",
      }),
      {
        flags: ALL_FLAGS_FALSE,
        idempotency: new InMemoryIdempotencyStore(),
        repository: new FakeOfflineControlledWriteRepository(),
        allowFakeOfflineExecution: true,
        loadPrecondition: async () => ({
          resource: "driver",
          resourceId: "DRV1",
          countryId: "AE",
          exists: true,
          observed: {
            registrationStatus: "pending_review",
            preconditionToken: "tok_1",
          },
        }),
      },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SCOPE_DENIED");
    }
  });

  it("fake offline happy path: audit intent+result, idempotent replay, no Production write", async () => {
    const repo = new FakeOfflineControlledWriteRepository();
    const store = new InMemoryIdempotencyStore();
    const audits: unknown[] = [];
    const deps = {
      flags: ALL_FLAGS_FALSE,
      idempotency: store,
      repository: repo,
      allowFakeOfflineExecution: true,
      loadPrecondition: async () => ({
        resource: "driver" as const,
        resourceId: "DRV1",
        countryId: "SA",
        exists: true,
        observed: {
          registrationStatus: "pending_review",
          accountEnabled: "enabled" as const,
          preconditionToken: "tok_1",
        },
      }),
      recordAuditIntent: async (i: unknown) => {
        audits.push(i);
      },
      recordAuditResult: async (r: unknown) => {
        audits.push(r);
      },
    };

    const first = await runControlledWritePipeline(
      superAdmin,
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      deps,
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.status).toBe("applied");
    expect(first.productionWriteExecuted).toBe(false);
    expect(repo.applied).toHaveLength(1);

    const replay = await runControlledWritePipeline(
      superAdmin,
      cmd({ resource: "driver", action: "approve", resourceId: "DRV1" }),
      deps,
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.status).toBe("idempotent_replay");
    expect(repo.applied).toHaveLength(1);
    expect(audits.length).toBeGreaterThanOrEqual(4);
    for (const a of audits) {
      expect(assertAuditPayloadHasNoRawPii(a).ok).toBe(true);
    }
  });

  it("ProductionDisabledControlledWriteRepository always throws", async () => {
    const repo = new ProductionDisabledControlledWriteRepository();
    await expect(
      repo.apply({
        actor: superAdmin,
        command: cmd({
          resource: "agent",
          action: "activate",
          resourceId: "AGT1",
        }),
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
  });

  it("audit rejects raw PII keys", () => {
    const bad = assertAuditPayloadHasNoRawPii({
      phone: "+966500000000",
      resourceId: "CUS1",
    });
    expect(bad.ok).toBe(false);
  });
});

describe("Phase 5 Controlled Writes — readiness score & plan", () => {
  it("scores GO for future implementation when architecture ready (not activation)", () => {
    const report = scoreControlledWritesReadiness({
      shadowValidationPassed: true,
      eligibleForControlledWritesPhase: true,
      controlledWritesEnabled: false,
      writeFlags: snapshotWriteFlags(ALL_FLAGS_FALSE),
      architectureContractsPresent: true,
      offlinePipelineTestsPass: true,
      financeExcluded: true,
      productionCalls: 0,
      productionWrites: 0,
    });
    expect(report.controlledWritesEnabled).toBe(false);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.verdict).toBe("GO");
  });

  it("documents transaction strategy + fake/emulator plan (no Production write tests)", () => {
    expect(CONTROLLED_WRITE_TRANSACTION_STRATEGY.blindOverwrite).toBe(false);
    expect(
      CONTROLLED_WRITE_TRANSACTION_STRATEGY.productionTransactionsImplemented,
    ).toBe(false);
    expect(
      CONTROLLED_WRITE_TRANSACTION_STRATEGY.agentActivatePolicy,
    ).toBe("deny_if_other_active_no_auto_deactivate");
    expect(FAKE_EMULATOR_VALIDATION_PLAN.join(" ")).toMatch(
      /Production write tests: NOT RUN/i,
    );
    expect(FAKE_EMULATOR_VALIDATION_PLAN.join(" ")).toMatch(/Finance/i);
  });
});
