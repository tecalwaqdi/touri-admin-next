/**
 * FR6 Adjustment pilot preparation orchestrator — offline.
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 * Live GO: append-only adjustment only. Refund/chargeback/settled-reverse = NO-GO live.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR,
  FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR6_CANONICAL_MECHANISM,
  FINANCE_FR6_EXACT_TRANSITION,
  FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR6_EXPECTED_PROJECT_ID,
  FINANCE_FR6_EXPECTED_WRITE_COUNTS,
  FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR6_LIVE_PATH_DECISIONS,
  FINANCE_FR6_PILOT_CLEANUP_COMMAND,
  FINANCE_FR6_PILOT_CLIENT_KEY,
  FINANCE_FR6_PILOT_ONE_SHOT_LIVE_COMMAND,
  FINANCE_FR6_REQUIRED_RBAC_APPROVE,
  FINANCE_FR6_REQUIRED_RBAC_CREATE,
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import {
  actorHasFinanceFr6ApproveRbac,
  actorHasFinanceFr6CreateRbac,
  assertFinanceFr6PrepWriteDisabled,
  buildFinanceFr6PrepChecklist,
  evaluateFinanceFr6LiveArmGates,
  executeDoesNotImplyAdjust,
  financeFr6FcPoliciesOk,
  type FinanceFr6PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr6PilotGates";
import { FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr6PilotIamDerivation";
import { FINANCE_FR6_LOCKED_ADJUSTMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr6PilotDocuments";

/** Offline FR5 settled settlement fixture matching Production pilot state. */
export const FINANCE_FR6_PREP_FR5_SETTLED_SETTLEMENT_FIXTURE: Record<
  string,
  unknown
> = {
  id: FINANCE_FR6_SETTLEMENT_DOC_ID,
  status: "settled",
  direction: "DRIVER_PAYS_COMPANY",
  currency: "SAR",
  amountMinor: 1500,
  paidConfirmedMinor: 1500,
  outstandingMinor: 0,
  sourceAccountingSnapshotId: "test_adminnext_finance_fr1_completed_001",
  walletTouched: false,
  payoutExecuted: false,
};

export const FINANCE_FR6_PREP_FR5_CONFIRMED_PAYMENT_FIXTURE: Record<
  string,
  unknown
> = {
  id: "test_adminnext_finance_fr5_settlement_payment_001",
  settlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
  status: "confirmed",
  amountMinor: 1500,
  currency: "SAR",
};

export type FinanceFr6PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  pilotInput: "fr5_settlement_v2_settled";
  settlementId: typeof FINANCE_FR6_SETTLEMENT_DOC_ID;
  canonicalMechanism: typeof FINANCE_FR6_CANONICAL_MECHANISM;
  exactTransition: typeof FINANCE_FR6_EXACT_TRANSITION;
  livePathDecisions: typeof FINANCE_FR6_LIVE_PATH_DECISIONS;
  lockedAdjustmentExpectations: typeof FINANCE_FR6_LOCKED_ADJUSTMENT_EXPECTATIONS;
  exactExpectedWrites: typeof FINANCE_FR6_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredRbacCreate: typeof FINANCE_FR6_REQUIRED_RBAC_CREATE;
  requiredRbacApprove: typeof FINANCE_FR6_REQUIRED_RBAC_APPROVE;
  requiredIamPermissions: typeof FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR6_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR6_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr6PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveArmGates: ReturnType<typeof evaluateFinanceFr6LiveArmGates>;
  oneShotLiveCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  livePilotSafe: boolean;
  clientKey: typeof FINANCE_FR6_PILOT_CLIENT_KEY;
  fr6PrepStatus: "PASS" | "NO-GO";
  separationOfDuties: "adjust_preparer≠adjust_approver; execute≠adjust; reverse≠adjust_approve";
};

export function prepareFinanceFr6AdjustmentPilot(input?: {
  fr5Settlement?: Record<string, unknown>;
  fr5Payment?: Record<string, unknown>;
  fr5SettlementSettledPresent?: boolean;
  fr5PaymentConfirmedPresent?: boolean;
  fr1SnapshotImmutable?: boolean;
  priorFr6AdjustmentExists?: boolean;
  preparerUserId?: string;
  approverUserId?: string;
  preparerPermissions?: FinancePermission[];
  approverPermissions?: FinancePermission[];
  executorPermissions?: FinancePermission[];
}): FinanceFr6PilotPreparationResult {
  assertFinanceFr6PrepWriteDisabled(process.env);

  const settlement =
    input?.fr5Settlement ?? FINANCE_FR6_PREP_FR5_SETTLED_SETTLEMENT_FIXTURE;
  const payment =
    input?.fr5Payment ?? FINANCE_FR6_PREP_FR5_CONFIRMED_PAYMENT_FIXTURE;
  const preparerUserId =
    input?.preparerUserId ?? "finance_fr6_adjust_preparer_actor";
  const approverUserId =
    input?.approverUserId ?? "finance_fr6_adjust_approver_actor";
  const preparerPerms: FinancePermission[] = input?.preparerPermissions ?? [
    "finance:read",
    "finance:adjust",
  ];
  const approverPerms: FinancePermission[] = input?.approverPermissions ?? [
    "finance:read",
    "finance:adjust_approve",
  ];
  const executorPerms: FinancePermission[] = input?.executorPermissions ?? [
    "finance:read",
    "settlements:execute",
  ];

  const checklist = buildFinanceFr6PrepChecklist({
    fr5SettlementSettledPresent:
      input?.fr5SettlementSettledPresent ?? settlement.status === "settled",
    fr5PaymentConfirmedPresent:
      input?.fr5PaymentConfirmedPresent ?? payment.status === "confirmed",
    fr1SnapshotImmutable: input?.fr1SnapshotImmutable ?? true,
    currencyMatch: settlement.currency === "SAR",
    amountWithinLimit:
      Number(FINANCE_FR6_ADJUSTMENT_AMOUNT_MINOR) <=
      Number(settlement.amountMinor),
    sourceLinked: true,
    sodPreparerApproverDistinct: preparerUserId !== approverUserId,
    createRbac: actorHasFinanceFr6CreateRbac(preparerPerms),
    approveRbac: actorHasFinanceFr6ApproveRbac(approverPerms),
    executeDoesNotImplyAdjust: executeDoesNotImplyAdjust(executorPerms),
    fcPoliciesOk: financeFr6FcPoliciesOk(),
    expectedWritesKnown: FINANCE_FR6_EXPECTED_WRITE_COUNTS.totalProductionWrites === 4,
    forbiddenCollectionsZero: true,
    refundChargebackLiveNogGo:
      FINANCE_FR6_LIVE_PATH_DECISIONS.customer_refund_on_cash_chain ===
        "NO-GO" &&
      FINANCE_FR6_LIVE_PATH_DECISIONS.chargeback_without_gateway === "NO-GO",
    settledReverseLiveNoGo:
      FINANCE_FR6_LIVE_PATH_DECISIONS.payment_reverse_on_settled === "NO-GO",
  });

  const passCount = checklist.filter((c) => c.pass).length;
  const liveArmGates = evaluateFinanceFr6LiveArmGates({
    env: process.env,
    mode: "preparation",
  });

  const goNoGoReasons: string[] = [];
  if (passCount < checklist.length) {
    goNoGoReasons.push(
      ...checklist.filter((c) => !c.pass).map((c) => c.name),
    );
  }
  if (input?.priorFr6AdjustmentExists) {
    goNoGoReasons.push("prior_fr6_adjustment_exists_use_already_applied");
  }

  const goNoGo: "GO" | "NO-GO" =
    goNoGoReasons.length === 0 &&
    FINANCE_FR6_LIVE_PATH_DECISIONS.adjustment_append_only === "GO"
      ? "GO"
      : "NO-GO";

  return {
    fc01Status: "APPROVED_15_PERCENT",
    fc01LockStatus: FC01_LOCK_STATUS,
    pilotInput: "fr5_settlement_v2_settled",
    settlementId: FINANCE_FR6_SETTLEMENT_DOC_ID,
    canonicalMechanism: FINANCE_FR6_CANONICAL_MECHANISM,
    exactTransition: FINANCE_FR6_EXACT_TRANSITION,
    livePathDecisions: FINANCE_FR6_LIVE_PATH_DECISIONS,
    lockedAdjustmentExpectations: FINANCE_FR6_LOCKED_ADJUSTMENT_EXPECTATIONS,
    exactExpectedWrites: FINANCE_FR6_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredRbacCreate: FINANCE_FR6_REQUIRED_RBAC_CREATE,
    requiredRbacApprove: FINANCE_FR6_REQUIRED_RBAC_APPROVE,
    requiredIamPermissions: FINANCE_FR6_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR6_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR6_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR6_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR6_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount: passCount,
    liveArmGates,
    oneShotLiveCommand: FINANCE_FR6_PILOT_ONE_SHOT_LIVE_COMMAND,
    cleanupCommand: FINANCE_FR6_PILOT_CLEANUP_COMMAND,
    goNoGo,
    goNoGoReasons,
    livePilotSafe: goNoGo === "GO",
    clientKey: FINANCE_FR6_PILOT_CLIENT_KEY,
    fr6PrepStatus: goNoGo === "GO" ? "PASS" : "NO-GO",
    separationOfDuties:
      "adjust_preparer≠adjust_approver; execute≠adjust; reverse≠adjust_approve",
  };
}

export { FINANCE_FR6_ZERO_WRITE_COUNTS };
