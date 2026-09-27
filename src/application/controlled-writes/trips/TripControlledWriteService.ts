/**
 * Trip cancel Controlled Write pipeline.
 * UI → API → Verified Actor → RBAC → Scope → Precondition → Idempotency →
 * AUDIT_INTENT → Repository → AUDIT_RESULT
 */

import {
  assertTripProductionWriteEnabled,
  snapshotTripWriteFlags,
} from "@/application/controlled-writes/trips/TripWriteFlags";
import { assertTripWriteRbac } from "@/application/controlled-writes/trips/TripWriteRbac";
import { assertTripWriteScope } from "@/application/controlled-writes/trips/TripWriteScope";
import type { TripWriteLoadPort } from "@/application/controlled-writes/trips/TripWriteLoadPort";
import type { TripWriteRepository } from "@/application/controlled-writes/trips/TripWriteRepository";
import type { TripWriteIdempotencyStore } from "@/application/controlled-writes/trips/TripWriteIdempotency";
import type { TripWriteAuditPort } from "@/application/controlled-writes/trips/TripWriteAudit";
import {
  assertCancelPreconditions,
  validateCancelTripCommand,
} from "@/application/controlled-writes/trips/TripWriteValidation";
import {
  isTripWriteErrorCode,
  TripWriteError,
  type CancelTripCommand,
  type TripWriteCanonicalResponse,
  type TripWriteErrorCode,
  type TripWriteFlagGate,
} from "@/application/controlled-writes/trips/TripWriteTypes";

export type TripControlledWriteServiceDeps = {
  flags: TripWriteFlagGate;
  loadPort: TripWriteLoadPort;
  repository: TripWriteRepository;
  idempotency: TripWriteIdempotencyStore;
  audit: TripWriteAuditPort;
  /** Offline/fake only — skips Production flag gate after dedicated denial tests. */
  allowOfflineExecution?: boolean;
};

function deny(
  command: CancelTripCommand,
  code: TripWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): TripWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: "cancel",
    tripId: command.tripId,
    productionWriteExecuted: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: TripWriteErrorCode;
  message: string;
} {
  if (err instanceof TripWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isTripWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: TripWriteErrorCode }).code,
      message: err instanceof Error ? err.message : String((err as { code: string }).code),
    };
  }
  return {
    code: "INTERNAL_WRITE_FAILURE",
    message: err instanceof Error ? err.message : String(err),
  };
}

export async function executeTripControlledWrite(
  command: CancelTripCommand,
  deps: TripControlledWriteServiceDeps,
): Promise<TripWriteCanonicalResponse> {
  try {
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }

    const validated = validateCancelTripCommand(command);
    assertTripWriteRbac(validated.actor);

    if (!deps.allowOfflineExecution) {
      assertTripProductionWriteEnabled(deps.flags);
    }
    void snapshotTripWriteFlags(deps.flags);

    const snapshot = await deps.loadPort.loadForWrite(validated.tripId);
    if (!snapshot?.exists) {
      return deny(validated, "TRIP_NOT_FOUND", `Trip ${validated.tripId} not found`);
    }

    assertTripWriteScope(validated.actor, snapshot);
    assertCancelPreconditions(validated, snapshot);

    const prior = await deps.idempotency.get(validated.idempotencyKey);
    if (prior) {
      return { ...prior, status: "idempotent_replay" };
    }

    const intentId = await deps.audit.recordIntent(validated);

    try {
      const applied = await deps.repository.apply({
        command: validated,
        snapshot,
        fromLifecycle: snapshot.lifecycleStatus,
      });

      const success: Extract<TripWriteCanonicalResponse, { ok: true }> = {
        ok: true,
        status: "applied",
        action: "cancel",
        tripId: applied.tripId,
        fromLifecycle: applied.fromLifecycle,
        toLifecycle: "cancelled_by_admin",
        productionWriteExecuted: !deps.allowOfflineExecution,
        customerLockCleared: applied.customerLockCleared,
        auditIntentId: intentId,
        preconditionTokenAfter: applied.preconditionTokenAfter,
      };

      await deps.idempotency.put(validated.idempotencyKey, success);
      const resultId = await deps.audit.recordResult({
        command: validated,
        intentId,
        ok: true,
      });
      return { ...success, auditResultId: resultId };
    } catch (err) {
      const { code, message } = toErrorCode(err);
      const resultId = await deps.audit.recordResult({
        command: validated,
        intentId,
        ok: false,
        code,
      });
      return deny(validated, code, message, { intentId, resultId });
    }
  } catch (err) {
    const { code, message } = toErrorCode(err);
    return deny(command, code, message);
  }
}
