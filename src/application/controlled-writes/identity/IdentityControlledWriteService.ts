/**
 * Identity controlled-write application service.
 * Pipeline: actor → permission → anti-escalation → scope → gates →
 * idempotency → audit INTENT → repo → audit RESULT → reconciliation hint.
 */

import type {
  IdentityWriteCanonicalResponse,
  IdentityWriteCommand,
  IdentityWriteFlagGate,
  IdentityWriteSnapshot,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";
import {
  IdentityWriteError,
  isIdentityWriteErrorCode,
  type IdentityWriteErrorCode,
} from "@/application/controlled-writes/identity/IdentityWriteErrors";
import {
  assertIdentityWriteAuthorization,
  buildIdentityPersonaPatch,
} from "@/application/controlled-writes/identity/IdentityWritePolicy";
import { assertIdentityProductionWriteEnabled } from "@/application/controlled-writes/identity/IdentityWriteFlags";
import type { IdentityWriteRepository } from "@/application/controlled-writes/identity/IdentityWriteRepository";

export type IdentityWriteLoadPort = {
  load(userId: string): Promise<IdentityWriteSnapshot | null>;
};

export type IdentityWriteIdempotencyStore = {
  get(key: string): Promise<IdentityWriteCanonicalResponse | null>;
  put(key: string, response: IdentityWriteCanonicalResponse): Promise<void>;
};

export type IdentityWriteAuditPort = {
  recordIntent(input: {
    command: IdentityWriteCommand;
  }): Promise<{ intentId: string }>;
  recordResult(input: {
    intentId: string;
    ok: boolean;
    code: string;
    command: IdentityWriteCommand;
  }): Promise<{ resultId: string }>;
};

export type IdentityControlledWriteServiceDeps = {
  flags: IdentityWriteFlagGate;
  loadPort: IdentityWriteLoadPort;
  repository: IdentityWriteRepository;
  idempotency: IdentityWriteIdempotencyStore;
  audit: IdentityWriteAuditPort;
  allowOfflineExecution?: boolean;
};

function deny(
  command: IdentityWriteCommand,
  code: IdentityWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): IdentityWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    targetUserId: command.targetUserId,
    productionWriteExecuted: false,
    claimsDirectSetCustomUserClaims: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: IdentityWriteErrorCode;
  message: string;
} {
  if (err instanceof IdentityWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isIdentityWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: IdentityWriteErrorCode }).code,
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return {
    code: "INTERNAL_WRITE_FAILURE",
    message: err instanceof Error ? err.message : String(err),
  };
}

export async function executeIdentityControlledWrite(
  command: IdentityWriteCommand,
  deps: IdentityControlledWriteServiceDeps,
): Promise<IdentityWriteCanonicalResponse> {
  try {
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }
    if (!command.idempotencyKey?.trim()) {
      return deny(command, "VALIDATION_FAILED", "idempotencyKey required");
    }
    if (!command.reasonCode?.trim()) {
      return deny(command, "VALIDATION_FAILED", "reasonCode required");
    }

    const replay = await deps.idempotency.get(command.idempotencyKey);
    if (replay) {
      return { ...replay, status: "idempotent_replay" };
    }

    if (!deps.allowOfflineExecution) {
      try {
        assertIdentityProductionWriteEnabled(deps.flags);
      } catch (err) {
        const { code, message } = toErrorCode(err);
        return deny(command, code, message);
      }
    }

    const loaded = await deps.loadPort.load(command.targetUserId);
    const snapshot: IdentityWriteSnapshot =
      loaded ??
      ({
        userId: command.targetUserId,
        exists: false,
        isPanelPersona: false,
        role: "none",
        disabled: false,
        countryId: null,
        agentId: null,
        superAdminCountHint: null,
        preconditionToken: command.preconditionToken,
        reconciliation: "PERSONA_MISSING",
      } satisfies IdentityWriteSnapshot);

    if (command.action !== "create_persona" && !snapshot.exists) {
      return deny(command, "USER_NOT_FOUND", "Target user not found");
    }

    if (
      snapshot.exists &&
      (snapshot.role !== command.expectedCurrentRole ||
        snapshot.disabled !== command.expectedDisabled ||
        snapshot.preconditionToken !== command.preconditionToken)
    ) {
      return deny(
        command,
        "PRECONDITION_FAILED",
        "expectedCurrentRole/disabled/token mismatch",
      );
    }

    const authz = assertIdentityWriteAuthorization({
      actor: command.actor,
      command,
      snapshot,
    });
    if (!authz.ok) {
      return deny(
        command,
        authz.code as IdentityWriteErrorCode,
        authz.message,
      );
    }

    const { patch, allowlistedFields } = buildIdentityPersonaPatch(command);
    const { intentId } = await deps.audit.recordIntent({ command });

    try {
      const applied = await deps.repository.apply({
        command,
        fromRole: snapshot.role,
        fromDisabled: snapshot.disabled,
        patch,
        allowlistedFields,
      });
      const response: IdentityWriteCanonicalResponse = {
        ok: true,
        status: "applied",
        code: "OK",
        message: "Identity persona mutation applied",
        action: command.action,
        targetUserId: command.targetUserId,
        productionWriteExecuted: applied.productionWriteExecuted,
        claimsDirectSetCustomUserClaims: false,
        reconciliation: "UNKNOWN",
        auditIntentId: intentId,
      };
      const { resultId } = await deps.audit.recordResult({
        intentId,
        ok: true,
        code: "OK",
        command,
      });
      response.auditResultId = resultId;
      await deps.idempotency.put(command.idempotencyKey, response);
      return response;
    } catch (err) {
      const { code, message } = toErrorCode(err);
      const { resultId } = await deps.audit.recordResult({
        intentId,
        ok: false,
        code,
        command,
      });
      return deny(command, code, message, { intentId, resultId });
    }
  } catch (err) {
    const { code, message } = toErrorCode(err);
    return deny(command, code, message);
  }
}
