/**
 * Phase 3.7 — Read authorization contract (design + enforceable helpers).
 * Backend is authority — not client Firestore Rules.
 *
 * Order: verify identity → role → scope → validate resource →
 * server-side scope filter → query → field redaction → return.
 * NEVER query-all then client filter.
 */

import type { AccessScope, Permission } from "@/types/roles";
import { canAccess, isWithinScope, type ScopeResource } from "@/permissions/rbac";
import type { ReadSafetyLevel } from "@/domain/read/ReadQuery";
import {
  classificationFor,
  type ReadExposureClass,
} from "@/domain/canonical/FinancialFieldClassification";

export type ReadAuthStep =
  | "verify_identity"
  | "resolve_role"
  | "resolve_scope"
  | "validate_resource"
  | "server_scope_filter"
  | "query"
  | "field_redaction"
  | "return";

export const READ_AUTHORIZATION_PIPELINE: ReadAuthStep[] = [
  "verify_identity",
  "resolve_role",
  "resolve_scope",
  "validate_resource",
  "server_scope_filter",
  "query",
  "field_redaction",
  "return",
];

export type ScopedFilter = {
  countryIds?: string[];
  cityIds?: string[];
  agentIds?: string[];
};

/**
 * Build server-side scope filter from actor scope.
 * Global → empty filter (no restriction).
 * Never returns "unrestricted client-side" for country/city/agent.
 */
export function buildServerSideScopeFilter(scope: AccessScope): ScopedFilter {
  switch (scope.type) {
    case "global":
      return {};
    case "country":
      return { countryIds: [...(scope.countryIds ?? [])] };
    case "city":
      return { cityIds: [...(scope.cityIds ?? [])] };
    case "agent":
      return {
        agentIds: [...(scope.agentIds ?? [])],
        countryIds: [...(scope.countryIds ?? [])],
      };
    default:
      return { countryIds: [] };
  }
}

/**
 * Filter rows server-side. Must be applied before returning to client.
 */
export function applyServerSideScopeFilter<T extends ScopeResource>(
  rows: T[],
  scope: AccessScope,
): T[] {
  if (scope.type === "global") return rows;
  return rows.filter((row) => isWithinScope(scope, row));
}

export function assertReadAuthorized(input: {
  permissions: Permission[];
  scope: AccessScope;
  required: Permission;
  resource?: ScopeResource;
}): { ok: true } | { ok: false; reason: string } {
  if (!canAccess(input.permissions, input.scope, input.required, input.resource)) {
    return { ok: false, reason: "permission_or_scope_denied" };
  }
  return { ok: true };
}

/**
 * Forbid generic collection query APIs.
 */
export function isGenericCollectionReadPath(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes("/api/read") ||
    p.includes("firestore/query") ||
    /\/api\/collection\//.test(p) ||
    p.includes("?collection=")
  );
}

export function exposureToReadSafety(
  exposure: ReadExposureClass,
): ReadSafetyLevel {
  switch (exposure) {
    case "READ_SAFE":
      return "SAFE";
    case "READ_WITH_WARNING":
      return "SAFE_WITH_WARNING";
    case "DO_NOT_EXPOSE_YET":
      return "BLOCKED";
    default:
      return "BLOCKED";
  }
}

export function redactFinancialFields<T extends Record<string, unknown>>(
  record: T,
): { data: Partial<T>; blockedFields: string[]; safety: ReadSafetyLevel } {
  const data: Partial<T> = {};
  const blockedFields: string[] = [];
  let worst: ReadSafetyLevel = "SAFE";

  for (const [key, value] of Object.entries(record)) {
    const cls = classificationFor(key);
    if (!cls) {
      (data as Record<string, unknown>)[key] = value;
      continue;
    }
    const level = exposureToReadSafety(cls.exposure);
    if (level === "BLOCKED") {
      blockedFields.push(key);
      worst = "BLOCKED";
      continue;
    }
    (data as Record<string, unknown>)[key] = value;
    if (level === "SAFE_WITH_WARNING" && worst === "SAFE") {
      worst = "SAFE_WITH_WARNING";
    }
  }

  return { data, blockedFields, safety: worst };
}
