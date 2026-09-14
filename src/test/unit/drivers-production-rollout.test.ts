import { beforeEach, describe, expect, it } from "vitest";
import { POST as driverAction } from "@/app/api/drivers/[id]/[action]/route";
import {
  getRepositories,
  resetRepositoriesForTests,
} from "@/repositories/container";
import { resetDriversControlledWritesRuntimeForTests } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { resetDriverWriteApiServiceForTests } from "@/application/drivers/DriverWriteApiService";
import { DRIVERS_PRODUCTION_ROLLOUT } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { seedUsers } from "@/test/fixtures/seed";
import { DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE } from "@/application/controlled-writes/drivers/DriverWriteFlags";

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

describe("Drivers Production Rollout — API + ControlledWritesService", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
    resetDriversControlledWritesRuntimeForTests();
    resetDriverWriteApiServiceForTests();
  });

  it("marks rollout CLOSED and preserves Production hard-lock", () => {
    expect(DRIVERS_PRODUCTION_ROLLOUT.status).toBe("CLOSED");
    expect(DRIVERS_PRODUCTION_ROLLOUT.phase5m5nUntouched).toBe(true);
    expect(DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE).toBe(false);
  });

  it("approves pending_review driver via ControlledWritesService path", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const res = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-003/approve", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_approve_1",
        body: JSON.stringify({ expectedCurrentState: "pending_review" }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-003", action: "approve" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      registrationStatus: string;
      write: { toState: string; action: string };
    };
    expect(body.registrationStatus).toBe("approved");
    expect(body.write.toState).toBe("approved");
    expect(body.write.action).toBe("approve");

    const stored = await getRepositories().drivers.getById("DRV-SA-003");
    expect(stored?.registrationStatus).toBe("approved");
  });

  it("rejects auditor (RBAC) and out-of-country country_admin (scope)", async () => {
    const auditor = seedUsers.find((u) => u.id === "user_auditor")!;
    const denied = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-003/approve", {
        method: "POST",
        userId: auditor.id,
        body: JSON.stringify({ expectedCurrentState: "pending_review" }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-003", action: "approve" }) },
    );
    expect(denied.status).toBe(403);

    const saAdmin = seedUsers.find((u) => u.id === "user_sa_admin")!;
    const scopeDenied = await driverAction(
      req("http://localhost/api/drivers/DRV-AE-003/approve", {
        method: "POST",
        userId: saAdmin.id,
        body: JSON.stringify({ expectedCurrentState: "pending_review" }),
      }),
      { params: Promise.resolve({ id: "DRV-AE-003", action: "approve" }) },
    );
    expect(scopeDenied.status).toBe(403);
    const json = (await scopeDenied.json()) as { code?: string };
    expect(json.code).toBe("SCOPE_DENIED");
  });

  it("country_admin may approve within SA scope", async () => {
    const saAdmin = seedUsers.find((u) => u.id === "user_sa_admin")!;
    const res = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-003/approve", {
        method: "POST",
        userId: saAdmin.id,
        idempotencyKey: "drv_sa_approve_1",
        body: JSON.stringify({ expectedCurrentState: "pending_review" }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-003", action: "approve" }) },
    );
    expect(res.status).toBe(200);
  });

  it("suspends approved idle driver; blocks busy active-trip suspend", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const ok = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-001/suspend", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_suspend_idle",
        body: JSON.stringify({
          expectedCurrentState: "approved",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-001", action: "suspend" }) },
    );
    expect(ok.status).toBe(200);

    const busy = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-002/suspend", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_suspend_busy",
        body: JSON.stringify({
          expectedCurrentState: "approved",
          reasonCode: "operational",
        }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-002", action: "suspend" }) },
    );
    expect(busy.status).toBe(409);
    const json = (await busy.json()) as { code?: string };
    expect(json.code).toBe("DRIVER_HAS_ACTIVE_TRIP");
  });

  it("reactivates suspended via approve; rejects illegal transition", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const reactivate = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-004/approve", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_reactivate_1",
        body: JSON.stringify({ expectedCurrentState: "suspended" }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-004", action: "approve" }) },
    );
    expect(reactivate.status).toBe(200);
    const body = (await reactivate.json()) as { registrationStatus: string };
    expect(body.registrationStatus).toBe("approved");

    const illegal = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-009/approve", {
        method: "POST",
        userId: superAdmin.id,
        body: JSON.stringify({ expectedCurrentState: "rejected" }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-009", action: "approve" }) },
    );
    expect(illegal.status).toBe(409);
    const json = (await illegal.json()) as { code?: string };
    expect(json.code).toBe("INVALID_DRIVER_STATE_TRANSITION");
  });

  it("needs_changes + reject from pending_review", async () => {
    const superAdmin = seedUsers.find((u) => u.id === "user_super")!;
    const changes = await driverAction(
      req("http://localhost/api/drivers/DRV-AE-003/needs_changes", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_changes_1",
        body: JSON.stringify({
          expectedCurrentState: "pending_review",
          reasonCode: "photo_quality",
        }),
      }),
      { params: Promise.resolve({ id: "DRV-AE-003", action: "needs_changes" }) },
    );
    expect(changes.status).toBe(200);
    const changed = (await changes.json()) as { registrationStatus: string };
    expect(changed.registrationStatus).toBe("needs_changes");

    const reject = await driverAction(
      req("http://localhost/api/drivers/DRV-SA-003/reject", {
        method: "POST",
        userId: superAdmin.id,
        idempotencyKey: "drv_reject_1",
        body: JSON.stringify({
          expectedCurrentState: "pending_review",
          reasonCode: "invalid_document",
        }),
      }),
      { params: Promise.resolve({ id: "DRV-SA-003", action: "reject" }) },
    );
    expect(reject.status).toBe(200);
    const rejected = (await reject.json()) as { registrationStatus: string };
    expect(rejected.registrationStatus).toBe("rejected");
  });
});
