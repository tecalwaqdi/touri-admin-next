/**
 * Phase 5C — Customer Controlled Write application service / pipeline.
 *
 * UI → Application Command → Verified Actor → RBAC → Scope →
 * Membership Validation → Precondition → Idempotency →
 * AUDIT_INTENT → Controlled Customer Write Repository →
 * safe mutation → AUDIT_RESULT → Canonical Response
 *
 * Never UI→Firestore. Production writes remain disabled.
 * No Finance coupling. Auth sync deferred (CUSTOMER_AUTH_WRITE_ENABLED=false).
 */

import type {
  CustomerControlledWriteCommand,
  CustomerWriteCanonicalResponse,
  CustomerWriteFlagGate,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import {
  CustomerWriteError,
  isCustomerWriteErrorCode,
  type CustomerWriteErrorCode,
} from "@/application/controlled-writes/customers/CustomerWriteErrors";
import { assertCustomerWriteRbac } from "@/application/controlled-writes/customers/CustomerWriteRbac";
import { assertCustomerWriteScope } from "@/application/controlled-writes/customers/CustomerWriteScope";
import {
  evaluateCustomerWritePreconditions,
  type CustomerWriteLoadPort,
} from "@/application/controlled-writes/customers/CustomerWritePreconditions";
import { validateCustomerWriteCommandPayload } from "@/application/controlled-writes/customers/CustomerWriteValidation";
import {
  checkCustomerWriteIdempotency,
  type CustomerWriteIdempotencyStore,
} from "@/application/controlled-writes/customers/CustomerWriteIdempotency";
import {
  buildCustomerWriteAuditIntent,
  buildCustomerWriteAuditResult,
  type CustomerWriteAuditPort,
} from "@/application/controlled-writes/customers/CustomerWriteAudit";
import type { CustomerWriteRepository } from "@/application/controlled-writes/customers/CustomerWriteRepository";
import {
  assertCustomerProductionWriteEnabled,
  snapshotCustomerWriteFlags,
} from "@/application/controlled-writes/customers/CustomerWriteFlags";

export type CustomerControlledWriteServiceDeps = {
  flags: CustomerWriteFlagGate;
  loadPort: CustomerWriteLoadPort;
  repository: CustomerWriteRepository;
  idempotency: CustomerWriteIdempotencyStore;
  audit: CustomerWriteAuditPort;
  /**
   * Offline/fake/emulator only. When true, Production flag gate is skipped
   * AFTER proving default denial in dedicated tests. MUST be false for any
   * Production runtime wiring.
   */
  allowOfflineExecution?: boolean;
};

function deny(
  command: CustomerControlledWriteCommand,
  code: CustomerWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): CustomerWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    customerId: command.customerId,
    productionWriteExecuted: false,
    authWriteExecuted: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: CustomerWriteErrorCode;
  message: string;
} {
  if (err instanceof CustomerWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isCustomerWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: CustomerWriteErrorCode }).code,
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
 * Execute one Customer Controlled Write command through the full pipeline.
 */
export async function executeCustomerControlledWrite(
  command: CustomerControlledWriteCommand,
  deps: CustomerControlledWriteServiceDeps,
): Promise<CustomerWriteCanonicalResponse> {
  try {
    // Verified actor presence
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }

    // Validation (payload shape / reason codes / sanitized note)
    const validated = validateCustomerWriteCommandPayload(command);

    // Production gate — before any mutation attempt
    const flags = snapshotCustomerWriteFlags(deps.flags);
    if (!deps.allowOfflineExecution) {
      try {
        assertCustomerProductionWriteEnabled(flags);
      } catch (err) {
        const mapped = toErrorCode(err);
        return deny(command, mapped.code, mapped.message);
      }
    }

    // RBAC
    assertCustomerWriteRbac(command.actor, command.action);

    // Load canonical snapshot (precondition read)
    const loaded = await deps.loadPort.loadForWrite(command.customerId);
    if (!loaded || !loaded.exists) {
      throw new CustomerWriteError(
        "CUSTOMER_NOT_FOUND",
        `Customer ${command.customerId} not found`,
      );
    }

    // Scope (canonical country — no inference) before remaining preconditions
    assertCustomerWriteScope(command.actor, loaded);

    // Membership + preconditions + state machine + active-trip guard
    const { snapshot, toState } = evaluateCustomerWritePreconditions(
      command,
      loaded,
    );

    // Idempotency
    const idemp = await checkCustomerWriteIdempotency(deps.idempotency, command);
    if (idemp.kind === "replay") {
      const replayIntent = buildCustomerWriteAuditIntent({
        actorUid: command.actor.uid,
        actorRole: command.actor.role,
        action: command.action,
        customerId: command.customerId,
        countryId: snapshot.countryId,
        countryScopeKind: snapshot.countryScopeKind,
        fromState: snapshot.operationalState,
        toState,
        reasonCode: validated.reasonCode,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordIntent(replayIntent);
      const replayResult = buildCustomerWriteAuditResult({
        intentAuditId: replayIntent.auditId,
        outcome: "idempotent_replay",
        code: "IDEMPOTENCY_REPLAY",
        action: command.action,
        customerId: command.customerId,
        countryId: snapshot.countryId,
        fromState: snapshot.operationalState,
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
        authWriteExecuted: false,
      };
    }

    // AUDIT_INTENT before repository
    const intent = buildCustomerWriteAuditIntent({
      actorUid: command.actor.uid,
      actorRole: command.actor.role,
      action: command.action,
      customerId: command.customerId,
      countryId: snapshot.countryId,
      countryScopeKind: snapshot.countryScopeKind,
      fromState: snapshot.operationalState,
      toState,
      reasonCode: validated.reasonCode,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    await deps.audit.recordIntent(intent);

    try {
      // Controlled repository (Fake / Emulator / Disabled / unreachable Production)
      // Apply re-checks token + trip under per-customer mutex.
      const applied = await deps.repository.apply({
        command,
        snapshot,
        fromState: snapshot.operationalState,
        toState,
      });

      const success: Extract<CustomerWriteCanonicalResponse, { ok: true }> = {
        ok: true,
        status: "applied",
        action: command.action,
        customerId: command.customerId,
        countryId: applied.countryId,
        fromState: applied.fromState,
        toState: applied.toState,
        auditIntentId: intent.auditId,
        auditResultId: "",
        productionWriteExecuted: false,
        authWriteExecuted: false,
      };

      await deps.idempotency.put({
        key: command.idempotencyKey,
        fingerprint: idemp.fingerprint,
        result: success,
        createdAtUtc: new Date().toISOString(),
      });

      const result = buildCustomerWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: "applied",
        action: command.action,
        customerId: command.customerId,
        countryId: snapshot.countryId,
        fromState: applied.fromState,
        toState: applied.toState,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordResult(result);

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
      const result = buildCustomerWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: mapped.code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
        code: mapped.code,
        action: command.action,
        customerId: command.customerId,
        countryId: snapshot.countryId,
        fromState: snapshot.operationalState,
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
export function productionRuntimeCustomerWriteDeps(input: {
  flags: CustomerWriteFlagGate;
  loadPort: CustomerWriteLoadPort;
  repository: CustomerWriteRepository;
  idempotency: CustomerWriteIdempotencyStore;
  audit: CustomerWriteAuditPort;
}): CustomerControlledWriteServiceDeps {
  return {
    ...input,
    allowOfflineExecution: false,
  };
}
