/**
 * Trip cancel repository — Fake + Production (order + customer lock clear).
 */

import { buildAdminCancelOrderPatch } from "@/domain/trip/TripCancelPolicy";
import {
  assertTripProductionWriteEnabled,
  areTripProductionWritesEnabled,
} from "@/application/controlled-writes/trips/TripWriteFlags";
import {
  TripWriteError,
  type TripWriteApplyInput,
  type TripWriteApplyResult,
  type TripWriteFlagGate,
  type TripWriteSnapshot,
} from "@/application/controlled-writes/trips/TripWriteTypes";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

export type TripWriteRepository = {
  readonly kind:
    | "fake_trip_write"
    | "disabled_trip_write"
    | "production_trip_write";
  apply(input: TripWriteApplyInput): Promise<TripWriteApplyResult>;
};

export class FakeTripWriteRepository implements TripWriteRepository {
  readonly kind = "fake_trip_write" as const;
  readonly applied: TripWriteApplyResult[] = [];
  private readonly trips = new Map<string, TripWriteSnapshot>();
  private readonly customerLocks = new Map<string, string | null>();

  seed(snapshot: TripWriteSnapshot): void {
    this.trips.set(snapshot.tripId, { ...snapshot });
    if (snapshot.customerId) {
      this.customerLocks.set(snapshot.customerId, snapshot.tripId);
    }
  }

  get(tripId: string): TripWriteSnapshot | undefined {
    const s = this.trips.get(tripId);
    return s ? { ...s } : undefined;
  }

  getCustomerLock(customerId: string): string | null | undefined {
    return this.customerLocks.get(customerId);
  }

  async apply(input: TripWriteApplyInput): Promise<TripWriteApplyResult> {
    const current = this.trips.get(input.command.tripId);
    if (!current?.exists) {
      throw new TripWriteError(
        "TRIP_NOT_FOUND",
        `Fake store missing ${input.command.tripId}`,
      );
    }
    if (current.preconditionToken !== input.command.preconditionToken) {
      throw new TripWriteError(
        "PRECONDITION_FAILED",
        "Fake concurrency token mismatch",
      );
    }
    if (current.lifecycleStatus !== input.fromLifecycle) {
      throw new TripWriteError(
        "PRECONDITION_FAILED",
        "Fake lifecycle mismatch at apply",
      );
    }
    const nextToken = `tok_${current.preconditionToken}_next`;
    const next: TripWriteSnapshot = {
      ...current,
      lifecycleStatus: "cancelled_by_admin",
      preconditionToken: nextToken,
    };
    this.trips.set(current.tripId, next);
    let customerLockCleared = false;
    if (current.customerId) {
      const lock = this.customerLocks.get(current.customerId);
      if (lock === current.tripId) {
        this.customerLocks.set(current.customerId, null);
        customerLockCleared = true;
      }
    }
    const result: TripWriteApplyResult = {
      tripId: current.tripId,
      fromLifecycle: input.fromLifecycle,
      toLifecycle: "cancelled_by_admin",
      customerId: current.customerId,
      customerLockCleared,
      preconditionTokenAfter: nextToken,
      appliedAtUtc: new Date().toISOString(),
    };
    this.applied.push(result);
    return result;
  }
}

export class DisabledTripWriteRepository implements TripWriteRepository {
  readonly kind = "disabled_trip_write" as const;
  async apply(): Promise<never> {
    throw new TripWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "DisabledTripWriteRepository",
    );
  }
}

export class ProductionTripWriteRepository implements TripWriteRepository {
  readonly kind = "production_trip_write" as const;

  constructor(
    private readonly flags: TripWriteFlagGate,
    private readonly port?: ProductionFirestoreWritePort,
  ) {}

  async apply(input: TripWriteApplyInput): Promise<TripWriteApplyResult> {
    assertTripProductionWriteEnabled(this.flags);
    const port = this.port;
    if (!port) {
      throw new TripWriteError(
        "INTERNAL_WRITE_FAILURE",
        "WRITE_RUNTIME_UNAVAILABLE: Production trip write port not configured",
      );
    }

    const expectedUt = input.command.preconditionToken.startsWith("fs_ut_")
      ? input.command.preconditionToken.slice("fs_ut_".length)
      : null;

    const patch = buildAdminCancelOrderPatch(new Date());
    const patched = await port.updateDocument(
      "order",
      input.command.tripId,
      patch,
      { expectedUpdateTime: expectedUt },
    );

    let customerLockCleared = false;
    const customerId = input.snapshot.customerId;
    if (customerId) {
      try {
        await port.updateDocument(
          "user",
          customerId,
          {
            active_order_id: null,
            active_order_updated_at: new Date(),
          },
          { allowCreate: false },
        );
        customerLockCleared = true;
      } catch {
        // fail-soft: order already cancelled; lock clear is best-effort like Admi
        customerLockCleared = false;
      }
    }

    return {
      tripId: input.command.tripId,
      fromLifecycle: input.fromLifecycle,
      toLifecycle: "cancelled_by_admin",
      customerId,
      customerLockCleared,
      preconditionTokenAfter: patched.updateTime
        ? `fs_ut_${patched.updateTime}`
        : `fs_exists_${input.command.tripId.slice(0, 8)}`,
      appliedAtUtc: new Date().toISOString(),
    };
  }

  static isReachable(flags: TripWriteFlagGate): boolean {
    return areTripProductionWritesEnabled(flags);
  }
}

export function createProductionRuntimeTripWriteRepository(
  flags?: TripWriteFlagGate,
  port?: ProductionFirestoreWritePort,
): ProductionTripWriteRepository {
  return new ProductionTripWriteRepository(
    flags ?? {
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      TRIP_WRITE_ENABLED: false,
    },
    port,
  );
}
