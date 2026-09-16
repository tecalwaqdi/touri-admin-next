/**
 * Support controlled-write pipeline.
 * Browser → API → RBAC → scope → gate → idempotency → audit → repo.
 */

import type {
  SupportWriteCanonicalResponse,
  SupportWriteCommand,
  SupportWriteFlagGate,
  SupportWriteSnapshot,
  SupportDisplayStatus,
} from "@/application/controlled-writes/support/SupportWriteTypes";
import {
  SupportWriteError,
  isSupportWriteErrorCode,
  type SupportWriteErrorCode,
} from "@/application/controlled-writes/support/SupportWriteErrors";
import {
  assertSupportProductionWriteEnabled,
  snapshotSupportWriteFlags,
} from "@/application/controlled-writes/support/SupportWriteFlags";
import {
  assertSupportStatusTransition,
  buildSupportStatusPatch,
} from "@/application/controlled-writes/support/SupportStateMachine";
import type { SupportWriteRepository } from "@/application/controlled-writes/support/SupportWriteRepository";
import { hasPermission, isWithinScope } from "@/permissions/rbac";

export type SupportWriteLoadPort = {
  load(ticketId: string): Promise<SupportWriteSnapshot | null>;
};

export type SupportWriteIdempotencyStore = {
  get(key: string): Promise<SupportWriteCanonicalResponse | null>;
  put(key: string, response: SupportWriteCanonicalResponse): Promise<void>;
};

export type SupportWriteAuditPort = {
  recordIntent(input: {
    command: SupportWriteCommand;
  }): Promise<{ intentId: string }>;
  recordResult(input: {
    intentId: string;
    ok: boolean;
    code: string;
    command: SupportWriteCommand;
  }): Promise<{ resultId: string }>;
};

export type SupportControlledWriteServiceDeps = {
  flags: SupportWriteFlagGate;
  loadPort: SupportWriteLoadPort;
  repository: SupportWriteRepository;
  idempotency: SupportWriteIdempotencyStore;
  audit: SupportWriteAuditPort;
  allowOfflineExecution?: boolean;
};

function deny(
  command: SupportWriteCommand,
  code: SupportWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): SupportWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    ticketId: command.ticketId,
    productionWriteExecuted: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: SupportWriteErrorCode;
  message: string;
} {
  if (err instanceof SupportWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isSupportWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: SupportWriteErrorCode }).code,
      message: err instanceof Error ? err.message : String((err as { code: string }).code),
    };
  }
  return {
    code: "INTERNAL_WRITE_FAILURE",
    message: err instanceof Error ? err.message : String(err),
  };
}

function assertRbac(command: SupportWriteCommand): void {
  if (
    !hasPermission(command.actor.permissions, "customers:manage") &&
    !hasPermission(command.actor.permissions, "users:manage")
  ) {
    throw new SupportWriteError(
      "PERMISSION_DENIED",
      "customers:manage or users:manage required for support writes",
    );
  }
}

function assertScope(
  command: SupportWriteCommand,
  snap: SupportWriteSnapshot,
): void {
  if (command.actor.scope.type === "global") return;
  if (!snap.countryId) {
    throw new SupportWriteError(
      "SCOPE_DENIED",
      "Ticket countryId missing — cannot authorize country-scoped write",
    );
  }
  if (!isWithinScope(command.actor.scope, { countryId: snap.countryId })) {
    throw new SupportWriteError(
      "SCOPE_DENIED",
      `Ticket country ${snap.countryId} out of actor scope`,
    );
  }
}

function resolveTargetStatus(
  command: SupportWriteCommand,
): SupportDisplayStatus | null {
  if (command.action === "resolve") return "resolved";
  if (command.action === "reopen") return "open";
  if (command.action === "change_status") {
    if (!command.targetStatus) {
      throw new SupportWriteError(
        "VALIDATION_FAILED",
        "targetStatus required for change_status",
      );
    }
    return command.targetStatus;
  }
  return null;
}

function buildPatch(
  command: SupportWriteCommand,
  snap: SupportWriteSnapshot,
): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const target = resolveTargetStatus(command);

  if (target) {
    assertSupportStatusTransition(snap.displayStatus, target);
    return buildSupportStatusPatch({
      target,
      isDriverSchema: snap.isDriverSchema,
      nowIso,
    });
  }

  if (command.action === "assign" || command.action === "reassign") {
    const assignee = command.assigneeAdminId?.trim();
    if (!assignee) {
      throw new SupportWriteError(
        "VALIDATION_FAILED",
        "assigneeAdminId required",
      );
    }
    return {
      admin_assigned_to: assignee,
      updated_at: nowIso,
    };
  }

  if (command.action === "add_note") {
    const text = command.noteText?.trim();
    if (!text || text.length > 2000) {
      throw new SupportWriteError(
        "VALIDATION_FAILED",
        "noteText required (1..2000 chars)",
      );
    }
    return {
      admin_internal_notes_append: {
        text,
        adminId: command.actor.uid,
        at: nowIso,
      },
      updated_at: nowIso,
    };
  }

  if (command.action === "categorize") {
    const category = command.category?.trim();
    if (!category) {
      throw new SupportWriteError("VALIDATION_FAILED", "category required");
    }
    return { tsnef: category, updated_at: nowIso };
  }

  if (command.action === "update_priority") {
    const priority = command.priority?.trim();
    if (!priority) {
      throw new SupportWriteError("VALIDATION_FAILED", "priority required");
    }
    return { priority, updated_at: nowIso };
  }

  throw new SupportWriteError("VALIDATION_FAILED", `Unknown action`);
}

export async function executeSupportControlledWrite(
  command: SupportWriteCommand,
  deps: SupportControlledWriteServiceDeps,
): Promise<SupportWriteCanonicalResponse> {
  try {
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }
    if (!command.idempotencyKey?.trim()) {
      return deny(command, "VALIDATION_FAILED", "idempotencyKey required");
    }

    const flags = snapshotSupportWriteFlags(deps.flags);
    if (!deps.allowOfflineExecution) {
      try {
        assertSupportProductionWriteEnabled(flags);
      } catch (err) {
        const mapped = toErrorCode(err);
        return deny(command, mapped.code, mapped.message);
      }
    }

    assertRbac(command);

    const loaded = await deps.loadPort.load(command.ticketId);
    if (!loaded || !loaded.exists) {
      throw new SupportWriteError(
        "SUPPORT_NOT_FOUND",
        `Ticket ${command.ticketId} not found`,
      );
    }
    if (loaded.preconditionToken !== command.expectedPreconditionToken) {
      throw new SupportWriteError(
        "PRECONDITION_FAILED",
        "expectedPreconditionToken mismatch",
      );
    }

    assertScope(command, loaded);

    const replay = await deps.idempotency.get(command.idempotencyKey);
    if (replay) {
      return { ...replay, status: "idempotent_replay", productionWriteExecuted: false };
    }

    const patch = buildPatch(command, loaded);
    const { intentId } = await deps.audit.recordIntent({ command });

    const applied = await deps.repository.applyPatch({
      ticketId: command.ticketId,
      patch,
      preconditionToken: loaded.preconditionToken,
    });

    const { resultId } = await deps.audit.recordResult({
      intentId,
      ok: true,
      code: "APPLIED",
      command,
    });

    const response: SupportWriteCanonicalResponse = {
      ok: true,
      status: "applied",
      code: "APPLIED",
      message: "Support write applied (offline/fake or gated path)",
      action: command.action,
      ticketId: command.ticketId,
      productionWriteExecuted: false,
      auditIntentId: intentId,
      auditResultId: resultId,
      patchKeys: applied.patchKeys,
    };
    await deps.idempotency.put(command.idempotencyKey, response);
    return response;
  } catch (err) {
    const mapped = toErrorCode(err);
    return deny(command, mapped.code, mapped.message);
  }
}
