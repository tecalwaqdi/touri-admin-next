/**
 * Phase 5 — Controlled Write preconditions (never blind overwrite).
 * Agent activation: ONE COUNTRY = MAX ONE ACTIVE AGENT — DENY if another active;
 * never auto-deactivate the existing agent.
 */

import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import type { Agent } from "@/types/agent";
import type {
  ControlledWriteAction,
  ControlledWriteCommand,
  ControlledWriteExpectedState,
  ControlledWriteResource,
  ControlledWriteStageResult,
} from "@/application/controlled-writes/ControlledWriteTypes";

export type ControlledWritePreconditionSnapshot = {
  resource: ControlledWriteResource;
  resourceId: string;
  countryId: string;
  exists: boolean;
  expected?: ControlledWriteExpectedState;
  /** Current observed state used for comparison / policy. */
  observed: ControlledWriteExpectedState;
  /** Other agents in country (activation only). */
  otherAgentsInCountry?: Agent[];
};

export function evaluateDriverPrecondition(
  action: ControlledWriteAction,
  snapshot: ControlledWritePreconditionSnapshot,
): ControlledWriteStageResult {
  if (!snapshot.exists) {
    return {
      stage: "validation",
      ok: false,
      code: "PRECONDITION_FAILED",
      detail: "Driver not found",
    };
  }

  const reg = snapshot.observed.registrationStatus ?? "unknown";
  const account = snapshot.observed.accountEnabled ?? "unknown";

  if (snapshot.expected?.registrationStatus != null) {
    if (snapshot.expected.registrationStatus !== reg) {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: `registrationStatus expected=${snapshot.expected.registrationStatus} observed=${reg}`,
      };
    }
  }
  if (snapshot.expected?.preconditionToken != null) {
    if (
      snapshot.expected.preconditionToken !==
      snapshot.observed.preconditionToken
    ) {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: "preconditionToken mismatch (concurrency)",
      };
    }
  }

  switch (action) {
    case "approve":
      if (reg !== "pending_review" && reg !== "needs_changes") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: `approve requires pending_review|needs_changes, got ${reg}`,
        };
      }
      break;
    case "reject":
    case "needs_changes":
      if (reg !== "pending_review") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: `${action} requires pending_review, got ${reg}`,
        };
      }
      break;
    case "suspend":
      if (account === "disabled" && reg === "suspended") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: "Driver already suspended/disabled",
        };
      }
      break;
    default:
      return {
        stage: "validation",
        ok: false,
        code: "ACTION_NOT_IN_SCOPE",
        detail: `Unsupported driver action ${action}`,
      };
  }

  return { stage: "validation", ok: true };
}

export function evaluateAgentPrecondition(
  action: ControlledWriteAction,
  snapshot: ControlledWritePreconditionSnapshot,
): ControlledWriteStageResult {
  if (!snapshot.exists) {
    return {
      stage: "validation",
      ok: false,
      code: "PRECONDITION_FAILED",
      detail: "Agent not found",
    };
  }

  if (snapshot.expected?.preconditionToken != null) {
    if (
      snapshot.expected.preconditionToken !==
      snapshot.observed.preconditionToken
    ) {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: "preconditionToken mismatch (concurrency)",
      };
    }
  }

  const account = snapshot.observed.agentAccountState ?? "unknown";
  const active = snapshot.observed.agentOperationalActive === true;

  if (action === "activate") {
    if (account === "disabled") {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: "Suspended/disabled agents cannot be activated",
      };
    }

    const decision = agentAssignmentPolicy.canActivateAgent({
      countryId: snapshot.countryId,
      agentId: snapshot.resourceId,
      agentStatus: "inactive",
      existingAgents: snapshot.otherAgentsInCountry ?? [],
    });

    if (!decision.allowed) {
      return {
        stage: "validation",
        ok: false,
        code:
          decision.code === "COUNTRY_ALREADY_HAS_ACTIVE_AGENT"
            ? "AGENT_COUNTRY_ACTIVE_CONFLICT"
            : "PRECONDITION_FAILED",
        detail: `${decision.message} (no auto-deactivate)`,
      };
    }
    return { stage: "validation", ok: true };
  }

  if (action === "deactivate" || action === "suspend") {
    if (!active && account === "disabled") {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: "Agent already inactive/disabled",
      };
    }
    return { stage: "validation", ok: true };
  }

  return {
    stage: "validation",
    ok: false,
    code: "ACTION_NOT_IN_SCOPE",
    detail: `Unsupported agent action ${action}`,
  };
}

export function evaluateCustomerPrecondition(
  action: ControlledWriteAction,
  snapshot: ControlledWritePreconditionSnapshot,
): ControlledWriteStageResult {
  if (!snapshot.exists) {
    return {
      stage: "validation",
      ok: false,
      code: "PRECONDITION_FAILED",
      detail: "Customer not found",
    };
  }

  if (snapshot.expected?.preconditionToken != null) {
    if (
      snapshot.expected.preconditionToken !==
      snapshot.observed.preconditionToken
    ) {
      return {
        stage: "validation",
        ok: false,
        code: "PRECONDITION_FAILED",
        detail: "preconditionToken mismatch (concurrency)",
      };
    }
  }

  const account = snapshot.observed.customerAccountState ?? "unknown";

  switch (action) {
    case "disable":
    case "block":
      if (account === "disabled") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: "Customer already disabled",
        };
      }
      break;
    case "reactivate":
      if (account === "enabled") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: "Customer already enabled",
        };
      }
      if (account === "unknown") {
        return {
          stage: "validation",
          ok: false,
          code: "PRECONDITION_FAILED",
          detail: "Cannot reactivate when account state is unknown",
        };
      }
      break;
    default:
      return {
        stage: "validation",
        ok: false,
        code: "ACTION_NOT_IN_SCOPE",
        detail: `Unsupported customer action ${action}`,
      };
  }

  return { stage: "validation", ok: true };
}

export function evaluateControlledWritePreconditions(
  command: ControlledWriteCommand,
  snapshot: ControlledWritePreconditionSnapshot,
): ControlledWriteStageResult {
  const merged: ControlledWritePreconditionSnapshot = {
    ...snapshot,
    expected: command.expected ?? snapshot.expected,
  };
  switch (command.resource) {
    case "driver":
      return evaluateDriverPrecondition(command.action, merged);
    case "agent":
      return evaluateAgentPrecondition(command.action, merged);
    case "customer":
      return evaluateCustomerPrecondition(command.action, merged);
  }
}
