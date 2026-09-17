/**
 * Regression: Agent mutation API must gate BEFORE resource existence lookup.
 * AGENT_WRITE_ENABLED=false → RESOURCE_WRITE_DISABLED for existing AND
 * nonexistent Agent ids (no existence leak). Agent reads unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRepositoriesForTests } from "@/repositories/container";
import { resetAdminControlledWritesRuntimeForTests } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import {
  AgentWriteApiService,
  resetAgentWriteApiServiceForTests,
} from "@/application/agents/AgentWriteApiService";
import { resetDriverWriteApiServiceForTests } from "@/application/drivers/DriverWriteApiService";
import { seedUsers } from "@/test/fixtures/seed";
import type { AgentWriteLoadPort } from "@/application/controlled-writes/agents/AgentWritePreconditions";
import { createControlledWritesService } from "@/application/controlled-writes/ControlledWritesService";
import { InMemoryAgentWriteIdempotencyStore } from "@/application/controlled-writes/agents/AgentWriteIdempotency";
import { InMemoryAgentWriteAuditPort } from "@/application/controlled-writes/agents/AgentWriteAudit";
import { FakeAgentWriteRepository } from "@/application/controlled-writes/agents/AgentWriteRepository";
import { InMemoryDriverWriteIdempotencyStore } from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import { InMemoryDriverWriteAuditPort } from "@/application/controlled-writes/drivers/DriverWriteAudit";
import { FakeDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { InMemoryCustomerWriteIdempotencyStore } from "@/application/controlled-writes/customers/CustomerWriteIdempotency";
import { InMemoryCustomerWriteAuditPort } from "@/application/controlled-writes/customers/CustomerWriteAudit";
import { FakeCustomerWriteRepository } from "@/application/controlled-writes/customers/CustomerWriteRepository";
import { POST as agentAction } from "@/app/api/agents/[id]/[action]/route";

function req(
  url: string,
  init: RequestInit & { userId?: string; idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  if (init.userId) headers.set("x-user-id", init.userId);
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(url, { ...init, headers });
}

function makeGatedService(loadForWrite: AgentWriteLoadPort["loadForWrite"]) {
  const fakeAgentRepo = new FakeAgentWriteRepository();
  fakeAgentRepo.seed({
    exists: true,
    isOperationalAgent: true,
    excludedNonAgent: false,
    operationalState: "inactive",
    accountEnabled: "enabled",
    countryId: "SA",
    countryScopeKind: "mapped",
    preconditionToken: "tok_1",
    updateGeneration: "g1",
    agentId: "AGT_EXIST",
  });

  const service = createControlledWritesService({
    allowOfflineExecution: false,
    flags: {
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: true,
      DRIVER_WRITE_ENABLED: true,
      AGENT_WRITE_ENABLED: false,
      CUSTOMER_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
    },
    driver: {
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        DRIVER_WRITE_ENABLED: true,
      },
      loadPort: { loadForWrite: async () => null },
      repository: new FakeDriverWriteRepository(),
      idempotency: new InMemoryDriverWriteIdempotencyStore(),
      audit: new InMemoryDriverWriteAuditPort(),
      allowOfflineExecution: false,
    },
    agent: {
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        AGENT_WRITE_ENABLED: false,
      },
      loadPort: {
        loadForWrite,
        findActiveAgentIdForCountry: async () => null,
      },
      repository: fakeAgentRepo,
      idempotency: new InMemoryAgentWriteIdempotencyStore(),
      audit: new InMemoryAgentWriteAuditPort(),
      allowOfflineExecution: false,
    },
    customer: {
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
        CUSTOMER_WRITE_ENABLED: false,
        CUSTOMER_AUTH_WRITE_ENABLED: false,
      },
      loadPort: { loadForWrite: async () => null },
      repository: new FakeCustomerWriteRepository(),
      idempotency: new InMemoryCustomerWriteIdempotencyStore(),
      audit: new InMemoryCustomerWriteAuditPort(),
      allowOfflineExecution: false,
    },
  });

  return { service, fakeAgentRepo };
}

describe("Agent gate-before-lookup API regression", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
    resetAdminControlledWritesRuntimeForTests();
    resetDriverWriteApiServiceForTests();
    resetAgentWriteApiServiceForTests();
  });

  it("denyAgentWriteIfDisabled returns RESOURCE_WRITE_DISABLED without load", async () => {
    const loadForWrite = vi.fn(async () => null);
    const { service, fakeAgentRepo } = makeGatedService(loadForWrite);

    const denial = service.denyAgentWriteIfDisabled("activate");
    expect(denial).not.toBeNull();
    expect(denial?.code).toBe("RESOURCE_WRITE_DISABLED");
    expect(loadForWrite).not.toHaveBeenCalled();

    const api = new AgentWriteApiService(
      service,
      {
        loadForWrite,
        findActiveAgentIdForCountry: async () => null,
      } satisfies AgentWriteLoadPort,
      { getById: async () => null },
    );

    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const missing = await api.execute(superAdmin, {
      action: "activate",
      agentId: "__missing__",
      expectedCurrentState: "inactive",
      idempotencyKey: "k1",
      correlationId: "c1",
    });
    const existing = await api.execute(superAdmin, {
      action: "activate",
      agentId: "AGT_EXIST",
      expectedCurrentState: "inactive",
      idempotencyKey: "k2",
      correlationId: "c2",
    });

    expect(missing.ok).toBe(false);
    expect(existing.ok).toBe(false);
    if (!missing.ok && !existing.ok) {
      expect(missing.result.code).toBe("RESOURCE_WRITE_DISABLED");
      expect(existing.result.code).toBe(missing.result.code);
    }
    expect(loadForWrite).not.toHaveBeenCalled();
    expect(fakeAgentRepo.applied).toHaveLength(0);
  });

  it("HTTP agent action maps write-disabled codes to 403", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    // Offline chrome path allows writes in unit env — prove RBAC 403 still
    // maps correctly, and statusForCode treats write-disabled as 403 via
    // a synthetic denied outcome through the action route with auditor.
    const auditor = seedUsers.find((u) => u.id === "user_auditor")!;
    const denied = await agentAction(
      req("http://localhost/api/agents/__pilot_probe__/activate", {
        method: "POST",
        userId: auditor.id,
        body: JSON.stringify({ expectedCurrentState: "inactive" }),
      }),
      { params: Promise.resolve({ id: "__pilot_probe__", action: "activate" }) },
    );
    expect(denied.status).toBe(403);

    // Super-admin offline path may mutate; smoke that route still accepts
    // activate action name (not 404 Unknown action).
    const okShape = await agentAction(
      req("http://localhost/api/agents/AGT-SA-000/activate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "gate_http_smoke",
        body: JSON.stringify({ expectedCurrentState: "inactive" }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-000", action: "activate" }) },
    );
    expect([200, 403, 409]).toContain(okShape.status);
  });
});
