/**
 * Phase 5B — Server-side RBAC for Agent Controlled Writes.
 * Permission: agents:manage. Auditor/support never write unless explicitly
 * in allowed roles with the permission. agent_user must NOT manage other Agents.
 * Unknown DENY.
 */

import { hasPermission } from "@/permissions/rbac";
import type { Permission, Role } from "@/types/roles";
import type {
  AgentControlledWriteAction,
  VerifiedAgentWriteActor,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

export const AGENT_WRITE_PERMISSION: Permission = "agents:manage";

/** Roles intended to hold agents:manage for Controlled Writes. */
export const AGENT_WRITE_ALLOWED_ROLES: readonly Role[] = [
  "super_admin",
  "operations_manager",
  "country_admin",
] as const;

const NEVER_WRITE_ROLES: readonly Role[] = [
  "auditor",
  "reporting_viewer",
  "agent_user",
  "support_agent",
  "accountant",
  "finance_approver",
] as const;

export function actorMayWriteAgents(
  actor: VerifiedAgentWriteActor,
  action: AgentControlledWriteAction,
): boolean {
  void action;
  if (!actor.uid?.trim()) return false;
  if (!actor.role) return false;
  // agent_user / support / auditor / finance: hard deny (cannot manage Agents)
  if ((NEVER_WRITE_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  if (!(AGENT_WRITE_ALLOWED_ROLES as readonly string[]).includes(actor.role)) {
    return false;
  }
  return hasPermission(actor.permissions, AGENT_WRITE_PERMISSION);
}

export function assertAgentWriteRbac(
  actor: VerifiedAgentWriteActor,
  action: AgentControlledWriteAction,
): void {
  if (!actorMayWriteAgents(actor, action)) {
    throw new AgentWriteError(
      "PERMISSION_DENIED",
      `Missing ${AGENT_WRITE_PERMISSION} for agent.${action} (role=${actor.role})`,
    );
  }
}
