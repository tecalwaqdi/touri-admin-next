/**
 * Per-document Admin review — Domain contract for Driver Registration V2 slots.
 * Maps to Cloud Function `reviewDriverDocument` (approve | reject | request_replacement).
 */

export const DRIVER_DOCUMENT_REVIEW_SLOTS = [
  "national_id",
  "driver_license",
  "driver_license_back",
  "vehicle_registration",
  "vehicle_insurance",
  "vehicle_photo",
  "profile_photo",
] as const;

export type DriverDocumentReviewSlot =
  (typeof DRIVER_DOCUMENT_REVIEW_SLOTS)[number];

/** UI / API actions. */
export const DRIVER_DOCUMENT_REVIEW_ACTIONS = [
  "approve",
  "reject",
  "needs_changes",
] as const;

export type DriverDocumentReviewAction =
  (typeof DRIVER_DOCUMENT_REVIEW_ACTIONS)[number];

/** Canonical slot review statuses (presentation + storage). */
export const DRIVER_DOCUMENT_SLOT_STATUSES = [
  "pending",
  "pending_review",
  "uploaded",
  "approved",
  "rejected",
  "needs_changes",
  "needs_replacement",
  "needs_reupload",
  "expired",
] as const;

export type DriverDocumentSlotStatus =
  (typeof DRIVER_DOCUMENT_SLOT_STATUSES)[number];

/** Slots the Production CF `reviewDriverDocument` accepts today. */
export const CF_REVIEWABLE_DOCUMENT_TYPES = [
  "national_id",
  "driver_license",
  "driver_license_front",
  "driver_license_back",
  "vehicle_registration",
  "vehicle_insurance",
] as const;

export type CfReviewableDocumentType =
  (typeof CF_REVIEWABLE_DOCUMENT_TYPES)[number];

/** Registration states that may receive per-document review. Draft/unsubmitted blocked. */
const REVIEWABLE_REGISTRATION = new Set([
  "pending_review",
  "needs_changes",
  "approved",
  "rejected",
  "suspended",
]);

const BLOCKED_REGISTRATION = new Set([
  "draft",
  "none",
  "",
  "incomplete",
  "not_submitted",
]);

export function isDriverDocumentReviewSlot(
  value: string,
): value is DriverDocumentReviewSlot {
  return (DRIVER_DOCUMENT_REVIEW_SLOTS as readonly string[]).includes(value);
}

export function isDriverDocumentReviewAction(
  value: string,
): value is DriverDocumentReviewAction {
  return (DRIVER_DOCUMENT_REVIEW_ACTIONS as readonly string[]).includes(value);
}

/** Map Admin Next action → CF action. */
export function toCfDocumentReviewAction(
  action: DriverDocumentReviewAction,
): "approve" | "reject" | "request_replacement" {
  if (action === "needs_changes") return "request_replacement";
  return action;
}

/** Map CF / storage status → UI status. */
export function normalizeDocumentSlotReviewStatus(
  raw: string | null | undefined,
): DriverDocumentSlotStatus | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "needs_replacement" || s === "needs_reupload") return "needs_changes";
  if ((DRIVER_DOCUMENT_SLOT_STATUSES as readonly string[]).includes(s)) {
    return s as DriverDocumentSlotStatus;
  }
  return null;
}

/** Map slot id → CF documentType argument. */
export function toCfDocumentType(
  slot: DriverDocumentReviewSlot,
): CfReviewableDocumentType | null {
  switch (slot) {
    case "national_id":
      return "national_id";
    case "driver_license":
      return "driver_license";
    case "driver_license_back":
      return "driver_license_back";
    case "vehicle_registration":
      return "vehicle_registration";
    case "vehicle_insurance":
      return "vehicle_insurance";
    case "profile_photo":
    case "vehicle_photo":
      // Not in Production CF DOC_FIELD_BY_TYPE — Application must fail closed.
      return null;
  }
}

export function assertRegistrationAllowsDocumentReview(input: {
  registrationStatus: string | null | undefined;
  submissionStatus?: string | null | undefined;
}): void {
  const reg = String(input.registrationStatus ?? "")
    .trim()
    .toLowerCase();
  const sub = String(input.submissionStatus ?? "")
    .trim()
    .toLowerCase();
  if (BLOCKED_REGISTRATION.has(reg) || reg === "draft") {
    throw Object.assign(new Error("DRIVER_NOT_READY"), {
      code: "DRIVER_NOT_READY",
    });
  }
  if (
    sub === "draft" ||
    sub === "not_submitted" ||
    sub === "notsubmitted" ||
    sub === "incomplete"
  ) {
    throw Object.assign(new Error("DRIVER_NOT_READY"), {
      code: "DRIVER_NOT_READY",
    });
  }
  if (!REVIEWABLE_REGISTRATION.has(reg)) {
    throw Object.assign(new Error("DRIVER_NOT_READY"), {
      code: "DRIVER_NOT_READY",
    });
  }
}

export function legalDocumentReviewActions(input: {
  presence: "present" | "missing" | "unknown";
  reviewStatus: string | null;
  registrationStatus: string | null;
}): DriverDocumentReviewAction[] {
  try {
    assertRegistrationAllowsDocumentReview({
      registrationStatus: input.registrationStatus,
    });
  } catch {
    return [];
  }
  if (input.presence !== "present") return [];
  const status = normalizeDocumentSlotReviewStatus(input.reviewStatus);
  // Already terminal for this cycle — still allow re-review when pending-ish.
  if (status === "approved") {
    return ["reject", "needs_changes"];
  }
  if (status === "rejected" || status === "needs_changes") {
    return ["approve", "reject", "needs_changes"];
  }
  return ["approve", "reject", "needs_changes"];
}
