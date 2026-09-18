/**
 * Reusable synthetic fixture factory markers + id helpers for Admin Next pilots.
 * Explicit QA markers only — never real commercial records.
 */

export const ADMIN_NEXT_QA_MARKERS = Object.freeze([
  "is_test",
  "functional_test",
  "qa_fixture",
  "admin_next_pilot",
] as const);

export type AdminNextQaDomain =
  | "agent"
  | "customer"
  | "region"
  | "city"
  | "landmark"
  | "vehicle"
  | "partner"
  | "fleet"
  | "guide"
  | "support"
  | "notification"
  | "identity"
  | "finance";

export function qaResourceId(domain: AdminNextQaDomain, suffix: string): string {
  const clean = String(suffix || "x")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 24);
  return `test_adminnext_${domain}_${clean}`;
}

export function qaFirestoreMarkers(extra: Record<string, unknown> = {}) {
  return {
    is_test: true,
    functional_test: true,
    qa_fixture: true,
    admin_next_pilot: true,
    synthetic: true,
    ...extra,
  };
}

export function isExplicitQaId(id: string): boolean {
  return /^(test_|qa_|demo_|golden_|cp5_)/i.test(String(id || ""));
}
