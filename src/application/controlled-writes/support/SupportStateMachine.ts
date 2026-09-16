/**
 * Support status transitions — mirrors Legacy adminSupportStatusPatch semantics.
 */

import type { SupportDisplayStatus } from "@/application/controlled-writes/support/SupportWriteTypes";
import { SupportWriteError } from "@/application/controlled-writes/support/SupportWriteErrors";

const ALLOWED: Record<SupportDisplayStatus, readonly SupportDisplayStatus[]> = {
  new: ["open", "in_progress", "waiting_user", "resolved", "closed"],
  open: ["in_progress", "waiting_user", "resolved", "closed"],
  in_progress: ["waiting_user", "resolved", "closed", "open"],
  waiting_user: ["in_progress", "resolved", "closed", "open"],
  resolved: ["closed", "open", "in_progress"],
  closed: ["open", "in_progress"],
};

export function canTransitionSupportStatus(
  from: SupportDisplayStatus,
  to: SupportDisplayStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED[from].includes(to);
}

export function assertSupportStatusTransition(
  from: SupportDisplayStatus,
  to: SupportDisplayStatus,
): void {
  if (!canTransitionSupportStatus(from, to)) {
    throw new SupportWriteError(
      "ILLEGAL_STATUS_TRANSITION",
      `Illegal support transition: ${from} → ${to}`,
    );
  }
}

/** Legacy Firestore patch for display status (dual-write halh + status). */
export function buildSupportStatusPatch(input: {
  target: SupportDisplayStatus;
  isDriverSchema: boolean;
  nowIso: string;
}): Record<string, unknown> {
  const { target, isDriverSchema, nowIso } = input;
  let halh: string | undefined;
  let status: string | undefined;
  let workflow = "";

  switch (target) {
    case "new":
    case "open":
      halh = "Open";
      status = "open";
      workflow = "";
      break;
    case "in_progress":
      halh = "Open";
      status = "open";
      workflow = "in_progress";
      break;
    case "waiting_user":
      halh = "Open";
      status = "open";
      workflow = "waiting_user";
      break;
    case "resolved":
      halh = "Resolved";
      status = "resolved";
      workflow = "";
      break;
    case "closed":
      halh = "Closed";
      status = "closed";
      workflow = "";
      break;
  }

  const patch: Record<string, unknown> = {
    halh,
    status,
    admin_workflow: workflow,
    updated_at: nowIso,
  };
  if (target === "resolved") patch.resolved_at = nowIso;
  if (target === "closed") patch.closed_at = nowIso;
  if (isDriverSchema) patch.data = nowIso;
  return patch;
}
