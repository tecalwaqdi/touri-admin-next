/**
 * Certified accounting snapshot eligibility — Domain trigger rules.
 *
 * A certified Finance SoT snapshot may be materialized when ALL hold:
 * 1. Trip lifecycle is `completed` (status_code) — implies courier/driver
 *    already accepted (قبول المندوب) and finished the trip.
 * 2. Payment is complete: electronic `paid` OR cash `cash_collected`.
 * 3. Payment channel is known (cash | card) — unknown blocks.
 *
 * Not eligible at mere driver acceptance (`driver_assigned`) or payment
 * pending — amounts and settlement direction are not yet final.
 *
 * Materialization itself remains gated by FINANCE_WRITE_ENABLED + RBAC.
 * This module only decides Domain readiness — it does not write.
 */

import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import type { TripPaymentStatus } from "@/domain/trip/TripPaymentModels";

export type SnapshotPaymentChannel = "cash" | "card" | "unknown";

export type CertifiedSnapshotEligibilityInput = {
  lifecycleStatus: TripLifecycleStatus | string;
  /** True when Domain already mapped lifecycle to completed. */
  lifecycleCompleted?: boolean;
  paymentChannel: SnapshotPaymentChannel;
  paymentStatus: TripPaymentStatus | string;
  /** Optional corroboration: driver was assigned / accepted at some point. */
  driverAcceptedOrAssigned?: boolean | null;
};

export type CertifiedSnapshotEligibilityResult = {
  eligible: boolean;
  blockers: string[];
  /**
   * Exact Domain trigger label for operators / reports.
   * Arabic explanation belongs in presentation; this is the machine key.
   */
  trigger:
    | "trip_completed_and_payment_complete"
    | "not_eligible";
  reasons: string[];
};

const PAYMENT_COMPLETE = new Set(["paid", "cash_collected", "captured"]);

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Domain-correct lifecycle point for certified snapshot creation:
 * trip completed + payment complete (paid / cash_collected).
 * Driver acceptance is a prerequisite of completion, not a separate gate
 * when status_code is authoritative completed.
 */
export function evaluateCertifiedAccountingSnapshotEligibility(
  input: CertifiedSnapshotEligibilityInput,
): CertifiedSnapshotEligibilityResult {
  const blockers: string[] = [];
  const reasons: string[] = [];

  const lifecycle = normalize(String(input.lifecycleStatus));
  const completed =
    input.lifecycleCompleted === true ||
    lifecycle === "completed" ||
    lifecycle === "trip_completed";

  if (!completed) {
    blockers.push("trip_not_completed");
    reasons.push(
      "Snapshot requires status_code completed (courier acceptance alone is not enough).",
    );
  } else {
    reasons.push(
      "Trip lifecycle completed — courier/driver acceptance already occurred in the completed path.",
    );
  }

  if (input.paymentChannel === "unknown") {
    blockers.push("payment_channel_unknown");
    reasons.push("Payment channel must be cash or card/electronic.");
  }

  const payStatus = normalize(String(input.paymentStatus));
  const paymentComplete = PAYMENT_COMPLETE.has(payStatus);
  if (!paymentComplete) {
    blockers.push("payment_not_complete");
    reasons.push(
      "Payment must be paid (electronic) or cash_collected (cash).",
    );
  } else {
    reasons.push(`Payment complete (${payStatus}).`);
  }

  // Soft corroboration only — do not block completed trips lacking the flag.
  if (
    completed &&
    input.driverAcceptedOrAssigned === false
  ) {
    reasons.push(
      "driverAcceptedOrAssigned=false but completed status_code still authoritative.",
    );
  }

  const eligible = blockers.length === 0;
  return {
    eligible,
    blockers,
    trigger: eligible
      ? "trip_completed_and_payment_complete"
      : "not_eligible",
    reasons,
  };
}

/** Convenience for FR1 / materialize callers that already have majors. */
export function assertEligibleForCertifiedSnapshot(
  input: CertifiedSnapshotEligibilityInput,
): void {
  const result = evaluateCertifiedAccountingSnapshotEligibility(input);
  if (!result.eligible) {
    throw new Error(
      `certified_snapshot_not_eligible:${result.blockers.join(",")}`,
    );
  }
}
