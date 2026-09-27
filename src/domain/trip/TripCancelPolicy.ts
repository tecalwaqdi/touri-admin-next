/**
 * Admin trip cancel — allowed only from non-terminal lifecycle states.
 * Mirrors Legacy Admi `_cancelBooking` eligibility (terminal → no-op).
 */

import {
  isTerminalTripLifecycle,
  type TripLifecycleStatus,
} from "@/domain/trip/TripLifecycleStatus";

export const TRIP_CANCEL_ALLOWED_FROM: readonly TripLifecycleStatus[] = [
  "pending_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "trip_started",
  "trip_in_progress",
] as const;

export function canAdminCancelTripLifecycle(
  status: TripLifecycleStatus | null | undefined,
): boolean {
  if (!status || status === "unmapped") return false;
  if (isTerminalTripLifecycle(status)) return false;
  return (TRIP_CANCEL_ALLOWED_FROM as readonly string[]).includes(status);
}

/** Fields written to Firestore `order/{id}` — parity with Admi cancel. */
export function buildAdminCancelOrderPatch(now: Date = new Date()): Record<string, unknown> {
  return {
    status_code: "cancelled_by_admin",
    cancelled_by_code: "cancelled_by_admin",
    cancelledBy: "admin",
    cancelledAt: now,
    halh_text: "ملغي",
    halh_order: "Canceled",
    ALLNOW: false,
    allnow: false,
    ActiveOrder: false,
    NotSestem: "admin_cancelled",
  };
}
