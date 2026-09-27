/**
 * Trip cancel API service — Production WIF path + offline Fake for development.
 */

import type { AuthUser } from "@/types/auth";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import {
  createCancelTripCommand,
  executeTripControlledWrite,
  FakeTripWriteLoadPort,
  FakeTripWriteRepository,
  InMemoryTripWriteAuditPort,
  InMemoryTripWriteIdempotencyStore,
  ProductionTripWriteLoadPort,
  createProductionRuntimeTripWriteRepository,
  type TripCancelReasonCode,
  type TripWriteCanonicalResponse,
  type TripWriteFlagGate,
  type TripWriteLoadPort,
  type TripWriteRepository,
  type VerifiedTripWriteActor,
} from "@/application/controlled-writes/trips";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { getEnv } from "@/config/env";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { areTripProductionWritesEnabled } from "@/application/controlled-writes/trips/TripWriteFlags";

export type TripCancelApiInput = {
  tripId: string;
  expectedLifecycleStatus: TripLifecycleStatus;
  reasonCode: TripCancelReasonCode;
  note?: string;
  idempotencyKey: string;
  correlationId: string;
};

function toActor(user: AuthUser): VerifiedTripWriteActor {
  return {
    uid: user.id,
    role: user.role,
    permissions: user.permissions,
    scope: user.scope,
  };
}

function flagsFromEnv(): TripWriteFlagGate {
  const env = getEnv();
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    TRIP_WRITE_ENABLED: env.TRIP_WRITE_ENABLED,
  };
}

type Runtime = {
  flags: TripWriteFlagGate;
  allowOffline: boolean;
  loadPort: TripWriteLoadPort;
  repository: TripWriteRepository;
  idempotency: InMemoryTripWriteIdempotencyStore;
  audit: InMemoryTripWriteAuditPort;
};

let cached: Runtime | null = null;

function getRuntime(): Runtime {
  if (cached) return cached;
  const flags = flagsFromEnv();
  const env = getEnv();
  const allowOffline =
    env.APP_ENV === "development" &&
    env.PRODUCTION_READ_MODE === "disabled" &&
    isControlledWriteChromeEnabled() &&
    !areTripProductionWritesEnabled(flags);

  if (allowOffline) {
    cached = {
      flags,
      allowOffline: true,
      loadPort: new FakeTripWriteLoadPort(),
      repository: new FakeTripWriteRepository(),
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
    };
    return cached;
  }

  if (!areTripProductionWritesEnabled(flags)) {
    cached = {
      flags,
      allowOffline: false,
      loadPort: new FakeTripWriteLoadPort(),
      repository: createProductionRuntimeTripWriteRepository(flags),
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
    };
    return cached;
  }

  try {
    const port = createWifWritePortOrThrow("ops_writer");
    cached = {
      flags,
      allowOffline: false,
      loadPort: new ProductionTripWriteLoadPort(port),
      repository: createProductionRuntimeTripWriteRepository(flags, port),
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
    };
  } catch {
    cached = {
      flags,
      allowOffline: false,
      loadPort: new FakeTripWriteLoadPort(),
      repository: createProductionRuntimeTripWriteRepository(flags),
      idempotency: new InMemoryTripWriteIdempotencyStore(),
      audit: new InMemoryTripWriteAuditPort(),
    };
  }
  return cached;
}

/** Test-only reset. */
export function __resetTripWriteApiServiceForTests(): void {
  cached = null;
}

export class TripWriteApiService {
  async cancel(
    actor: AuthUser,
    input: TripCancelApiInput,
  ): Promise<TripWriteCanonicalResponse> {
    const runtime = getRuntime();

    if (!runtime.allowOffline && !areTripProductionWritesEnabled(runtime.flags)) {
      return {
        ok: false,
        status: "denied",
        code: !runtime.flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
          !runtime.flags.PRODUCTION_WRITE_ENABLED
          ? "PRODUCTION_WRITE_DISABLED"
          : "RESOURCE_WRITE_DISABLED",
        message: "Trip cancel writes are not enabled",
        action: "cancel",
        tripId: input.tripId,
        productionWriteExecuted: false,
      };
    }

    if (
      runtime.allowOffline &&
      runtime.loadPort instanceof FakeTripWriteLoadPort &&
      runtime.repository instanceof FakeTripWriteRepository
    ) {
      const existing = await runtime.loadPort.loadForWrite(input.tripId);
      if (!existing) {
        const seed = {
          tripId: input.tripId,
          exists: true,
          lifecycleStatus: input.expectedLifecycleStatus,
          countryId:
            actor.scope.type === "country"
              ? actor.scope.countryIds?.[0] ?? null
              : "SA",
          customerId: null,
          preconditionToken: `offline_${input.tripId}`,
        };
        runtime.loadPort.seed(seed);
        runtime.repository.seed(seed);
      }
    }

    const loaded = await runtime.loadPort.loadForWrite(input.tripId);
    if (!loaded?.exists) {
      return {
        ok: false,
        status: "denied",
        code: "TRIP_NOT_FOUND",
        message: `Trip ${input.tripId} not found`,
        action: "cancel",
        tripId: input.tripId,
        productionWriteExecuted: false,
      };
    }

    const command = createCancelTripCommand({
      actor: toActor(actor),
      tripId: input.tripId,
      expectedLifecycleStatus: input.expectedLifecycleStatus,
      reasonCode: input.reasonCode,
      note: input.note,
      preconditionToken: loaded.preconditionToken,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    return executeTripControlledWrite(command, {
      flags: runtime.flags,
      loadPort: runtime.loadPort,
      repository: runtime.repository,
      idempotency: runtime.idempotency,
      audit: runtime.audit,
      allowOfflineExecution: runtime.allowOffline,
    });
  }
}

let serviceSingleton: TripWriteApiService | null = null;

export function getTripWriteApiService(): TripWriteApiService {
  if (!serviceSingleton) serviceSingleton = new TripWriteApiService();
  return serviceSingleton;
}
