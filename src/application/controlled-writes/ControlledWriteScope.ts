/**
 * Phase 5 — country / resource scope for Controlled Writes.
 * UI route visibility is NOT authorization.
 */

import { isWithinScope } from "@/permissions/rbac";
import type {
  ControlledWriteActor,
  ControlledWriteCommand,
  ControlledWriteStageResult,
} from "@/application/controlled-writes/ControlledWriteTypes";

export function assertControlledWriteScope(
  actor: ControlledWriteActor,
  command: ControlledWriteCommand,
): ControlledWriteStageResult {
  if (!command.countryId.trim()) {
    return {
      stage: "scope",
      ok: false,
      code: "SCOPE_DENIED",
      detail: "countryId is required",
    };
  }

  const ok = isWithinScope(actor.scope, {
    countryId: command.countryId,
    agentId:
      command.resource === "agent" ? command.resourceId : undefined,
  });

  if (!ok) {
    return {
      stage: "scope",
      ok: false,
      code: "SCOPE_DENIED",
      detail: `Actor scope ${actor.scope.type} cannot mutate ${command.resource}/${command.resourceId} in ${command.countryId}`,
    };
  }

  return { stage: "scope", ok: true };
}
