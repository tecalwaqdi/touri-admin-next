/**
 * PC-4 — Map admin_next_cw_audit documents → AuditEvent DTO (redacted).
 */

import type { AuditEvent } from "@/types/audit";
import { redactAuditRecord, redactAuditJson } from "@/domain/audit/redactAuditPayload";

export type ControlledWriteAuditDoc = {
  id: string;
  data: Record<string, unknown>;
};

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

/**
 * Normalize CW audit INTENT/RESULT docs into the shared AuditEvent contract.
 * Finance audit events are intentionally not accepted here.
 */
export function mapControlledWriteAuditToEvent(
  doc: ControlledWriteAuditDoc,
): AuditEvent {
  const d = doc.data;
  const kind = str(d.kind);
  const resource =
    str(d.resource) ||
    str(d.resourceType) ||
    (typeof d.driverId === "string" ? "driver" : "unknown");
  const resourceId =
    str(d.resourceId) ||
    str(d.driverId) ||
    str(d.agentId) ||
    str(d.customerId) ||
    null;

  const before =
    d.beforeSafe != null
      ? redactAuditJson(d.beforeSafe)
      : d.beforeSnapshot != null
        ? redactAuditJson(d.beforeSnapshot)
        : undefined;
  const after =
    d.afterSafe != null
      ? redactAuditJson(d.afterSafe)
      : d.toState != null || d.fromState != null
        ? redactAuditRecord({
            fromState: d.fromState ?? null,
            toState: d.toState ?? null,
            outcome: d.outcome ?? null,
            kind,
          })
        : d.afterSnapshot != null
          ? redactAuditJson(d.afterSnapshot)
          : undefined;

  return {
    auditId: str(d.auditId, doc.id),
    actorUserId: str(d.actorUid) || str(d.actorUserId) || "unknown",
    actorRole: str(d.actorRole) || "unknown",
    action: str(d.action) || kind || "unknown",
    resourceType: resource,
    resourceId: resourceId || null,
    beforeSnapshot: before,
    afterSnapshot: after,
    reason: str(d.reasonCode) || str(d.reason) || undefined,
    environment: str(d.environment) || str(d.phase) || "production",
    createdAtUtc: str(d.createdAtUtc) || new Date(0).toISOString(),
    correlationId: str(d.correlationId) || str(d.idempotencyKey) || doc.id,
  };
}

export function matchesAuditFilters(
  event: AuditEvent,
  filters: {
    actorUserId?: string;
    action?: string;
    resourceType?: string;
    environment?: string;
  },
): boolean {
  if (
    filters.actorUserId &&
    !event.actorUserId
      .toLowerCase()
      .includes(filters.actorUserId.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    filters.action &&
    !event.action.toLowerCase().includes(filters.action.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    filters.resourceType &&
    !event.resourceType
      .toLowerCase()
      .includes(filters.resourceType.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    filters.environment &&
    !event.environment
      .toLowerCase()
      .includes(filters.environment.trim().toLowerCase())
  ) {
    return false;
  }
  return true;
}
