/**
 * FR5 Settlement Execution pilot preparation orchestrator — offline.
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 * Input: FR4-locked Settlement V2. prepare ≠ approve ≠ execute.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr5,
  calculateFinanceFr5ExecutionFromFr4Locked,
  type FinanceFr5CalculatedExecution,
} from "@/application/finance/pilot/FinanceFr5PilotCalculator";
import {
  FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
  FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR5_CANONICAL_MECHANISM,
  FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
  FINANCE_FR5_EXACT_TRANSITION,
  FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR5_EXPECTED_PROJECT_ID,
  FINANCE_FR5_EXPECTED_WRITE_COUNTS,
  FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
  FINANCE_FR5_PILOT_CLEANUP_COMMAND,
  FINANCE_FR5_PILOT_CLIENT_KEY,
  FINANCE_FR5_PILOT_ONE_SHOT_LIVE_COMMAND,
  FINANCE_FR5_REQUIRED_RBAC_PERMISSION,
  FINANCE_FR5_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  actorHasFinanceFr5Rbac,
  assertFinanceFr5PrepWriteDisabled,
  buildFinanceFr5PrepChecklist,
  evaluateFinanceFr5LiveArmGates,
  financeFr5FcPoliciesOk,
  type FinanceFr5PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr5PilotGates";
import { FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr5PilotIamDerivation";
import { FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr5PilotDocuments";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr2PilotDocuments";

/** Offline FR4 locked settlement fixture matching Production pilot state. */
export const FINANCE_FR5_PREP_FR4_LOCKED_SETTLEMENT_FIXTURE: Record<
  string,
  unknown
> = {
  id: FINANCE_FR2_SETTLEMENT_DOC_ID,
  partyType: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.partyType,
  partyId: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.partyId,
  countryId: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.countryId,
  currency: "SAR",
  status: "locked",
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: 1500,
  paidConfirmedMinor: 0,
  outstandingMinor: 1500,
  sourceAccountingSnapshotId:
    FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.sourceAccountingSnapshotId,
  mutatesFinanceSnapshot: false,
  paymentExecutionForbidden: true,
  agentSettlementCreated: false,
  createdByUserId: "finance_fr2_prepare_actor",
  lockedByUserId: "finance_fr4_approver_actor",
  approvedBy: "finance_fr4_approver_actor",
  approvedAt: "2026-09-14T01:00:00.000Z",
};

export type FinanceFr5PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  pilotInput: "fr4_settlement_v2_locked";
  settlementId: typeof FINANCE_FR2_SETTLEMENT_DOC_ID;
  canonicalMechanism: typeof FINANCE_FR5_CANONICAL_MECHANISM;
  exactTransition: typeof FINANCE_FR5_EXACT_TRANSITION;
  exactExecutionDirection: typeof FINANCE_FR5_EXACT_EXECUTION_DIRECTION;
  exactPaymentAmount: typeof FINANCE_FR5_PAYMENT_AMOUNT_MINOR;
  allowedFieldMutations: typeof FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS;
  calculatedExecution: FinanceFr5CalculatedExecution | null;
  lockedExecutionExpectations: typeof FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS;
  exactExpectedWrites: typeof FINANCE_FR5_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredRbacPermission: typeof FINANCE_FR5_REQUIRED_RBAC_PERMISSION;
  requiredIamPermissions: typeof FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR5_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR5_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr5PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveArmGates: ReturnType<typeof evaluateFinanceFr5LiveArmGates>;
  oneShotLiveCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  clientKey: typeof FINANCE_FR5_PILOT_CLIENT_KEY;
  fr5PrepStatus: "PASS" | "NO-GO";
  separationOfDuties: "prepare≠approve≠execute";
};

export function prepareFinanceFr5SettlementExecutionPilot(input?: {
  fr4Settlement?: Record<string, unknown>;
  fr4SettlementLockedPresent?: boolean;
  fr4IdempotencyComplete?: boolean;
  fr3ReconPass?: boolean;
  priorFr5ExecutionExists?: boolean;
  executorUserId?: string;
  actorPermissions?: FinancePermission[];
}): FinanceFr5PilotPreparationResult {
  assertFinanceFr5PrepWriteDisabled(process.env);

  const settlement =
    input?.fr4Settlement ?? FINANCE_FR5_PREP_FR4_LOCKED_SETTLEMENT_FIXTURE;
  const executorUserId =
    input?.executorUserId ?? "finance_fr5_executor_actor";
  const permissions: FinancePermission[] = input?.actorPermissions ?? [
    "finance:read",
    "settlements:execute",
  ];
  const rbacPass = actorHasFinanceFr5Rbac(permissions);
  const approveDoesNotImplyExecute = !permissions.includes("settlements:approve")
    ? true
    : permissions.includes("settlements:execute");
  // Explicit rule: approve permission alone must not grant execute. Prep actor
  // for FR5 should hold execute (not approve). If only approve present → fail.
  const approveOnly =
    permissions.includes("settlements:approve") &&
    !permissions.includes("settlements:execute");

  const calculated = calculateFinanceFr5ExecutionFromFr4Locked({
    settlement,
    executorUid: executorUserId,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr5(calculated);
  const calcOk =
    calculated.reconciliationStatus === "preconditions_ok" &&
    lockedDenials.length === 0;

  const fr4LockedOk = input?.fr4SettlementLockedPresent !== false;
  const fr4IdemOk = input?.fr4IdempotencyComplete !== false;
  const fr3Ok = input?.fr3ReconPass !== false;
  const noPrior = input?.priorFr5ExecutionExists !== true;

  const checklist = buildFinanceFr5PrepChecklist({
    fr4SettlementLockedPresent: fr4LockedOk,
    fr4IdempotencyComplete: fr4IdemOk,
    fr3ReconPass: fr3Ok,
    noPriorFr5Execution: noPrior,
    currencyMatch: calculated.currency === "SAR",
    amountUnchanged: calculated.amountMinor === "1500",
    paidStartsZero: calculated.paidConfirmedMinorBefore === "0",
    directionImmutable: calculated.direction === "DRIVER_PAYS_COMPANY",
    sourceImmutable:
      calculated.sourceAccountingSnapshotId ===
      FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.sourceAccountingSnapshotId,
    sodExecutorDistinct: calculated.sodPass,
    financeRbac: rbacPass && !approveOnly,
    approveDoesNotImplyExecute: !approveOnly && approveDoesNotImplyExecute,
    fcPoliciesOk: financeFr5FcPoliciesOk(),
    expectedWritesKnown:
      FINANCE_FR5_EXPECTED_WRITE_COUNTS.totalProductionWrites === 5,
    forbiddenCollectionsZero:
      FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS.length > 0 &&
      FINANCE_FR5_ZERO_WRITE_COUNTS.finance_accounting_snapshots === 0 &&
      FINANCE_FR5_ZERO_WRITE_COUNTS.order === 0 &&
      FINANCE_FR5_ZERO_WRITE_COUNTS.drivers === 0,
    noWalletNoPayout:
      calculated.walletTouched === false && calculated.payoutExecuted === false,
  });

  const prepChecklistPassCount = checklist.filter((c) => c.pass).length;
  const liveArmGates = evaluateFinanceFr5LiveArmGates({
    env: process.env,
    mode: "preparation",
  });

  const goNoGoReasons: string[] = [];
  if (prepChecklistPassCount !== checklist.length) {
    goNoGoReasons.push(
      ...checklist.filter((c) => !c.pass).map((c) => c.detail),
    );
  }
  if (!rbacPass) goNoGoReasons.push("rbac_fail");
  if (approveOnly) goNoGoReasons.push("approve_does_not_imply_execute");
  if (!calcOk) goNoGoReasons.push(...calculated.reconciliationBlockers);

  const goNoGo: "GO" | "NO-GO" =
    goNoGoReasons.length === 0 && prepChecklistPassCount === checklist.length
      ? "GO"
      : "NO-GO";

  return {
    fc01Status: "APPROVED_15_PERCENT",
    fc01LockStatus: FC01_LOCK_STATUS,
    pilotInput: "fr4_settlement_v2_locked",
    settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    canonicalMechanism: FINANCE_FR5_CANONICAL_MECHANISM,
    exactTransition: FINANCE_FR5_EXACT_TRANSITION,
    exactExecutionDirection: FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
    exactPaymentAmount: FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
    allowedFieldMutations: FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
    calculatedExecution: calcOk ? calculated : null,
    lockedExecutionExpectations: FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS,
    exactExpectedWrites: FINANCE_FR5_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredRbacPermission: FINANCE_FR5_REQUIRED_RBAC_PERMISSION,
    requiredIamPermissions: FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR5_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR5_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR5_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount,
    liveArmGates,
    oneShotLiveCommand: FINANCE_FR5_PILOT_ONE_SHOT_LIVE_COMMAND,
    cleanupCommand: FINANCE_FR5_PILOT_CLEANUP_COMMAND,
    goNoGo,
    goNoGoReasons,
    clientKey: FINANCE_FR5_PILOT_CLIENT_KEY,
    fr5PrepStatus: goNoGo === "GO" ? "PASS" : "NO-GO",
    separationOfDuties: "prepare≠approve≠execute",
  };
}
