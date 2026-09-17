/**
 * Phase 5D — ControlledWritesService facade.
 *
 * Routes ONLY explicit supported operations:
 *   executeDriverCommand / executeAgentCommand / executeCustomerCommand
 *
 * NO genericWrite / genericUpdate / rawFirestoreMutation.
 * Reuses 5A/5B/5C pipelines — does not rebuild domain logic.
 *
 * Production writes remain disabled. Finance not started.
 */

import type {
  DriverControlledWriteCommand,
  DriverWriteCanonicalResponse,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type {
  AgentControlledWriteCommand,
  AgentWriteCanonicalResponse,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import type {
  CustomerControlledWriteCommand,
  CustomerWriteCanonicalResponse,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import type { DriverControlledWriteServiceDeps } from "@/application/controlled-writes/drivers/DriverControlledWriteService";
import type { AgentControlledWriteServiceDeps } from "@/application/controlled-writes/agents/AgentControlledWriteService";
import type { CustomerControlledWriteServiceDeps } from "@/application/controlled-writes/customers/CustomerControlledWriteService";
import { executeDriverControlledWrite } from "@/application/controlled-writes/drivers/DriverControlledWriteService";
import { executeAgentControlledWrite } from "@/application/controlled-writes/agents/AgentControlledWriteService";
import { executeCustomerControlledWrite } from "@/application/controlled-writes/customers/CustomerControlledWriteService";
import {
  assertConsolidationProductionGates,
  type ConsolidationWriteFlagGate,
  DEFAULT_CONSOLIDATION_FLAGS_FALSE,
} from "@/application/controlled-writes/ControlledWriteConsolidationGates";
import {
  CONTROLLED_WRITES_ENABLEMENT,
  assertEnablementNotActivated,
} from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  isAllowedAgentAction,
  isAllowedCustomerAction,
  isAllowedDriverAction,
  isAllowedWriteResource,
} from "@/application/controlled-writes/ControlledWriteResourceAllowlist";
import {
  ControlledWriteConsolidationError,
  type ControlledWriteErrorCode,
} from "@/application/controlled-writes/ControlledWriteErrorCatalog";
import {
  buildConsolidatedFingerprint,
  checkConsolidatedIdempotency,
  type ConsolidatedIdempotencyStore,
  InMemoryConsolidatedIdempotencyStore,
} from "@/application/controlled-writes/ControlledWriteConsolidatedIdempotency";
import {
  buildConsolidatedAuditIntent,
  buildConsolidatedAuditResult,
  hashStateSummary,
  type ConsolidatedAuditPort,
  InMemoryConsolidatedAuditPort,
} from "@/application/controlled-writes/ControlledWriteConsolidatedAudit";

export type DomainCommandResponse =
  | DriverWriteCanonicalResponse
  | AgentWriteCanonicalResponse
  | CustomerWriteCanonicalResponse;

export type FacadeDenialResponse = {
  ok: false;
  status: "denied" | "failed";
  code: ControlledWriteErrorCode;
  message: string;
  resource?: string;
  action?: string;
  productionWriteExecuted: false;
  authWriteExecuted: false;
  financeWriteExecuted: false;
  tripWriteExecuted: false;
};

export type ControlledWritesServiceDeps = {
  driver: DriverControlledWriteServiceDeps;
  agent: AgentControlledWriteServiceDeps;
  customer: CustomerControlledWriteServiceDeps;
  flags?: ConsolidationWriteFlagGate;
  sharedIdempotency?: ConsolidatedIdempotencyStore;
  consolidatedAudit?: ConsolidatedAuditPort;
  /**
   * Offline/fake/emulator only. When true, Production consolidation gates
   * are skipped AFTER dedicated denial tests. MUST be false for Production.
   */
  allowOfflineExecution?: boolean;
};

function facadeDeny(
  code: ControlledWriteErrorCode,
  message: string,
  meta?: { resource?: string; action?: string },
): FacadeDenialResponse {
  return {
    ok: false,
    status: code === "INTERNAL_WRITE_FAILURE" ? "failed" : "denied",
    code,
    message,
    resource: meta?.resource,
    action: meta?.action,
    productionWriteExecuted: false,
    authWriteExecuted: false,
    financeWriteExecuted: false,
    tripWriteExecuted: false,
  };
}

function reasonPayload(
  command:
    | DriverControlledWriteCommand
    | AgentControlledWriteCommand
    | CustomerControlledWriteCommand,
): string {
  const reason =
    "reasonCode" in command && command.reasonCode
      ? String(command.reasonCode)
      : "";
  const note =
    "note" in command && typeof command.note === "string" ? command.note : "";
  return `${reason}|${note}`;
}

/**
 * Consolidated Controlled Writes coordinator.
 * Explicit methods only — no arbitrary collection write API.
 */
export class ControlledWritesService {
  readonly enablement = CONTROLLED_WRITES_ENABLEMENT;
  private readonly flags: ConsolidationWriteFlagGate;
  private readonly sharedIdempotency: ConsolidatedIdempotencyStore;
  private readonly consolidatedAudit: ConsolidatedAuditPort;
  private readonly allowOffline: boolean;

  constructor(private readonly deps: ControlledWritesServiceDeps) {
    this.flags = deps.flags ?? DEFAULT_CONSOLIDATION_FLAGS_FALSE;
    this.sharedIdempotency =
      deps.sharedIdempotency ?? new InMemoryConsolidatedIdempotencyStore();
    this.consolidatedAudit =
      deps.consolidatedAudit ?? new InMemoryConsolidatedAuditPort();
    this.allowOffline = deps.allowOfflineExecution === true;
    assertEnablementNotActivated();
  }

  /** Explicit deny for non-allowlisted resources — no mutation. */
  rejectUnsupportedResource(resource: string): FacadeDenialResponse {
    return facadeDeny(
      "UNSUPPORTED_WRITE_RESOURCE",
      `Write resource "${resource}" is not allowlisted (driver|agent|customer only)`,
      { resource },
    );
  }

  /**
   * Intentionally absent APIs (compile-time / runtime guard documentation):
   * - genericWrite(collection, data)
   * - genericUpdate(documentPath, payload)
   * - rawFirestoreMutation()
   */
  get forbiddenGenericApis(): readonly string[] {
    return [
      "genericWrite",
      "genericUpdate",
      "rawFirestoreMutation",
    ] as const;
  }

  /**
   * Agent domain write-gate evaluation with ZERO resource I/O.
   * Call from API layer BEFORE any Agent existence lookup so gated-off
   * responses are identical for existing and nonexistent Agent ids.
   * Returns null when offline allow is active or gates pass.
   */
  denyAgentWriteIfDisabled(action: string): FacadeDenialResponse | null {
    if (this.allowOffline) return null;
    try {
      assertConsolidationProductionGates("agent", this.flags);
      return null;
    } catch (err) {
      if (err instanceof ControlledWriteConsolidationError) {
        return facadeDeny(err.code, err.message, {
          resource: "agent",
          action,
        });
      }
      throw err;
    }
  }

  /**
   * Driver domain write-gate evaluation with ZERO resource I/O.
   * Same isolation contract as denyAgentWriteIfDisabled.
   */
  denyDriverWriteIfDisabled(action: string): FacadeDenialResponse | null {
    if (this.allowOffline) return null;
    try {
      assertConsolidationProductionGates("driver", this.flags);
      return null;
    } catch (err) {
      if (err instanceof ControlledWriteConsolidationError) {
        return facadeDeny(err.code, err.message, {
          resource: "driver",
          action,
        });
      }
      throw err;
    }
  }

  async executeDriverCommand(
    command: DriverControlledWriteCommand,
  ): Promise<DriverWriteCanonicalResponse | FacadeDenialResponse> {
    if (!isAllowedWriteResource("driver")) {
      return this.rejectUnsupportedResource("driver");
    }
    if (!isAllowedDriverAction(command.action)) {
      return facadeDeny(
        "UNSUPPORTED_WRITE_ACTION",
        `Driver action "${command.action}" not allowlisted`,
        { resource: "driver", action: command.action },
      );
    }
    return this.route("driver", command.driverId, command.action, command, () =>
      executeDriverControlledWrite(command, {
        ...this.deps.driver,
        allowOfflineExecution:
          this.allowOffline || this.deps.driver.allowOfflineExecution,
      }),
    );
  }

  async executeAgentCommand(
    command: AgentControlledWriteCommand,
  ): Promise<AgentWriteCanonicalResponse | FacadeDenialResponse> {
    if (!isAllowedAgentAction(command.action)) {
      return facadeDeny(
        "UNSUPPORTED_WRITE_ACTION",
        `Agent action "${command.action}" not allowlisted`,
        { resource: "agent", action: command.action },
      );
    }
    return this.route("agent", command.agentId, command.action, command, () =>
      executeAgentControlledWrite(command, {
        ...this.deps.agent,
        allowOfflineExecution:
          this.allowOffline || this.deps.agent.allowOfflineExecution,
      }),
    );
  }

  async executeCustomerCommand(
    command: CustomerControlledWriteCommand,
  ): Promise<CustomerWriteCanonicalResponse | FacadeDenialResponse> {
    if (!isAllowedCustomerAction(command.action)) {
      return facadeDeny(
        "UNSUPPORTED_WRITE_ACTION",
        `Customer action "${command.action}" not allowlisted`,
        { resource: "customer", action: command.action },
      );
    }
    return this.route(
      "customer",
      command.customerId,
      command.action,
      command,
      () =>
        executeCustomerControlledWrite(command, {
          ...this.deps.customer,
          allowOfflineExecution:
            this.allowOffline || this.deps.customer.allowOfflineExecution,
        }),
    );
  }

  private async route<
    T extends DomainCommandResponse,
    C extends
      | DriverControlledWriteCommand
      | AgentControlledWriteCommand
      | CustomerControlledWriteCommand,
  >(
    resource: "driver" | "agent" | "customer",
    targetId: string,
    action: string,
    command: C,
    run: () => Promise<T>,
  ): Promise<T | FacadeDenialResponse> {
    assertEnablementNotActivated();

    // Production gate — distinct codes; no repository call when denied.
    if (!this.allowOffline) {
      try {
        assertConsolidationProductionGates(resource, this.flags);
      } catch (err) {
        if (err instanceof ControlledWriteConsolidationError) {
          return facadeDeny(err.code, err.message, { resource, action });
        }
        throw err;
      }
    }

    const fingerprint = buildConsolidatedFingerprint({
      actorUid: command.actor.uid,
      resource,
      targetId,
      action,
      expectedCurrentState: command.expectedCurrentState,
      preconditionToken: command.preconditionToken,
      payload: reasonPayload(command),
    });

    const beforeHash = hashStateSummary([
      resource,
      targetId,
      command.expectedCurrentState,
      command.preconditionToken,
    ]);

    let intentId: string | undefined;
    try {
      const idemp = await checkConsolidatedIdempotency(
        this.sharedIdempotency,
        command.idempotencyKey,
        fingerprint,
      );
      if (idemp.kind === "replay") {
        const intent = buildConsolidatedAuditIntent({
          actorUid: command.actor.uid,
          actorRole: command.actor.role,
          resourceType: resource,
          resourceId: targetId,
          action,
          requestId: command.correlationId,
          idempotencyReference: command.idempotencyKey,
          beforeStateHash: beforeHash,
        });
        await this.consolidatedAudit.recordIntent(intent);
        const result = buildConsolidatedAuditResult({
          intentAuditId: intent.auditId,
          actorUid: command.actor.uid,
          actorRole: command.actor.role,
          resourceType: resource,
          resourceId: targetId,
          action,
          requestId: command.correlationId,
          idempotencyReference: command.idempotencyKey,
          beforeStateHash: beforeHash,
          afterStateHash: beforeHash,
          result: "idempotent_replay",
        });
        await this.consolidatedAudit.recordResult(result);
        // Domain may still return its own replay shape; prefer domain call for
        // canonical response when stores are aligned. Shared replay short-circuits
        // to avoid a second mutation.
        const domain = await run();
        return domain;
      }

      const intent = buildConsolidatedAuditIntent({
        actorUid: command.actor.uid,
        actorRole: command.actor.role,
        resourceType: resource,
        resourceId: targetId,
        action,
        requestId: command.correlationId,
        idempotencyReference: command.idempotencyKey,
        beforeStateHash: beforeHash,
      });
      intentId = intent.auditId;
      await this.consolidatedAudit.recordIntent(intent);

      const outcome = await run();

      if (outcome.ok && outcome.status === "applied") {
        await this.sharedIdempotency.put({
          key: command.idempotencyKey,
          fingerprint,
          resource,
          action,
          targetId,
          actorUid: command.actor.uid,
          outcome: "applied",
          createdAtUtc: new Date().toISOString(),
        });
      }

      const afterHash = outcome.ok
        ? hashStateSummary([resource, targetId, "applied", action])
        : beforeHash;

      await this.consolidatedAudit.recordResult(
        buildConsolidatedAuditResult({
          intentAuditId: intent.auditId,
          actorUid: command.actor.uid,
          actorRole: command.actor.role,
          resourceType: resource,
          resourceId: targetId,
          action,
          requestId: command.correlationId,
          idempotencyReference: command.idempotencyKey,
          beforeStateHash: beforeHash,
          afterStateHash: afterHash,
          result: outcome.ok
            ? outcome.status === "idempotent_replay"
              ? "idempotent_replay"
              : "applied"
            : outcome.status === "failed"
              ? "failed"
              : "denied",
          failureCode: outcome.ok ? undefined : outcome.code,
        }),
      );

      return outcome;
    } catch (err) {
      if (err instanceof ControlledWriteConsolidationError) {
        if (intentId) {
          await this.consolidatedAudit.recordResult(
            buildConsolidatedAuditResult({
              intentAuditId: intentId,
              actorUid: command.actor.uid,
              actorRole: command.actor.role,
              resourceType: resource,
              resourceId: targetId,
              action,
              requestId: command.correlationId,
              idempotencyReference: command.idempotencyKey,
              beforeStateHash: beforeHash,
              afterStateHash: beforeHash,
              result: "denied",
              failureCode: err.code,
            }),
          );
        }
        return facadeDeny(err.code, err.message, { resource, action });
      }
      throw err;
    }
  }
}

/** Factory for offline consolidation harness. */
export function createControlledWritesService(
  deps: ControlledWritesServiceDeps,
): ControlledWritesService {
  return new ControlledWritesService(deps);
}
