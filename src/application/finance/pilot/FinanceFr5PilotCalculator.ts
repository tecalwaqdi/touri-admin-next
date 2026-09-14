/**
 * FR5 Settlement Execution / Collection pilot — offline calculator.
 * Full outstanding collection: locked → settled; paid 0→1500; outstanding 1500→0.
 */

import {
  FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
  FINANCE_FR5_EXACT_TRANSITION,
  FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
  FINANCE_FR5_PAYMENT_CURRENCY,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_PAYMENT_METHOD,
  FINANCE_FR5_POST_EXECUTION_STATUS,
  FINANCE_FR5_POST_PAYMENT_STATUS,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  assertFinanceFr5ExecutionTransitionAllowed,
  buildFinanceFr5ConfirmedPaymentDoc,
  buildFinanceFr5SettlementExecutionPatch,
  financeFr5ExecutionIdempotencyKeyPattern,
  financeFr5PaymentCreateIdempotencyKeyPattern,
} from "@/application/finance/pilot/FinanceFr5PilotDocuments";

export type FinanceFr5CalculatedExecution = {
  settlementId: typeof FINANCE_FR5_SETTLEMENT_DOC_ID;
  paymentId: typeof FINANCE_FR5_PAYMENT_DOC_ID;
  exactTransition: typeof FINANCE_FR5_EXACT_TRANSITION;
  exactExecutionDirection: typeof FINANCE_FR5_EXACT_EXECUTION_DIRECTION;
  fromStatus: "locked";
  toStatus: typeof FINANCE_FR5_POST_EXECUTION_STATUS;
  paymentStatus: typeof FINANCE_FR5_POST_PAYMENT_STATUS;
  currency: typeof FINANCE_FR5_PAYMENT_CURRENCY;
  direction: "DRIVER_PAYS_COMPANY";
  amountMinor: typeof FINANCE_FR5_PAYMENT_AMOUNT_MINOR;
  paidConfirmedMinorBefore: "0";
  paidConfirmedMinorAfter: "1500";
  outstandingMinorBefore: "1500";
  outstandingMinorAfter: "0";
  paymentMethod: typeof FINANCE_FR5_PAYMENT_METHOD;
  sourceAccountingSnapshotId: typeof FINANCE_FR5_SOURCE_SNAPSHOT_ID;
  mutatesFinanceSnapshot: false;
  walletTouched: false;
  payoutExecuted: false;
  bankGatewaySuccessInvented: false;
  sodPass: boolean;
  settlementPatch: Record<string, unknown>;
  paymentDoc: Record<string, unknown>;
  createIdempotencyKeyPattern: string;
  confirmIdempotencyKeyPattern: string;
  reconciliationStatus: "preconditions_ok" | "blocked";
  reconciliationBlockers: string[];
};

export function calculateFinanceFr5ExecutionFromFr4Locked(input: {
  settlement: Record<string, unknown>;
  executorUid: string;
  correlationId?: string;
  confirmedAtUtc?: string;
}): FinanceFr5CalculatedExecution {
  const denials = assertFinanceFr5ExecutionTransitionAllowed({
    settlement: input.settlement,
    executorUid: input.executorUid,
  });
  const correlationId = input.correlationId ?? "fr5_calc_corr";
  const confirmedAtUtc = input.confirmedAtUtc ?? "2026-09-14T02:00:00.000Z";
  const createKey = financeFr5PaymentCreateIdempotencyKeyPattern(
    input.executorUid,
  );
  const confirmKey = financeFr5ExecutionIdempotencyKeyPattern(input.executorUid);
  const settlementPatch = buildFinanceFr5SettlementExecutionPatch({
    executorUid: input.executorUid,
    paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
    confirmedAtUtc,
  });
  const paymentDoc = buildFinanceFr5ConfirmedPaymentDoc({
    executorUid: input.executorUid,
    correlationId,
    createdAtUtc: confirmedAtUtc,
    confirmedAtUtc,
    idempotencyKey: createKey,
  });
  const sodPass =
    !denials.includes("sod_violation_executor_eq_preparer") &&
    !denials.includes("sod_violation_executor_eq_approver");

  return {
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
    exactTransition: FINANCE_FR5_EXACT_TRANSITION,
    exactExecutionDirection: FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
    fromStatus: "locked",
    toStatus: FINANCE_FR5_POST_EXECUTION_STATUS,
    paymentStatus: FINANCE_FR5_POST_PAYMENT_STATUS,
    currency: FINANCE_FR5_PAYMENT_CURRENCY,
    direction: "DRIVER_PAYS_COMPANY",
    amountMinor: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
    paidConfirmedMinorBefore: "0",
    paidConfirmedMinorAfter: "1500",
    outstandingMinorBefore: "1500",
    outstandingMinorAfter: "0",
    paymentMethod: FINANCE_FR5_PAYMENT_METHOD,
    sourceAccountingSnapshotId: FINANCE_FR5_SOURCE_SNAPSHOT_ID,
    mutatesFinanceSnapshot: false,
    walletTouched: false,
    payoutExecuted: false,
    bankGatewaySuccessInvented: false,
    sodPass,
    settlementPatch,
    paymentDoc,
    createIdempotencyKeyPattern: createKey,
    confirmIdempotencyKeyPattern: confirmKey,
    reconciliationStatus: denials.length === 0 ? "preconditions_ok" : "blocked",
    reconciliationBlockers: denials,
  };
}

export function assertCalculatedMatchesLockedFr5(
  calculated: FinanceFr5CalculatedExecution,
): string[] {
  const denials: string[] = [];
  if (calculated.toStatus !== "settled") denials.push("toStatus_not_settled");
  if (calculated.paymentStatus !== "confirmed") {
    denials.push("payment_not_confirmed");
  }
  if (calculated.amountMinor !== "1500") denials.push("amount_changed");
  if (calculated.paidConfirmedMinorAfter !== "1500") {
    denials.push("paid_after_not_1500");
  }
  if (calculated.outstandingMinorAfter !== "0") {
    denials.push("outstanding_after_not_0");
  }
  if (calculated.direction !== "DRIVER_PAYS_COMPANY") {
    denials.push("direction_changed");
  }
  if (calculated.currency !== "SAR") denials.push("currency_changed");
  if (calculated.walletTouched !== false) denials.push("wallet_touched");
  if (calculated.payoutExecuted !== false) denials.push("payout_executed");
  if (calculated.bankGatewaySuccessInvented !== false) {
    denials.push("bank_gateway_invented");
  }
  if (calculated.settlementPatch.status !== "settled") {
    denials.push("patch_status_not_settled");
  }
  if (Number(calculated.settlementPatch.paidConfirmedMinor) !== 1500) {
    denials.push("patch_paid_not_1500");
  }
  if (calculated.paymentDoc.status !== "confirmed") {
    denials.push("payment_doc_not_confirmed");
  }
  return denials;
}
