/**
 * Phase 4A-5 — Canonical driver registration lifecycle from Legacy fields.
 * Source: AdminDriverProfileView.reviewBucketFromRaw + UserRecord comments.
 * Never infer from actev_mndob / ngl / mndon_newacc.
 */

export const CANONICAL_DRIVER_REGISTRATION_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "needs_changes",
  "suspended",
  "unknown",
] as const;

export type CanonicalDriverRegistrationStatus =
  (typeof CANONICAL_DRIVER_REGISTRATION_STATUSES)[number];

export type RegistrationStatusSource =
  | "registration_status"
  | "submission_status"
  | "missing";

export type ResolveDriverRegistrationResult = {
  status: CanonicalDriverRegistrationStatus;
  raw: string | null;
  sourceField: RegistrationStatusSource;
  /** True when raw was a proven alias (submitted→pending_review, etc.). */
  aliasApplied: boolean;
};

/**
 * Prefer registration_status; fall back to submission_status (Legacy Admin).
 */
export function resolveCanonicalDriverRegistrationStatus(input: {
  registration_status?: unknown;
  submission_status?: unknown;
}): ResolveDriverRegistrationResult {
  const primary = normalizeRaw(input.registration_status);
  if (primary) {
    return mapRaw(primary, "registration_status");
  }
  const fallback = normalizeRaw(input.submission_status);
  if (fallback) {
    return mapRaw(fallback, "submission_status");
  }
  return {
    status: "unknown",
    raw: null,
    sourceField: "missing",
    aliasApplied: false,
  };
}

function normalizeRaw(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  return s.length ? s : null;
}

function mapRaw(
  raw: string,
  sourceField: Exclude<RegistrationStatusSource, "missing">,
): ResolveDriverRegistrationResult {
  switch (raw) {
    case "draft":
      return { status: "draft", raw, sourceField, aliasApplied: false };
    case "pending_review":
      return {
        status: "pending_review",
        raw,
        sourceField,
        aliasApplied: false,
      };
    case "submitted":
    case "pending":
      return {
        status: "pending_review",
        raw,
        sourceField,
        aliasApplied: true,
      };
    case "approved":
      return { status: "approved", raw, sourceField, aliasApplied: false };
    case "rejected":
      return { status: "rejected", raw, sourceField, aliasApplied: false };
    case "needs_changes":
      return {
        status: "needs_changes",
        raw,
        sourceField,
        aliasApplied: false,
      };
    case "changes_requested":
    case "changesrequested":
      return {
        status: "needs_changes",
        raw,
        sourceField,
        aliasApplied: true,
      };
    case "suspended":
    case "blocked":
      return {
        status: "suspended",
        raw,
        sourceField,
        aliasApplied: raw === "blocked",
      };
    default:
      return { status: "unknown", raw, sourceField, aliasApplied: false };
  }
}
