/**
 * FR4 Settlement Approval pilot — offline transition / post-state calculator.
 * No amount recompute. Proves draft → locked (= approved) with immutable money fields.
 */

import {
  FINANCE_FR4_EXACT_TRANSITION,
  FINANCE_FR4_OPS_APPROVAL_LABEL,
  FINANCE_FR4_POST_APPROVAL_STATUS,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import {
  assertFinanceFr4ApprovalTransitionAllowed,
  buildFinanceFr4SettlementApprovalPatch,
  financeFr4ApprovalIdempotencyKeyPattern,
} from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import { mapV2StatusToSyntheticDisplay } from "@/domain/settlement/v2/SettlementV2StateMachine";

export type FinanceFr4CalculatedApproval = {
  settlementId: typeof FINANCE_FR4_SETTLEMENT_DOC_ID;
  exactTransition: typeof FINANCE_FR4_EXACT_TRANSITION;
  fromStatus: "draft";
  toStatus: typeof FINANCE_FR4_POST_APPROVAL_STATUS;
  opsApprovalLabel: typeof FINANCE_FR4_OPS_APPROVAL_LABEL;
  currency: "SAR";
  direction: "DRIVER_PAYS_COMPANY";
  amountMinor: "1500";
  paidConfirmedMinor: "0";
  outstandingMinor: "1500";
  sourceAccountingSnapshotId: typeof FINANCE_FR4_SOURCE_SNAPSHOT_ID;
  mutatesFinanceSnapshot: false;
  mutatesSettlementAmounts: false;
  paymentExecutionForbidden: true;
  dualControlPass: boolean;
  approvalPatch: Record<string, unknown>;
  idempotencyKeyPattern: string;
  reconciliationStatus: "preconditions_ok" | "blocked";
  reconciliationBlockers: string[];
};

export function calculateFinanceFr4ApprovalFromFr2Draft(input: {
  settlement: Record<string, unknown>;
  approverUid: string;
  correlationId?: string;
  approvedAtUtc?: string;
}): FinanceFr4CalculatedApproval {
  const denials = assertFinanceFr4ApprovalTransitionAllowed({
    settlement: input.settlement,
    approverUid: input.approverUid,
  });
  const correlationId = input.correlationId ?? "fr4_calc_corr";
  const approvedAtUtc = input.approvedAtUtc ?? "2026-09-14T00:00:00.000Z";
  const patch = buildFinanceFr4SettlementApprovalPatch({
    approverUid: input.approverUid,
    correlationId,
    approvedAtUtc,
  });
  if (mapV2StatusToSyntheticDisplay("locked") !== "approved") {
    denials.push("ops_display_mapping_broken");
  }
  const dualControlPass = !denials.includes("dual_control_violation");

  return {
    settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
    exactTransition: FINANCE_FR4_EXACT_TRANSITION,
    fromStatus: "draft",
    toStatus: FINANCE_FR4_POST_APPROVAL_STATUS,
    opsApprovalLabel: FINANCE_FR4_OPS_APPROVAL_LABEL,
    currency: "SAR",
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: "1500",
    paidConfirmedMinor: "0",
    outstandingMinor: "1500",
    sourceAccountingSnapshotId: FINANCE_FR4_SOURCE_SNAPSHOT_ID,
    mutatesFinanceSnapshot: false,
    mutatesSettlementAmounts: false,
    paymentExecutionForbidden: true,
    dualControlPass,
    approvalPatch: patch,
    idempotencyKeyPattern: financeFr4ApprovalIdempotencyKeyPattern(
      input.approverUid,
    ),
    reconciliationStatus: denials.length === 0 ? "preconditions_ok" : "blocked",
    reconciliationBlockers: denials,
  };
}

export function assertCalculatedMatchesLockedFr4(
  calculated: FinanceFr4CalculatedApproval,
): string[] {
  const denials: string[] = [];
  if (calculated.toStatus !== "locked") denials.push("toStatus_not_locked");
  if (calculated.opsApprovalLabel !== "approved") {
    denials.push("ops_label_not_approved");
  }
  if (calculated.amountMinor !== "1500") denials.push("amount_changed");
  if (calculated.paidConfirmedMinor !== "0") denials.push("paid_changed");
  if (calculated.direction !== "DRIVER_PAYS_COMPANY") {
    denials.push("direction_changed");
  }
  if (calculated.currency !== "SAR") denials.push("currency_changed");
  if (calculated.mutatesSettlementAmounts !== false) {
    denials.push("amounts_mutation_forbidden");
  }
  if (calculated.paymentExecutionForbidden !== true) {
    denials.push("payment_must_remain_forbidden");
  }
  if (calculated.approvalPatch.status !== "locked") {
    denials.push("patch_status_not_locked");
  }
  if (mapV2StatusToSyntheticDisplay("locked") !== "approved") {
    denials.push("ops_display_mapping_broken");
  }
  return denials;
}
