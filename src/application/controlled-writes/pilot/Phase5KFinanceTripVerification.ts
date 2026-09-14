/**
 * Phase 5K — finance + trip read-only classification for provisioned fixture.
 */

import {
  classifyPhase5GFinanceSafety,
  isPhase5GFinancePilotSafe,
  type Phase5GFinanceSafetyFacts,
} from "@/application/controlled-writes/pilot/Phase5GFinanceSafetyClassification";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";

export type Phase5KFinanceTripVerificationResult = {
  readonly financialImpact: "none" | "present" | "unknown";
  readonly pendingSettlement: boolean | "unknown";
  readonly walletMutationRequired: boolean | "unknown";
  readonly hasActiveTrip: boolean | "unknown";
  readonly tripState: "idle" | "busy" | "unknown";
  readonly financePilotSafe: boolean;
  readonly denials: readonly string[];
  readonly classificationSource: "legacy_user_doc_fields";
};

/**
 * Finance: map Phase 5G walletImpact "none" → walletMutationRequired=false.
 * Unknown outstanding/bank fields classified explicitly (fail-closed for Pilot).
 * Trip: on_trip via canonical mapper — busy → hasActiveTrip true.
 */
export function verifyPhase5KFinanceAndTrip(
  data: Record<string, unknown> | null,
): Phase5KFinanceTripVerificationResult {
  if (!data) {
    return {
      financialImpact: "unknown",
      pendingSettlement: "unknown",
      walletMutationRequired: "unknown",
      hasActiveTrip: "unknown",
      tripState: "unknown",
      financePilotSafe: false,
      denials: ["FINANCE_TRIP_NO_DOC"],
      classificationSource: "legacy_user_doc_fields",
    };
  }

  const finance: Phase5GFinanceSafetyFacts = classifyPhase5GFinanceSafety(data);
  const walletMutationRequired: boolean | "unknown" =
    finance.walletImpact === "none"
      ? false
      : finance.walletImpact === "unknown"
        ? "unknown"
        : "unknown";

  const axes = mapDriverCanonicalStatuses({
    registration_status:
      data.registration_status == null
        ? null
        : String(data.registration_status),
    actev_mndob: typeof data.actev_mndob === "boolean" ? data.actev_mndob : null,
    is_online: typeof data.is_online === "boolean" ? data.is_online : null,
    on_trip: typeof data.on_trip === "boolean" ? data.on_trip : null,
    mndon_newacc:
      typeof data.mndon_newacc === "boolean" ? data.mndon_newacc : null,
  });

  const tripState: "idle" | "busy" | "unknown" =
    axes.tripState.value === "busy"
      ? "busy"
      : axes.tripState.value === "idle"
        ? "idle"
        : "unknown";
  const hasActiveTrip: boolean | "unknown" =
    tripState === "busy" ? true : tripState === "idle" ? false : "unknown";

  const denials: string[] = [];
  if (finance.financeImpactClassification !== "none") {
    denials.push(`FINANCIAL_IMPACT:${finance.financeImpactClassification}`);
  }
  if (finance.pendingSettlement !== false) {
    denials.push(`PENDING_SETTLEMENT:${String(finance.pendingSettlement)}`);
  }
  if (walletMutationRequired !== false) {
    denials.push(`WALLET_MUTATION:${String(walletMutationRequired)}`);
  }
  if (hasActiveTrip !== false) {
    denials.push(`ACTIVE_TRIP:${String(hasActiveTrip)}`);
  }

  return {
    financialImpact: finance.financeImpactClassification,
    pendingSettlement: finance.pendingSettlement,
    walletMutationRequired,
    hasActiveTrip,
    tripState,
    financePilotSafe: isPhase5GFinancePilotSafe(finance) && hasActiveTrip === false,
    denials,
    classificationSource: "legacy_user_doc_fields",
  };
}
