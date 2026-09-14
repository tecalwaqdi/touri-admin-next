import { beforeEach, describe, expect, it } from "vitest";
import { POST as customerAction } from "@/app/api/customers/[id]/[action]/route";
import {
  getRepositories,
  resetRepositoriesForTests,
} from "@/repositories/container";
import { resetDriversControlledWritesRuntimeForTests } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { resetDriverWriteApiServiceForTests } from "@/application/drivers/DriverWriteApiService";
import { resetAgentWriteApiServiceForTests } from "@/application/agents/AgentWriteApiService";
import { resetCustomerWriteApiServiceForTests } from "@/application/customers/CustomerWriteApiService";
import { CUSTOMERS_PRODUCTION_ROLLOUT } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { seedUsers } from "@/test/fixtures/seed";
import { CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE } from "@/application/controlled-writes/customers/CustomerWriteFlags";
import { CUSTOMER_AUTH_WRITE_HARD_FALSE } from "@/application/controlled-writes/customers/CustomerWriteFlags";

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

describe("Customers Production Rollout — API + ControlledWritesService", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
    resetDriversControlledWritesRuntimeForTests();
    resetDriverWriteApiServiceForTests();
    resetAgentWriteApiServiceForTests();
    resetCustomerWriteApiServiceForTests();
  });

  it("marks rollout CLOSED and preserves Production hard-lock + Auth off", () => {
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.status).toBe("CLOSED");
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.productionFirestoreHardLockPreserved).toBe(
      true,
    );
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.driversUntouched).toBe(true);
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.agentsUntouched).toBe(true);
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.financeUntouched).toBe(true);
    expect(CUSTOMERS_PRODUCTION_ROLLOUT.authWriteEnabled).toBe(false);
    expect(CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
    expect(CUSTOMER_AUTH_WRITE_HARD_FALSE).toBe(false);
  });

  it("disables enabled customer; reactivates via reactivate", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const disable = await customerAction(
      req("http://localhost/api/customers/CUS-SA-001/disable", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "cus_disable_1",
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-001", action: "disable" }) },
    );
    expect(disable.status).toBe(200);
    const disabled = (await disable.json()) as {
      status: string;
      write?: { authWriteExecuted?: boolean; toState?: string };
    };
    expect(disabled.status).toBe("inactive");
    expect(disabled.write?.toState).toBe("disabled");
    expect(disabled.write?.authWriteExecuted).toBe(false);

    const reactivate = await customerAction(
      req("http://localhost/api/customers/CUS-SA-001/reactivate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "cus_reactivate_1",
        body: JSON.stringify({
          expectedCurrentState: "disabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-001", action: "reactivate" }) },
    );
    expect(reactivate.status).toBe(200);
    const active = (await reactivate.json()) as { status: string };
    expect(active.status).toBe("active");
  });

  it("blocks enabled customer; reactivates blocked → enabled", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const block = await customerAction(
      req("http://localhost/api/customers/CUS-AE-001/block", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "cus_block_1",
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "policy_violation",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-AE-001", action: "block" }) },
    );
    expect(block.status).toBe(200);
    const blocked = (await block.json()) as { status: string };
    expect(blocked.status).toBe("blocked");

    const reactivate = await customerAction(
      req("http://localhost/api/customers/CUS-AE-001/reactivate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "cus_block_reactivate_1",
        body: JSON.stringify({ expectedCurrentState: "blocked" }),
      }),
      { params: Promise.resolve({ id: "CUS-AE-001", action: "reactivate" }) },
    );
    expect(reactivate.status).toBe(200);
    expect(((await reactivate.json()) as { status: string }).status).toBe(
      "active",
    );
  });

  it("enables inactive customer via reactivate", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const enable = await customerAction(
      req("http://localhost/api/customers/CUS-SA-011/reactivate", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "cus_enable_inactive",
        body: JSON.stringify({
          expectedCurrentState: "disabled",
          reasonCode: "error_correction",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-011", action: "reactivate" }) },
    );
    expect(enable.status).toBe(200);
    expect(((await enable.json()) as { status: string }).status).toBe("active");
  });

  it("RBAC auditor denied; country_admin out-of-scope denied; SA in-scope ok", async () => {
    const auditor = seedUsers.find((u) => u.id === "user_auditor")!;
    const denied = await customerAction(
      req("http://localhost/api/customers/CUS-AE-002/disable", {
        method: "POST",
        userId: auditor.id,
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-AE-002", action: "disable" }) },
    );
    expect(denied.status).toBe(403);

    const saAdmin = seedUsers.find((u) => u.id === "user_sa_admin")!;
    const scopeDenied = await customerAction(
      req("http://localhost/api/customers/CUS-AE-002/disable", {
        method: "POST",
        userId: saAdmin.id,
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-AE-002", action: "disable" }) },
    );
    expect(scopeDenied.status).toBe(403);

    const ok = await customerAction(
      req("http://localhost/api/customers/CUS-SA-002/disable", {
        method: "POST",
        userId: saAdmin.id,
        idempotencyKey: "cus_sa_disable",
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-002", action: "disable" }) },
    );
    expect(ok.status).toBe(200);
    const stored = await getRepositories().customers.getById("CUS-SA-002");
    expect(stored?.status).toBe("inactive");
  });

  it("rejects illegal transition disable from disabled", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const illegal = await customerAction(
      req("http://localhost/api/customers/CUS-SA-011/disable", {
        method: "POST",
        userId: superAdmin.id,
        body: JSON.stringify({
          expectedCurrentState: "disabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-011", action: "disable" }) },
    );
    expect(illegal.status).toBe(409);
    const json = (await illegal.json()) as { code?: string };
    expect(json.code).toBe("INVALID_CUSTOMER_STATE_TRANSITION");
  });

  it("duplicate post-success submission does not double-mutate", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const key = "cus_idem_disable_same";
    const first = await customerAction(
      req("http://localhost/api/customers/CUS-SA-003/disable", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: key,
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-003", action: "disable" }) },
    );
    expect(first.status).toBe(200);

    const second = await customerAction(
      req("http://localhost/api/customers/CUS-SA-003/disable", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: key,
        body: JSON.stringify({
          expectedCurrentState: "enabled",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "CUS-SA-003", action: "disable" }) },
    );
    // Same key after apply gets a new preconditionToken → fingerprint mismatch →
    // IDEMPOTENCY_CONFLICT (safe; no second write). Domain idempotent_replay is
    // covered by Phase 5C with stable snapshots.
    expect(second.status).toBe(409);
    const json = (await second.json()) as { code?: string };
    expect(json.code).toMatch(/IDEMPOTENCY_CONFLICT|PRECONDITION_FAILED/);
    const stored = await getRepositories().customers.getById("CUS-SA-003");
    expect(stored?.status).toBe("inactive");
  });

  it("concurrent duplicate disable: exactly one apply", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const [a, b] = await Promise.all([
      customerAction(
        req("http://localhost/api/customers/CUS-SA-004/disable", {
          method: "POST",
          userId: superAdmin.id,
          idempotencyKey: "cus_race_a",
          body: JSON.stringify({
            expectedCurrentState: "enabled",
            reasonCode: "operational",
          }),
        }),
        { params: Promise.resolve({ id: "CUS-SA-004", action: "disable" }) },
      ),
      customerAction(
        req("http://localhost/api/customers/CUS-SA-004/disable", {
          method: "POST",
          userId: superAdmin.id,
          idempotencyKey: "cus_race_b",
          body: JSON.stringify({
            expectedCurrentState: "enabled",
            reasonCode: "operational",
          }),
        }),
        { params: Promise.resolve({ id: "CUS-SA-004", action: "disable" }) },
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const stored = await getRepositories().customers.getById("CUS-SA-004");
    expect(stored?.status).toBe("inactive");
  });
});
