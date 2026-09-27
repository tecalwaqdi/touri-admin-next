import { describe, expect, it } from "vitest";
import {
  canAdminCancelTripLifecycle,
  buildAdminCancelOrderPatch,
} from "@/domain/trip/TripCancelPolicy";
import {
  createCancelTripCommand,
  executeTripControlledWrite,
  FakeTripWriteLoadPort,
  FakeTripWriteRepository,
  InMemoryTripWriteAuditPort,
  InMemoryTripWriteIdempotencyStore,
  type TripWriteFlagGate,
  type VerifiedTripWriteActor,
} from "@/application/controlled-writes/trips";

const FLAGS_OFF: TripWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  TRIP_WRITE_ENABLED: false,
};

const actor: VerifiedTripWriteActor = {
  uid: "admin1",
  role: "super_admin",
  permissions: ["trips:manage", "trips:read"],
  scope: { type: "global" },
};

describe("admin trip cancel", () => {
  it("allows cancel only for non-terminal lifecycles", () => {
    expect(canAdminCancelTripLifecycle("pending_driver")).toBe(true);
    expect(canAdminCancelTripLifecycle("trip_in_progress")).toBe(true);
    expect(canAdminCancelTripLifecycle("completed")).toBe(false);
    expect(canAdminCancelTripLifecycle("cancelled_by_admin")).toBe(false);
    expect(canAdminCancelTripLifecycle("expired")).toBe(false);
  });

  it("builds Admi-parity cancel patch fields", () => {
    const patch = buildAdminCancelOrderPatch(new Date("2026-09-27T10:00:00.000Z"));
    expect(patch.status_code).toBe("cancelled_by_admin");
    expect(patch.cancelled_by_code).toBe("cancelled_by_admin");
    expect(patch.halh_text).toBe("ملغي");
    expect(patch.halh_order).toBe("Canceled");
    expect(patch.ActiveOrder).toBe(false);
    expect(patch.ALLNOW).toBe(false);
  });

  it("cancels via Fake offline pipeline", async () => {
    const loadPort = new FakeTripWriteLoadPort();
    const repository = new FakeTripWriteRepository();
    const seed = {
      tripId: "order_1",
      exists: true,
      lifecycleStatus: "pending_driver" as const,
      countryId: "SA",
      customerId: "user_1",
      preconditionToken: "tok_1",
    };
    loadPort.seed(seed);
    repository.seed(seed);

    const command = createCancelTripCommand({
      actor,
      tripId: "order_1",
      expectedLifecycleStatus: "pending_driver",
      reasonCode: "operational",
      preconditionToken: "tok_1",
      idempotencyKey: "idem_1",
      correlationId: "corr_1",
    });

    const result = await executeTripControlledWrite(command, {
      flags: FLAGS_OFF,
      loadPort,
      repository,
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
      allowOfflineExecution: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.toLifecycle).toBe("cancelled_by_admin");
      expect(result.customerLockCleared).toBe(true);
    }
    expect(repository.get("order_1")?.lifecycleStatus).toBe("cancelled_by_admin");
  });

  it("denies cancel when Production flags are off", async () => {
    const loadPort = new FakeTripWriteLoadPort();
    const repository = new FakeTripWriteRepository();
    loadPort.seed({
      tripId: "order_2",
      exists: true,
      lifecycleStatus: "driver_assigned",
      countryId: "SA",
      customerId: null,
      preconditionToken: "tok_2",
    });

    const command = createCancelTripCommand({
      actor,
      tripId: "order_2",
      expectedLifecycleStatus: "driver_assigned",
      reasonCode: "safety",
      preconditionToken: "tok_2",
      idempotencyKey: "idem_2",
      correlationId: "corr_2",
    });

    const result = await executeTripControlledWrite(command, {
      flags: FLAGS_OFF,
      loadPort,
      repository,
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
      allowOfflineExecution: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PRODUCTION_WRITE_DISABLED");
    }
  });

  it("denies auditor without trips:manage", async () => {
    const loadPort = new FakeTripWriteLoadPort();
    const repository = new FakeTripWriteRepository();
    loadPort.seed({
      tripId: "order_3",
      exists: true,
      lifecycleStatus: "pending_driver",
      countryId: "SA",
      customerId: null,
      preconditionToken: "tok_3",
    });

    const command = createCancelTripCommand({
      actor: {
        uid: "aud",
        role: "auditor",
        permissions: ["trips:read", "audit:read"],
        scope: { type: "global" },
      },
      tripId: "order_3",
      expectedLifecycleStatus: "pending_driver",
      reasonCode: "other",
      preconditionToken: "tok_3",
      idempotencyKey: "idem_3",
      correlationId: "corr_3",
    });

    const result = await executeTripControlledWrite(command, {
      flags: FLAGS_OFF,
      loadPort,
      repository,
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
      allowOfflineExecution: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PERMISSION_DENIED");
  });
});
