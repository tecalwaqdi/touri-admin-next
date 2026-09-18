/**
 * REAL Production write adapters — gates OFF by default; Fake only offline.
 * No Production network mutation in these tests.
 */

import { describe, expect, it } from "vitest";
import {
  listNonRealProductionAdapters,
  PRODUCTION_WRITE_ADAPTER_MATRIX,
} from "@/infrastructure/production/writes/ProductionWriteAdapterMatrix";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { WRITE_PRINCIPALS } from "@/infrastructure/production/writes/ProductionWritePrincipals";
import {
  ProductionDriverWriteRepository,
  createProductionRuntimeDriverWriteRepository,
} from "@/application/controlled-writes/drivers/DriverWriteRepository";
import {
  ProductionAgentWriteRepository,
  FakeAgentWriteRepository,
  createProductionRuntimeAgentWriteRepository,
} from "@/application/controlled-writes/agents/AgentWriteRepository";
import {
  ProductionCustomerWriteRepository,
  createProductionRuntimeCustomerWriteRepository,
} from "@/application/controlled-writes/customers/CustomerWriteRepository";
import { createApproveDriverCommand } from "@/application/controlled-writes/drivers/DriverWriteCommands";
import { createActivateAgentCommand } from "@/application/controlled-writes/agents/AgentWriteCommands";
import { createDisableCustomerCommand } from "@/application/controlled-writes/customers/CustomerWriteCommands";
import { ProductionIdentityWriteRepository } from "@/application/controlled-writes/identity/IdentityWriteRepository";
import {
  ProductionGeographyWriteRepository,
  ProductionP0MasterWriteRepository,
  ProductionSupportWriteRepository,
} from "@/infrastructure/production/writes/ProductionDomainWriteRepositories";
import { createProductionFinanceWriteGate } from "@/application/finance/FinanceWriteGate";

const superAdmin = {
  uid: "admin1",
  role: "super_admin" as const,
  permissions: [
    "drivers:approve",
    "agents:manage",
    "customers:manage",
    "users:manage",
  ] as const,
  scope: { type: "global" as const },
};

function agentSnap(
  id: string,
  state: "inactive" | "active",
  tok: string,
): import("@/application/controlled-writes/agents/AgentWriteTypes").AgentWriteSnapshot {
  return {
    agentId: id,
    exists: true,
    isOperationalAgent: true,
    excludedNonAgent: false,
    operationalState: state,
    accountEnabled: "enabled",
    countryId: "SA",
    countryScopeKind: "mapped",
    preconditionToken: tok,
  };
}

const FLAGS_OFF = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
  GEOGRAPHY_WRITE_ENABLED: false,
  REGION_WRITE_ENABLED: false,
  VEHICLE_CATALOG_WRITE_ENABLED: false,
  PARTNER_WRITE_ENABLED: false,
  FLEET_WRITE_ENABLED: false,
  GUIDE_WRITE_ENABLED: false,
  SUPPORT_WRITE_ENABLED: false,
  NOTIFICATION_WRITE_ENABLED: false,
  ADMIN_IDENTITY_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
} as const;

const FLAGS_ON = {
  ...FLAGS_OFF,
  GLOBAL_PRODUCTION_WRITE_ENABLED: true,
  PRODUCTION_WRITE_ENABLED: true,
  DRIVER_WRITE_ENABLED: true,
  AGENT_WRITE_ENABLED: true,
  CUSTOMER_WRITE_ENABLED: true,
  GEOGRAPHY_WRITE_ENABLED: true,
  REGION_WRITE_ENABLED: true,
  VEHICLE_CATALOG_WRITE_ENABLED: true,
  PARTNER_WRITE_ENABLED: true,
  FLEET_WRITE_ENABLED: true,
  GUIDE_WRITE_ENABLED: true,
  SUPPORT_WRITE_ENABLED: true,
  NOTIFICATION_WRITE_ENABLED: true,
  ADMIN_IDENTITY_WRITE_ENABLED: true,
  FINANCE_WRITE_ENABLED: true,
} as const;

describe("Production write adapter matrix", () => {
  it("classifies every legitimate domain as REAL", () => {
    expect(listNonRealProductionAdapters()).toEqual([]);
    expect(PRODUCTION_WRITE_ADAPTER_MATRIX.every((r) => r.adapterClass === "REAL")).toBe(
      true,
    );
    expect(PRODUCTION_WRITE_ADAPTER_MATRIX.every((r) => r.gateDefault === false)).toBe(
      true,
    );
  });

  it("never uses shadow-reader as a write principal", () => {
    expect(WRITE_PRINCIPALS.shadow_reader.mayWrite).toBe(false);
    expect(WRITE_PRINCIPALS.identity_admin.email).not.toBe(
      WRITE_PRINCIPALS.shadow_reader.email,
    );
    expect(WRITE_PRINCIPALS.driver_review.email).not.toBe(
      WRITE_PRINCIPALS.shadow_reader.email,
    );
  });
});

describe("Production runtime factories", () => {
  it("return REAL production kinds (not Disabled/Fake)", () => {
    expect(createProductionRuntimeDriverWriteRepository(FLAGS_OFF).kind).toBe(
      "production_driver_write",
    );
    expect(createProductionRuntimeAgentWriteRepository(FLAGS_OFF).kind).toBe(
      "production_agent_write",
    );
    expect(createProductionRuntimeCustomerWriteRepository(FLAGS_OFF).kind).toBe(
      "production_customer_write",
    );
  });

  it("deny with gates OFF without mutation", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("user", "DRV1", { registration_status: "pending_review", ismndob: true });
    const repo = new ProductionDriverWriteRepository(FLAGS_OFF, port);
    await expect(
      repo.apply({
        command: createApproveDriverCommand({
          actor: superAdmin as never,
          driverId: "DRV1",
          expectedCurrentState: "pending_review",
          preconditionToken: "tok",
          idempotencyKey: "k1",
          correlationId: "c1",
        }),
        snapshot: {
          driverId: "DRV1",
          exists: true,
          isOperationalDriver: true,
          registrationStatus: "pending_review",
          accountEnabled: "enabled",
          complianceStatus: "ready",
          tripState: "idle",
          countryId: "SA",
          countryScopeKind: "mapped",
          preconditionToken: "tok",
        },
        fromState: "pending_review",
        toState: "approved",
      }),
    ).rejects.toMatchObject({ code: "PRODUCTION_WRITE_DISABLED" });
    expect(port.mutations).toHaveLength(0);
  });
});

describe("Agent ONE COUNTRY ONE ACTIVE AGENT", () => {
  it("concurrent second activate fails on Fake", async () => {
    const repo = new FakeAgentWriteRepository();
    repo.seed(agentSnap("A1", "inactive", "t1"));
    repo.seed(agentSnap("A2", "inactive", "t2"));
    const mk = (id: string, tok: string) =>
      repo.apply({
        command: createActivateAgentCommand({
          actor: superAdmin as never,
          agentId: id,
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: tok,
          idempotencyKey: `idem_${id}`,
          correlationId: "c",
        }),
        snapshot: repo.get(id)!,
        fromState: "inactive",
        toState: "active",
      });
    const results = await Promise.allSettled([mk("A1", "t1"), mk("A2", "t2")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect((fail[0] as PromiseRejectedResult).reason.code).toBe(
      "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
    );
  });

  it("Production agent writer enforces uniqueness when gated ON (Fake port)", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("user", "A1", {
      Isagent: true,
      operational_status: "inactive",
      countryId: "SA",
      active: false,
    }, "ut1");
    port.seed("user", "A2", {
      Isagent: true,
      operational_status: "active",
      countryId: "SA",
      active: true,
    }, "ut2");
    const repo = new ProductionAgentWriteRepository(FLAGS_ON, port);
    await expect(
      repo.apply({
        command: createActivateAgentCommand({
          actor: superAdmin as never,
          agentId: "A1",
          countryId: "SA",
          expectedCurrentState: "inactive",
          preconditionToken: "fs_ut_ut1",
          idempotencyKey: "idem_a1",
          correlationId: "c",
        }),
        snapshot: agentSnap("A1", "inactive", "fs_ut_ut1"),
        fromState: "inactive",
        toState: "active",
      }),
    ).rejects.toMatchObject({ code: "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY" });
    expect(port.mutations).toHaveLength(0);
  });
});

describe("Driver / Customer / Geography / P0 / Support / Identity REAL apply", () => {
  it("driver allowlisted patch when gated ON", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("user", "DRV1", { registration_status: "pending_review" }, "ut0");
    const repo = new ProductionDriverWriteRepository(FLAGS_ON, port);
    const result = await repo.apply({
      command: createApproveDriverCommand({
        actor: superAdmin as never,
        driverId: "DRV1",
        expectedCurrentState: "pending_review",
        preconditionToken: "fs_ut_ut0",
        idempotencyKey: "k",
        correlationId: "c",
      }),
      snapshot: {
        driverId: "DRV1",
        exists: true,
        isOperationalDriver: true,
        registrationStatus: "pending_review",
        accountEnabled: "enabled",
        complianceStatus: "ready",
        tripState: "idle",
        countryId: "SA",
        countryScopeKind: "mapped",
        preconditionToken: "fs_ut_ut0",
      },
      fromState: "pending_review",
      toState: "approved",
    });
    expect(result.toState).toBe("approved");
    expect(port.mutations).toHaveLength(1);
    const after = await port.getDocument("user", "DRV1");
    expect(after.data?.registration_status).toBe("approved");
  });

  it("customer never hard-deletes", async () => {
    const port = new FakeProductionFirestoreWritePort();
    port.seed("user", "CUS1", { account_status: "enabled" }, "ut0");
    const repo = new ProductionCustomerWriteRepository(FLAGS_ON, port);
    await repo.apply({
      command: createDisableCustomerCommand({
        actor: superAdmin as never,
        customerId: "CUS1",
        expectedCurrentState: "enabled",
        preconditionToken: "fs_ut_ut0",
        idempotencyKey: "k",
        correlationId: "c",
        reasonCode: "operational",
      }),
      snapshot: {
        customerId: "CUS1",
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
        preconditionToken: "fs_ut_ut0",
      },
      fromState: "enabled",
      toState: "disabled",
    });
    expect(await port.getDocument("user", "CUS1")).toMatchObject({ exists: true });
  });

  it("geography / p0 / support apply allowlisted fields", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const geo = new ProductionGeographyWriteRepository(FLAGS_ON, port);
    port.seed("mkan", "qa_lm_1", { naim: "QA", acctev: true }, "ut_lm_0");
    await geo.apply({
      actor: superAdmin as never,
      resource: "landmark",
      resourceId: "qa_lm_1",
      action: "deactivate",
      expectedActive: true,
      preconditionToken: "fs_ut_ut_lm_0",
      idempotencyKey: "g_lm",
      correlationId: "c",
      reasonCode: "operational",
    });
    expect((await port.getDocument("mkan", "qa_lm_1")).data?.acctev).toBe(false);

    await geo.apply({
      actor: superAdmin as never,
      resource: "country",
      resourceId: "qa_country_1",
      action: "create",
      expectedActive: null,
      preconditionToken: "new",
      idempotencyKey: "g1",
      correlationId: "c",
      metadata: { displayNameEn: "QA" },
      reasonCode: "operational",
    });
    expect((await port.getDocument("countries", "qa_country_1")).exists).toBe(true);

    const p0 = new ProductionP0MasterWriteRepository("vehicle_catalog", FLAGS_ON, port);
    await p0.apply({
      actor: superAdmin as never,
      domain: "vehicle_catalog",
      resourceId: "car1",
      action: "create",
      preconditionToken: "new",
      idempotencyKey: "p0",
      correlationId: "c",
      reasonCode: "operational",
      metadata: { name: "Sedan" },
    });
    expect((await port.getDocument("type_car", "car1")).exists).toBe(true);

    port.seed("support", "T1", { status: "open" }, "ut0");
    const support = new ProductionSupportWriteRepository(FLAGS_ON, port);
    await support.applyPatch({
      ticketId: "T1",
      patch: { status: "resolved" },
      preconditionToken: "fs_ut_ut0",
    });
    expect((await port.getDocument("support", "T1")).data?.status).toBe("resolved");
  });

  it("identity requires dedicated WIF when no injected port", async () => {
    const repo = new ProductionIdentityWriteRepository(FLAGS_ON);
    await expect(
      repo.apply({
        command: {
          actor: superAdmin as never,
          action: "activate",
          targetUserId: "U1",
          preconditionToken: "t",
          idempotencyKey: "k",
          correlationId: "c",
          expectedCurrentRole: "accountant",
          expectedDisabled: true,
          reasonCode: "operational",
        },
        fromRole: "accountant",
        fromDisabled: true,
        patch: { disabled: false },
        allowlistedFields: ["disabled"],
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_ADMIN_WIF_REQUIRED" });
  });
});

describe("Finance FR gate + immutability posture", () => {
  it("Production finance gate denies when flags FALSE", () => {
    const gate = createProductionFinanceWriteGate(FLAGS_OFF);
    expect(gate.assertWritable("submit").allowed).toBe(false);
    expect(gate.isProductionDenied()).toBe(true);
  });

  it("Production finance gate allows only when fully armed (still Settlement V2)", () => {
    const gate = createProductionFinanceWriteGate(FLAGS_ON);
    expect(gate.assertWritable("submit").allowed).toBe(true);
  });
});

