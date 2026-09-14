/**
 * Phase 4A-4 — Cancellation model (safe actor/reason/evidence).
 * Evidence:
 * - driver_trip_service: status_code cancelled_by_driver + cancelledBy + cancelReason + cancelledAt
 * - Admin adapter: cancelled_by_code / cancel_reason / cancellation_reason
 * - Customer cancel → cancelled_by_customer
 * - autoCancelOrders → expired
 * Never invent actor from absence.
 */

import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";

export type TripCancelActor =
  | "customer"
  | "driver"
  | "admin"
  | "system"
  | "unknown";

export type TripCancellationKnowledge =
  | "proven"
  | "inferred_from_status_code"
  | "missing"
  | "unknown"
  | "conflicting";

export type TripCancellationRead = {
  isCancelled: boolean;
  actor: TripCancelActor;
  actorKnowledge: TripCancellationKnowledge;
  reason: string | null;
  reasonKnowledge: "proven" | "missing" | "unknown";
  cancelledAtUtc: string | null;
  evidenceFields: string[];
  warnings: string[];
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function actorFromCancelledBy(raw: string | null): TripCancelActor | null {
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (n === "customer" || n.includes("customer") || n === "user") return "customer";
  if (n === "driver" || n.includes("driver") || n === "mndob") return "driver";
  if (n === "admin" || n.includes("admin")) return "admin";
  if (n === "system" || n === "expired" || n.includes("auto")) return "system";
  return null;
}

function actorFromStatusCode(code: TripLifecycleStatus | string | null): TripCancelActor | null {
  if (!code) return null;
  switch (code) {
    case "cancelled_by_customer":
      return "customer";
    case "cancelled_by_driver":
      return "driver";
    case "cancelled_by_admin":
      return "admin";
    case "expired":
      return "system";
    default:
      return null;
  }
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function resolveTripCancellation(input: {
  lifecycleStatus: TripLifecycleStatus;
  cancelledBy?: unknown;
  cancelled_by?: unknown;
  cancelled_by_code?: unknown;
  canceled_by?: unknown;
  cancelReason?: unknown;
  cancel_reason?: unknown;
  cancellation_reason?: unknown;
  cancelled_reason?: unknown;
  reason?: unknown;
  cancelledAt?: unknown;
  cancelled_at?: unknown;
}): TripCancellationRead {
  const evidenceFields: string[] = [];
  const warnings: string[] = [];

  const isCancelLifecycle =
    input.lifecycleStatus === "cancelled_by_customer" ||
    input.lifecycleStatus === "cancelled_by_driver" ||
    input.lifecycleStatus === "cancelled_by_admin" ||
    input.lifecycleStatus === "expired";

  const cancelledByRaw =
    str(input.cancelledBy) ??
    str(input.cancelled_by) ??
    str(input.cancelled_by_code) ??
    str(input.canceled_by);
  if (cancelledByRaw) evidenceFields.push("cancelledBy_or_code");

  const reason =
    str(input.cancelReason) ??
    str(input.cancel_reason) ??
    str(input.cancellation_reason) ??
    str(input.cancelled_reason) ??
    // `reason` is ambiguous — only accept when cancel lifecycle proven
    (isCancelLifecycle ? str(input.reason) : null);
  if (reason) evidenceFields.push("cancel_reason");

  const cancelledAtUtc =
    iso(input.cancelledAt) ?? iso(input.cancelled_at);
  if (cancelledAtUtc) evidenceFields.push("cancelledAt");

  if (!isCancelLifecycle && !cancelledByRaw && !reason && !cancelledAtUtc) {
    return {
      isCancelled: false,
      actor: "unknown",
      actorKnowledge: "missing",
      reason: null,
      reasonKnowledge: "missing",
      cancelledAtUtc: null,
      evidenceFields,
      warnings,
    };
  }

  const fromField = actorFromCancelledBy(cancelledByRaw);
  const fromCode = actorFromStatusCode(input.lifecycleStatus);

  let actor: TripCancelActor = "unknown";
  let actorKnowledge: TripCancellationKnowledge = "missing";

  if (fromField && fromCode && fromField !== fromCode) {
    actor = "unknown";
    actorKnowledge = "conflicting";
    warnings.push(
      `cancel_actor_conflict: cancelledBy=${fromField} vs status_code=${fromCode}`,
    );
  } else if (fromField) {
    actor = fromField;
    actorKnowledge = "proven";
  } else if (fromCode) {
    actor = fromCode;
    actorKnowledge = "inferred_from_status_code";
  } else if (isCancelLifecycle) {
    actor = "unknown";
    actorKnowledge = "unknown";
    warnings.push("cancel_lifecycle_without_proven_actor");
  }

  return {
    isCancelled: isCancelLifecycle || Boolean(cancelledByRaw),
    actor,
    actorKnowledge,
    reason,
    reasonKnowledge: reason ? "proven" : "missing",
    cancelledAtUtc,
    evidenceFields,
    warnings,
  };
}
