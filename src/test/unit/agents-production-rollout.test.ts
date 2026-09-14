import { beforeEach, describe, expect, it } from "vitest";
import { POST as agentAction } from "@/app/api/agents/[id]/[action]/route";
import {
  getRepositories,
  resetRepositoriesForTests,
} from "@/repositories/container";
import { resetDriversControlledWritesRuntimeForTests } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { resetDriverWriteApiServiceForTests } from "@/application/drivers/DriverWriteApiService";
import { resetAgentWriteApiServiceForTests } from "@/application/agents/AgentWriteApiService";
import { AGENTS_PRODUCTION_ROLLOUT } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { seedUsers } from "@/test/fixtures/seed";
import { AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE } from "@/application/controlled-writes/agents/AgentWriteFlags";

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

describe("Agents Production Rollout — API + ControlledWritesService", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
    resetDriversControlledWritesRuntimeForTests();
    resetDriverWriteApiServiceForTests();
    resetAgentWriteApiServiceForTests();
  });

  it("marks rollout CLOSED and preserves Production hard-lock", () => {
    expect(AGENTS_PRODUCTION_ROLLOUT.status).toBe("CLOSED");
    expect(AGENTS_PRODUCTION_ROLLOUT.financeUntouched).toBe(true);
    expect(AGENT_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
  });

  it("suspends active agent; reactivates via activate", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const suspend = await agentAction(
      req("http://localhost/api/agents/AGT-AE-001/suspend", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "agt_suspend_1",
        body: JSON.stringify({
          expectedCurrentState: "active",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-AE-001", action: "suspend" }) },
    );
    expect(suspend.status).toBe(200);
    const suspended = (await suspend.json()) as { status: string };
    expect(suspended.status).toBe("suspended");

    const reactivate = await agentAction(
      req("http://localhost/api/agents/AGT-AE-001/activate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "agt_reactivate_1",
        body: JSON.stringify({ expectedCurrentState: "suspended" }),
      }),
      { params: Promise.resolve({ id: "AGT-AE-001", action: "activate" }) },
    );
    expect(reactivate.status).toBe(200);
    const active = (await reactivate.json()) as { status: string };
    expect(active.status).toBe("active");
  });

  it("deactivates active agent; blocks second active in same country", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const deactivate = await agentAction(
      req("http://localhost/api/agents/AGT-SA-001/deactivate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "agt_deact_1",
        body: JSON.stringify({
          expectedCurrentState: "active",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-001", action: "deactivate" }) },
    );
    expect(deactivate.status).toBe(200);

    // After deactivate, activate inactive historical agent should succeed
    const activate = await agentAction(
      req("http://localhost/api/agents/AGT-SA-000/activate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "agt_act_000",
        body: JSON.stringify({ expectedCurrentState: "inactive" }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-000", action: "activate" }) },
    );
    expect(activate.status).toBe(200);

    // Re-activate SA-001 while SA-000 active → uniqueness denial
    const conflict = await agentAction(
      req("http://localhost/api/agents/AGT-SA-001/activate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "agt_conflict_1",
        body: JSON.stringify({ expectedCurrentState: "inactive" }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-001", action: "activate" }) },
    );
    expect(conflict.status).toBe(409);
    const json = (await conflict.json()) as { code?: string };
    expect(json.code).toMatch(/ACTIVE_AGENT/);
  });

  it("RBAC auditor denied; country_admin out-of-scope denied; SA in-scope ok", async () => {
    const auditor = seedUsers.find((u) => u.id === "user_auditor")!;
    const denied = await agentAction(
      req("http://localhost/api/agents/AGT-AE-001/suspend", {
        method: "POST",
        userId: auditor.id,
        body: JSON.stringify({
          expectedCurrentState: "active",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-AE-001", action: "suspend" }) },
    );
    expect(denied.status).toBe(403);

    const saAdmin = seedUsers.find((u) => u.id === "user_sa_admin")!;
    const scopeDenied = await agentAction(
      req("http://localhost/api/agents/AGT-AE-001/suspend", {
        method: "POST",
        userId: saAdmin.id,
        body: JSON.stringify({
          expectedCurrentState: "active",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-AE-001", action: "suspend" }) },
    );
    expect(scopeDenied.status).toBe(403);

    const ok = await agentAction(
      req("http://localhost/api/agents/AGT-SA-001/suspend", {
        method: "POST",
        userId: saAdmin.id,
        idempotencyKey: "agt_sa_suspend",
        body: JSON.stringify({
          expectedCurrentState: "active",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-001", action: "suspend" }) },
    );
    expect(ok.status).toBe(200);
    const stored = await getRepositories().agents.getById("AGT-SA-001");
    expect(stored?.status).toBe("suspended");
  });

  it("rejects illegal transition deactivate from inactive", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const illegal = await agentAction(
      req("http://localhost/api/agents/AGT-SA-000/deactivate", {
        method: "POST",
        userId: superAdmin.id,
        body: JSON.stringify({
          expectedCurrentState: "inactive",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "AGT-SA-000", action: "deactivate" }) },
    );
    expect(illegal.status).toBe(409);
    const json = (await illegal.json()) as { code?: string };
    expect(json.code).toBe("INVALID_AGENT_STATE_TRANSITION");
  });
});
