/**
 * Phase 5 — Controlled Write pipeline (offline contract).
 *
 * Pipeline:
 * command → authenticated actor → RBAC → country/resource scope →
 * precondition read → validation → idempotency → audit intent →
 * controlled repository → write result → audit result
 *
 * Every mutation requires: explicit resource flag, global write flag, actor,
 * role permission, scope, precondition, idempotency, audit, failure-safe deny.
 *
 * No UI→Firestore. Production repository path remains DisabledWriteRepository.
 * FakeOfflineControlledWriteRepository exists only for offline contract tests.
 */

import {
  assertControlledWriteFlagsAllow,
  snapshotWriteFlags,
} from "@/application/controlled-writes/ControlledWriteFlags";
import { isControlledWriteCandidate } from "@/application/controlled-writes/ControlledWriteCandidates";
import { assertControlledWriteRbac } from "@/application/controlled-writes/ControlledWritePermissions";
import { assertControlledWriteScope } from "@/application/controlled-writes/ControlledWriteScope";
import {
  evaluateControlledWritePreconditions,
  type ControlledWritePreconditionSnapshot,
} from "@/application/controlled-writes/ControlledWritePreconditions";
import {
  buildCommandFingerprint,
  checkIdempotencyReplay,
  validateIdempotencyKey,
  type IdempotencyStore,
  InMemoryIdempotencyStore,
} from "@/application/controlled-writes/ControlledWriteIdempotency";
import {
  buildAuditIntent,
  buildAuditResult,
  type ControlledWriteAuditIntent,
  type ControlledWriteAuditResult,
} from "@/application/controlled-writes/ControlledWriteAudit";
import type {
  ControlledWriteActor,
  ControlledWriteCommand,
  ControlledWriteFlagSnapshot,
  ControlledWriteOutcome,
  ControlledWriteStageResult,
} from "@/application/controlled-writes/ControlledWriteTypes";
import type { AppEnvConfig } from "@/config/env";
import {
  DisabledWriteRepository,
  ProductionWriteDisabledError,
} from "@/infrastructure/production/DisabledWriteRepository";

export type ControlledWriteRepositoryPort = {
  /**
   * Apply mutation only when all gates passed.
   * Production impl must remain DisabledWriteRepository until activation.
   */
  apply(input: {
    command: ControlledWriteCommand;
    actor: ControlledWriteActor;
  }): Promise<{ applied: true } | never>;
};

/** Offline-only fake — never wired to Production Firebase. */
export class FakeOfflineControlledWriteRepository
  implements ControlledWriteRepositoryPort
{
  readonly kind = "fake_offline_controlled_write" as const;
  applied: Array<{ resourceId: string; action: string }> = [];

  async apply(input: {
    command: ControlledWriteCommand;
    actor: ControlledWriteActor;
  }): Promise<{ applied: true }> {
    this.applied.push({
      resourceId: input.command.resourceId,
      action: input.command.action,
    });
    return { applied: true };
  }
}

export class ProductionDisabledControlledWriteRepository
  implements ControlledWriteRepositoryPort
{
  private readonly disabled = new DisabledWriteRepository();

  async apply(input: {
    command: ControlledWriteCommand;
    actor: ControlledWriteActor;
  }): Promise<never> {
    return this.disabled.execute({
      resource: input.command.resource,
      operation: input.command.action,
      actorUid: input.actor.uid,
    });
  }
}

export type ControlledWritePipelineDeps = {
  flags: ControlledWriteFlagSnapshot;
  idempotency: IdempotencyStore;
  repository: ControlledWriteRepositoryPort;
  /**
   * Precondition read — caller supplies snapshot from Fake/emulator read path.
   * Production live precondition reads are NOT executed in Phase 5 readiness.
   */
  loadPrecondition: (
    command: ControlledWriteCommand,
  ) => Promise<ControlledWritePreconditionSnapshot>;
  recordAuditIntent?: (intent: ControlledWriteAuditIntent) => Promise<void>;
  recordAuditResult?: (result: ControlledWriteAuditResult) => Promise<void>;
  /**
   * When true, skip the hard activation deny AFTER flag checks for Fake offline
   * pipeline simulation of stages beyond write_flags.
   * MUST remain false for any Production path.
   */
  allowFakeOfflineExecution?: boolean;
};

function deny(
  stages: ControlledWriteStageResult[],
  stage: ControlledWriteStageResult,
  message: string,
): ControlledWriteOutcome {
  return {
    ok: false,
    status: "denied",
    stages: [...stages, stage],
    code: stage.code ?? "WRITE_FLAGS_DISABLED",
    message,
    productionWriteExecuted: false,
  };
}

/**
 * Run Controlled Write pipeline. Always reports productionWriteExecuted=false
 * unless a future activation module is introduced (not this phase).
 */
export async function runControlledWritePipeline(
  actor: ControlledWriteActor,
  command: ControlledWriteCommand,
  deps: ControlledWritePipelineDeps,
): Promise<ControlledWriteOutcome> {
  const stages: ControlledWriteStageResult[] = [];

  stages.push({ stage: "command", ok: true });
  stages.push({
    stage: "authenticated_actor",
    ok: Boolean(actor.uid && actor.role),
    detail: actor.uid ? undefined : "missing actor",
  });
  if (!stages[stages.length - 1]!.ok) {
    return deny(stages, stages[stages.length - 1]!, "Unauthenticated actor");
  }

  if (!isControlledWriteCandidate(command.resource, command.action)) {
    return deny(
      stages,
      {
        stage: "command",
        ok: false,
        code: "ACTION_DEFERRED",
        detail: `${command.resource}.${command.action} not in low-risk candidate set`,
      },
      "Action deferred / not in Controlled Write candidates",
    );
  }

  // Production path: flags must deny. Fake offline may bypass only AFTER proving
  // default denial separately in tests.
  const flagResult = assertControlledWriteFlagsAllow(
    command.resource,
    deps.flags,
  );
  if (!flagResult.ok) {
    if (!deps.allowFakeOfflineExecution) {
      return deny(stages, flagResult, flagResult.detail ?? "Write flags disabled");
    }
    stages.push({
      ...flagResult,
      detail: `${flagResult.detail} (fake_offline bypass for stage simulation)`,
    });
  } else {
    stages.push(flagResult);
  }

  const rbac = assertControlledWriteRbac(
    actor,
    command.resource,
    command.action,
  );
  stages.push(rbac);
  if (!rbac.ok) {
    return deny(stages, rbac, rbac.detail ?? "RBAC denied");
  }

  const scope = assertControlledWriteScope(actor, command);
  stages.push(scope);
  if (!scope.ok) {
    return deny(stages, scope, scope.detail ?? "Scope denied");
  }

  stages.push({ stage: "precondition_read", ok: true });
  const snapshot = await deps.loadPrecondition(command);
  const validation = evaluateControlledWritePreconditions(command, {
    ...snapshot,
    expected: command.expected ?? snapshot.expected,
  });
  stages.push(validation);
  if (!validation.ok) {
    return deny(stages, validation, validation.detail ?? "Precondition failed");
  }

  const idempKey = validateIdempotencyKey(command.idempotencyKey);
  if (!idempKey.ok) {
    return deny(stages, idempKey, idempKey.detail ?? "Invalid idempotency key");
  }

  const fingerprint = buildCommandFingerprint({
    resource: command.resource,
    action: command.action,
    resourceId: command.resourceId,
    countryId: command.countryId,
    reasonCode: command.reasonCode,
    preconditionToken: command.expected?.preconditionToken,
  });
  const idemp = await checkIdempotencyReplay(
    deps.idempotency,
    command.idempotencyKey,
    fingerprint,
  );
  if (idemp.kind === "conflict") {
    return deny(
      stages,
      {
        stage: "idempotency",
        ok: false,
        code: "IDEMPOTENCY_CONFLICT",
        detail: "idempotencyKey reused with different command fingerprint",
      },
      "Idempotency conflict",
    );
  }
  if (idemp.kind === "replay") {
    stages.push({
      stage: "idempotency",
      ok: true,
      code: "IDEMPOTENCY_REPLAY",
    });
    const intent = buildAuditIntent({
      actorUid: actor.uid,
      actorRole: actor.role,
      resource: command.resource,
      action: command.action,
      resourceId: command.resourceId,
      countryId: command.countryId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      reasonCode: command.reasonCode,
      beforeSafe: {
        registrationStatus: snapshot.observed.registrationStatus ?? null,
        accountEnabled: snapshot.observed.accountEnabled ?? null,
      },
    });
    await deps.recordAuditIntent?.(intent);
    const result = buildAuditResult({
      intentAuditId: intent.auditId,
      outcome: "idempotent_replay",
      code: "IDEMPOTENCY_REPLAY",
      resource: command.resource,
      action: command.action,
      resourceId: command.resourceId,
      countryId: command.countryId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    await deps.recordAuditResult?.(result);
    stages.push({ stage: "audit_intent", ok: true });
    stages.push({ stage: "audit_result", ok: true });
    return {
      ok: true,
      status: "idempotent_replay",
      stages,
      auditIntentId: intent.auditId,
      auditResultId: result.auditId,
      productionWriteExecuted: false,
    };
  }
  stages.push({ stage: "idempotency", ok: true });

  const intent = buildAuditIntent({
    actorUid: actor.uid,
    actorRole: actor.role,
    resource: command.resource,
    action: command.action,
    resourceId: command.resourceId,
    countryId: command.countryId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    reasonCode: command.reasonCode,
    beforeSafe: {
      registrationStatus: snapshot.observed.registrationStatus ?? null,
      accountEnabled: snapshot.observed.accountEnabled ?? null,
      agentOperationalActive:
        snapshot.observed.agentOperationalActive ?? null,
      customerAccountState: snapshot.observed.customerAccountState ?? null,
    },
  });
  await deps.recordAuditIntent?.(intent);
  stages.push({ stage: "audit_intent", ok: true, detail: intent.auditId });

  try {
    await deps.repository.apply({ command, actor });
    stages.push({ stage: "controlled_repository", ok: true });
    stages.push({ stage: "write_result", ok: true });
  } catch (err) {
    const code =
      err instanceof ProductionWriteDisabledError
        ? "REPOSITORY_DISABLED"
        : "failed";
    stages.push({
      stage: "controlled_repository",
      ok: false,
      code,
      detail: err instanceof Error ? err.message : String(err),
    });
    const result = buildAuditResult({
      intentAuditId: intent.auditId,
      outcome: "denied",
      code,
      resource: command.resource,
      action: command.action,
      resourceId: command.resourceId,
      countryId: command.countryId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });
    await deps.recordAuditResult?.(result);
    stages.push({ stage: "audit_result", ok: true });
    return {
      ok: false,
      status: "denied",
      stages,
      code,
      message: err instanceof Error ? err.message : String(err),
      productionWriteExecuted: false,
    };
  }

  await deps.idempotency.put({
    key: command.idempotencyKey,
    resource: command.resource,
    action: command.action,
    resourceId: command.resourceId,
    commandFingerprint: fingerprint,
    outcome: "applied",
    createdAtUtc: new Date().toISOString(),
  });

  const result = buildAuditResult({
    intentAuditId: intent.auditId,
    outcome: "applied",
    resource: command.resource,
    action: command.action,
    resourceId: command.resourceId,
    countryId: command.countryId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    afterSafe: { applied: true },
  });
  await deps.recordAuditResult?.(result);
  stages.push({ stage: "audit_result", ok: true });

  return {
    ok: true,
    status: "applied",
    stages,
    auditIntentId: intent.auditId,
    auditResultId: result.auditId,
    // Fake offline apply is not a Production write.
    productionWriteExecuted: false,
  };
}

export function defaultDeniedPipelineDeps(
  env: Pick<
    AppEnvConfig,
    | "PRODUCTION_WRITE_ENABLED"
    | "GLOBAL_PRODUCTION_WRITE_ENABLED"
    | "DRIVER_WRITE_ENABLED"
    | "AGENT_WRITE_ENABLED"
    | "CUSTOMER_WRITE_ENABLED"
    | "FINANCE_WRITE_ENABLED"
  >,
): ControlledWritePipelineDeps {
  return {
    flags: snapshotWriteFlags(env),
    idempotency: new InMemoryIdempotencyStore(),
    repository: new ProductionDisabledControlledWriteRepository(),
    loadPrecondition: async (command) => ({
      resource: command.resource,
      resourceId: command.resourceId,
      countryId: command.countryId,
      exists: true,
      observed: {
        registrationStatus: "pending_review",
        accountEnabled: "enabled",
        agentOperationalActive: false,
        agentAccountState: "enabled",
        customerAccountState: "enabled",
        preconditionToken: command.expected?.preconditionToken,
      },
      otherAgentsInCountry: [],
    }),
    allowFakeOfflineExecution: false,
  };
}
