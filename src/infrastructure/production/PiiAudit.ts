/**
 * Phase 4 DESIGN — sensitive field read audit event builder.
 * Emits observability-safe payloads only (no raw PII).
 */

import type { ProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";

export function auditSensitiveFieldRead(
  obs: ProductionReadObservability,
  input: {
    resource: string;
    field: string;
    actorUid?: string;
  },
): void {
  obs.emit({
    type: "sensitive_field_read",
    resource: input.resource,
    field: input.field,
    actorUidHash: input.actorUid
      ? `uid:${input.actorUid.length}:${input.actorUid.slice(0, 2)}…`
      : undefined,
  });
}
