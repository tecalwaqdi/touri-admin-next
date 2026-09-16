/**
 * Authoritative settlement state model = Settlement V2 + FR1–FR7.
 *
 * Dual-SM blocker (B7) cleared for Production finance arming readiness:
 * - Write / SoD / payment paths → Settlement V2 exclusively
 * - Legacy/synthetic SettlementStateMachine → offline unit SettlementService only
 * - UI presentation maps V2 → display labels (never write SoT)
 *
 * Does NOT rewrite historical persisted records.
 */

import type { SettlementV2Status } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  SETTLEMENT_V2_TRANSITIONS,
  assertSettlementTransition,
  canTransitionSettlementV2,
  mapV2StatusToSyntheticDisplay,
} from "@/domain/settlement/v2/SettlementV2StateMachine";
import type { SettlementStatus } from "@/domain/settlement/Settlement";
import { SYNTHETIC_SETTLEMENT_SM_ROLE } from "@/domain/settlement/SettlementStateMachine";

export const AUTHORITATIVE_SETTLEMENT_STATE_MODEL = "settlement_v2_fr1_fr7" as const;

export const DUAL_SETTLEMENT_SM_BLOCKER_CLEARED = true as const;

/** Map persisted Legacy / synthetic status → V2 (compatibility read only). */
export function mapLegacyOrSyntheticStatusToV2(
  status: SettlementStatus | string,
): SettlementV2Status {
  switch (status) {
    case "draft":
      return "draft";
    case "under_review":
    case "approved":
      return "locked";
    case "closed":
      return "settled";
    case "rejected":
    case "reversed":
      return "voided";
    case "locked":
      return "locked";
    case "partially_paid":
      return "partially_paid";
    case "settled":
      return "settled";
    case "voided":
      return "voided";
    default:
      return "draft";
  }
}

export function presentSettlementOperationalState(input: {
  v2Status: SettlementV2Status;
  paymentState?: string | null;
}): {
  settlementState: SettlementV2Status;
  paymentState: string | null;
  displayLabel: ReturnType<typeof mapV2StatusToSyntheticDisplay>;
  authoritativeModel: typeof AUTHORITATIVE_SETTLEMENT_STATE_MODEL;
} {
  return {
    settlementState: input.v2Status,
    paymentState: input.paymentState ?? null,
    displayLabel: mapV2StatusToSyntheticDisplay(input.v2Status),
    authoritativeModel: AUTHORITATIVE_SETTLEMENT_STATE_MODEL,
  };
}

/** Production write gate helper — rejects synthetic SM as write SoT. */
export function assertProductionUsesSettlementV2(input: {
  writeModel: "settlement_v2" | "synthetic_legacy";
}): void {
  if (input.writeModel !== "settlement_v2") {
    throw new Error(
      "PRODUCTION_SETTLEMENT_WRITE_REQUIRES_V2: synthetic/legacy SM is offline-only",
    );
  }
}

export const SETTLEMENT_STATE_COMPATIBILITY = {
  authoritative: AUTHORITATIVE_SETTLEMENT_STATE_MODEL,
  dualSmBlockerCleared: DUAL_SETTLEMENT_SM_BLOCKER_CLEARED,
  productionWriteModel: "settlement_v2" as const,
  syntheticSmRole: SYNTHETIC_SETTLEMENT_SM_ROLE,
  v2Transitions: SETTLEMENT_V2_TRANSITIONS,
  canTransition: canTransitionSettlementV2,
  assertTransition: assertSettlementTransition,
  mapLegacyToV2: mapLegacyOrSyntheticStatusToV2,
  mapV2ToDisplay: mapV2StatusToSyntheticDisplay,
  present: presentSettlementOperationalState,
  assertProductionUsesSettlementV2,
} as const;
