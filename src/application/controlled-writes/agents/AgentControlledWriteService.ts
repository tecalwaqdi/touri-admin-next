/**
 * Phase 5B — Agent Controlled Write application service / pipeline.
 *
 * UI → Application Command → Verified Actor → RBAC → Scope →
 * Agent Domain Validation → Precondition → One-country-one-Agent guard →
 * Idempotency → AUDIT_INTENT → Controlled Agent Write Repository →
 * safe mutation → AUDIT_RESULT → Canonical Response
 *
 * Never UI→Firestore. Production writes remain disabled.
 * No Customer / Finance coupling.
 */

import type {
  AgentControlledWriteCommand,
  AgentWriteCanonicalResponse,
  AgentWriteFlagGate,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import {
  AgentWriteError,
  isAgentWriteErrorCode,
  type AgentWriteErrorCode,
} from "@/application/controlled-writes/agents/AgentWriteErrors";
import { assertAgentWriteRbac } from "@/application/controlled-writes/agents/AgentWriteRbac";
import { assertAgentWriteScope } from "@/application/controlled-writes/agents/AgentWriteScope";
import {
  evaluateAgentWritePreconditions,
  type AgentWriteLoadPort,
} from "@/application/controlled-writes/agents/AgentWritePreconditions";
import { validateAgentWriteCommandPayload } from "@/application/controlled-writes/agents/AgentWriteValidation";
import {
  checkAgentWriteIdempotency,
  type AgentWriteIdempotencyStore,
} from "@/application/controlled-writes/agents/AgentWriteIdempotency";
import {
  buildAgentWriteAuditIntent,
  buildAgentWriteAuditResult,
  type AgentWriteAuditPort,
} from "@/application/controlled-writes/agents/AgentWriteAudit";
import type { AgentWriteRepository } from "@/application/controlled-writes/agents/AgentWriteRepository";
import {
  assertAgentProductionWriteEnabled,
  snapshotAgentWriteFlags,
} from "@/application/controlled-writes/agents/AgentWriteFlags";

export type AgentControlledWriteServiceDeps = {
  flags: AgentWriteFlagGate;
  loadPort: AgentWriteLoadPort;
  repository: AgentWriteRepository;
  idempotency: AgentWriteIdempotencyStore;
  audit: AgentWriteAuditPort;
  /**
   * Offline/fake/emulator only. When true, Production flag gate is skipped
   * AFTER proving default denial in dedicated tests. MUST be false for any
   * Production runtime wiring.
   */
  allowOfflineExecution?: boolean;
};

function deny(
  command: AgentControlledWriteCommand,
  code: AgentWriteErrorCode,
  message: string,
  audit?: { intentId?: string; resultId?: string },
): AgentWriteCanonicalResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    action: command.action,
    agentId: command.agentId,
    productionWriteExecuted: false,
    auditIntentId: audit?.intentId,
    auditResultId: audit?.resultId,
  };
}

function toErrorCode(err: unknown): {
  code: AgentWriteErrorCode;
  message: string;
} {
  if (err instanceof AgentWriteError) {
    return { code: err.code, message: err.message };
  }
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    isAgentWriteErrorCode((err as { code: string }).code)
  ) {
    return {
      code: (err as { code: AgentWriteErrorCode }).code,
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
 * Execute one Agent Controlled Write command through the full pipeline.
 */
export async function executeAgentControlledWrite(
  command: AgentControlledWriteCommand,
  deps: AgentControlledWriteServiceDeps,
): Promise<AgentWriteCanonicalResponse> {
  try {
    // Verified actor presence
    if (!command.actor?.uid?.trim() || !command.actor.role) {
      return deny(command, "PERMISSION_DENIED", "Verified actor required");
    }

    // Validation (payload shape / reason codes / sanitized note)
    const validated = validateAgentWriteCommandPayload(command);

    // Production gate — before any mutation attempt
    const flags = snapshotAgentWriteFlags(deps.flags);
    if (!deps.allowOfflineExecution) {
      try {
        assertAgentProductionWriteEnabled(flags);
      } catch (err) {
        const mapped = toErrorCode(err);
        return deny(command, mapped.code, mapped.message);
      }
    }

    // RBAC
    assertAgentWriteRbac(command.actor, command.action);

    // Load canonical snapshot (precondition read)
    const loaded = await deps.loadPort.loadForWrite(command.agentId);
    if (!loaded || !loaded.exists) {
      throw new AgentWriteError(
        "AGENT_NOT_FOUND",
        `Agent ${command.agentId} not found`,
      );
    }
    if (loaded.excludedNonAgent || !loaded.isOperationalAgent) {
      throw new AgentWriteError(
        "NOT_OPERATIONAL_AGENT",
        `Agent ${command.agentId} is not an operational Agent`,
      );
    }

    // Scope (canonical country — no inference) before remaining preconditions
    assertAgentWriteScope(command.actor, loaded);

    // Preconditions + state machine + one-country-one-active guard
    const { snapshot, toState } = await evaluateAgentWritePreconditions(
      command,
      loaded,
      deps.loadPort,
    );

    // Idempotency
    const idemp = await checkAgentWriteIdempotency(deps.idempotency, command);
    if (idemp.kind === "replay") {
      const replayIntent = buildAgentWriteAuditIntent({
        actorUid: command.actor.uid,
        actorRole: command.actor.role,
        action: command.action,
        agentId: command.agentId,
        countryId: snapshot.countryId,
        countryScopeKind: snapshot.countryScopeKind,
        fromState: snapshot.operationalState,
        toState,
        reasonCode: validated.reasonCode,
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      await deps.audit.recordIntent(replayIntent);
      const replayResult = buildAgentWriteAuditResult({
        intentAuditId: replayIntent.auditId,
        outcome: "idempotent_replay",
        code: "IDEMPOTENCY_REPLAY",
        action: command.action,
        agentId: command.agentId,
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
      };
    }

    // AUDIT_INTENT before repository
    const intent = buildAgentWriteAuditIntent({
      actorUid: command.actor.uid,
      actorRole: command.actor.role,
      action: command.action,
      agentId: command.agentId,
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
      // Apply re-checks uniqueness inside concurrency-safe section.
      const applied = await deps.repository.apply({
        command,
        snapshot,
        fromState: snapshot.operationalState,
        toState,
      });

      const success: Extract<AgentWriteCanonicalResponse, { ok: true }> = {
        ok: true,
        status: "applied",
        action: command.action,
        agentId: command.agentId,
        countryId: applied.countryId,
        fromState: applied.fromState,
        toState: applied.toState,
        auditIntentId: intent.auditId,
        auditResultId: "",
        productionWriteExecuted: false,
      };

      await deps.idempotency.put({
        key: command.idempotencyKey,
        fingerprint: idemp.fingerprint,
        result: success,
        createdAtUtc: new Date().toISOString(),
      });

      const result = buildAgentWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: "applied",
        action: command.action,
        agentId: command.agentId,
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
      const result = buildAgentWriteAuditResult({
        intentAuditId: intent.auditId,
        outcome: mapped.code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
        code: mapped.code,
        action: command.action,
        agentId: command.agentId,
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
export function productionRuntimeAgentWriteDeps(input: {
  flags: AgentWriteFlagGate;
  loadPort: AgentWriteLoadPort;
  repository: AgentWriteRepository;
  idempotency: AgentWriteIdempotencyStore;
  audit: AgentWriteAuditPort;
}): AgentControlledWriteServiceDeps {
  return {
    ...input,
    allowOfflineExecution: false,
  };
}
