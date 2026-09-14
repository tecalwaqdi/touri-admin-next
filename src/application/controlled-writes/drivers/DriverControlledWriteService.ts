/**
 * Phase 5A — Driver Controlled Write application service / pipeline.
 *
 * UI → Application Command → Verified Actor → RBAC → Scope → Precondition →
 * Validation → Idempotency → Audit Intent → Controlled Driver Write Repository →
 * Transaction/Safe Update → Audit Result → Canonical Response
 *
 * Never UI→Firestore. Production writes remain disabled.
 */

import type {
  DriverControlledWriteCommand,
  DriverWriteCanonicalResponse,
  DriverWriteFlagGate,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import {
  DriverWriteError,
  isDriverWriteErrorCode,
  type DriverWriteErrorCode,
} from "@/application/controlled-writes/drivers/DriverWriteErrors";
import { assertDriverWriteRbac } from "@/application/controlled-writes/drivers/DriverWriteRbac";
import { assertDriverWriteScope } from "@/application/controlled-writes/drivers/DriverWriteScope";
import {
  evaluateDriverWritePreconditions,
  type DriverWriteLoadPort,
} from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import { validateDriverWriteCommandPayload } from "@/application/controlled-writes/drivers/DriverWriteValidation";
import {
  checkDriverWriteIdempotency,
  type DriverWriteIdempotencyStore,
} from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import {
  buildDriverWriteAuditIntent,
  buildDriverWriteAuditResult,
  type DriverWriteAuditPort,
} from "@/application/controlled-writes/drivers/DriverWriteAudit";
import type { DriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import {
  assertDriverProductionWriteEnabled,
  snapshotDriverWriteFlags,
} from "@/application/controlled-writes/drivers/DriverWriteFlags";

export type DriverControlledWriteServiceDeps = {
  flags: DriverWriteFlagGate;
  loadPort: DriverWriteLoadPort;
  repository: DriverWriteRepository;
  idempotency: DriverWriteIdempotencyStore;
  audit: DriverWriteAuditPort;
  /**
   * Offline/fake/emulator only. When true, Production flag gate is skipped
   * AFTER proving default denial in dedicated tests. MUST be false for any
   * Production runtime wiring.
   */
  allowOfflineExecution?: boolean;
};

function deny(
  command: DriverControlledWriteCommand,
  code: DriverWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): DriverWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    driverId: command.driverId,
    productionWriteExecuted: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: DriverWriteErrorCode;
  message: string;
} {
  if (err instanceof DriverWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isDriverWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: DriverWriteErrorCode }).code,
      message:
        err instanceof Error ? err.message : String((err as { code: string }).code),
    };
  }
  return {
    code: "INTERNAL_WRITE_FAILURE",
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * Execute one Driver Controlled Write command through the full pipeline.
 */
export async function executeDriverControlledWrite(
  command: DriverControlledWriteCommand,
  deps: DriverControlledWriteServiceDeps,
): Promise<DriverWriteCanonicalResponse> {
  try {
    // Verified actor presence
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }

    // Validation (payload shape / reason codes / sanitized note)
    const validated = validateDriverWriteCommandPayload(command);

    // Production gate — before any mutation attempt
    const flags = snapshotDriverWriteFlags(deps.flags);
    if (!deps.allowOfflineExecution) {
      try {
        assertDriverProductionWriteEnabled(flags);
      } catch (err) {
        const mapped = toErrorCode(err);
        return deny(command, mapped.code, mapped.message);
      }
    }

    // RBAC
    assertDriverWriteRbac(command.actor, command.action);

    // Load canonical snapshot (precondition read)
    const loaded = await deps.loadPort.loadForWrite(command.driverId);
    if (!loaded || !loaded.exists) {
      throw new DriverWriteError(
        "DRIVER_NOT_FOUND",
        `Driver ${command.driverId} not found`,
      );
    }
    if (!loaded.isOperationalDriver) {
      throw new DriverWriteError(
        "NOT_OPERATIONAL_DRIVER",
        `Driver ${command.driverId} is not an operational Driver`,
      );
    }

    // Scope (canonical country — no inference) before remaining preconditions
    assertDriverWriteScope(command.actor, loaded);

    // Preconditions + state machine + approve/suspend guards
    const { snapshot, toState } = evaluateDriverWritePreconditions(
      command,
      loaded,
    );

    // Idempotency
    const idemp = await checkDriverWriteIdempotency(deps.idempotency, command);
    if (idemp.kind === "replay") {
      const replayIntent = buildDriverWriteAuditIntent({
        actorUid: command.actor.uid,
        actorRole: command.actor.role,
        action: command.action,
        driverId: command.driverId,
        countryId: snapshot.countryId,
        countryScopeKind: snapshot.countryScopeKind,
        fromState: snapshot.registrationStatus,
        toState,
        reasonCode: validated.reasonCode,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordIntent(replayIntent);
      const replayResult = buildDriverWriteAuditResult({
        intentAuditId: replayIntent.auditId,
        outcome: "idempotent_replay",
        code: "IDEMPOTENCY_REPLAY",
        action: command.action,
        driverId: command.driverId,
        countryId: snapshot.countryId,
        fromState: snapshot.registrationStatus,
        toState,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordResult(replayResult);
      return {
        ...idemp.record.result,
        status: "idempotent_replay",
        auditIntentId: replayIntent.auditId,
        auditResultId: replayResult.auditId,
        productionWriteExecuted: false,
      };
    }

    // AUDIT_INTENT before repository
    const intent = buildDriverWriteAuditIntent({
      actorUid: command.actor.uid,
      actorRole: command.actor.role,
      action: command.action,
      driverId: command.driverId,
      countryId: snapshot.countryId,
      countryScopeKind: snapshot.countryScopeKind,
      fromState: snapshot.registrationStatus,
      toState,
      reasonCode: validated.reasonCode,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    await deps.audit.recordIntent(intent);

    try {
      // Controlled repository (Fake / Emulator / Disabled / unreachable Production)
      const applied = await deps.repository.apply({
        command,
        snapshot,
        fromState: snapshot.registrationStatus,
        toState,
      });

      const success: Extract<DriverWriteCanonicalResponse, { ok: true }> = {
        ok: true,
        status: "applied",
        action: command.action,
        driverId: command.driverId,
        fromState: applied.fromState,
        toState: applied.toState,
        auditIntentId: intent.auditId,
        auditResultId: "", // filled after result
        productionWriteExecuted: false,
      };

      await deps.idempotency.put({
        key: command.idempotencyKey,
        fingerprint: idemp.fingerprint,
        result: success,
        createdAtUtc: new Date().toISOString(),
      });

      const result = buildDriverWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: "applied",
        action: command.action,
        driverId: command.driverId,
        countryId: snapshot.countryId,
        fromState: applied.fromState,
        toState: applied.toState,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordResult(result);

      // Patch stored success with audit result id for future replays
      success.auditResultId = result.auditId;
      await deps.idempotency.put({
        key: command.idempotencyKey,
        fingerprint: idemp.fingerprint,
        result: success,
        createdAtUtc: new Date().toISOString(),
      });

      return success;
    } catch (err) {
      const mapped = toErrorCode(err);
      const result = buildDriverWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: mapped.code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
        code: mapped.code,
        action: command.action,
        driverId: command.driverId,
        countryId: snapshot.countryId,
        fromState: snapshot.registrationStatus,
        toState,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordResult(result);
      return deny(command, mapped.code, mapped.message, {
        intentId: intent.auditId,
        resultId: result.auditId,
      });
    }
  } catch (err) {
    const mapped = toErrorCode(err);
    return deny(command, mapped.code, mapped.message);
  }
}

/**
 * Convenience: Production-runtime deps always use Disabled repository and
 * allowOfflineExecution=false.
 */
export function productionRuntimeDriverWriteDeps(input: {
  flags: DriverWriteFlagGate;
  loadPort: DriverWriteLoadPort;
  repository: DriverWriteRepository;
  idempotency: DriverWriteIdempotencyStore;
  audit: DriverWriteAuditPort;
}): DriverControlledWriteServiceDeps {
  return {
    ...input,
    allowOfflineExecution: false,
  };
}
