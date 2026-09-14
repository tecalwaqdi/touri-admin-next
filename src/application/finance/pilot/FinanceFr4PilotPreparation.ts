/**
 * FR4 Settlement Approval pilot preparation orchestrator — offline.
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 * Input: proven FR2 Settlement V2 draft + FR3 recon PASS.
 * Approval = V2 lock; prepare ≠ approve ≠ execute.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr4,
  calculateFinanceFr4ApprovalFromFr2Draft,
  type FinanceFr4CalculatedApproval,
} from "@/application/finance/pilot/FinanceFr4PilotCalculator";
import {
  FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
  FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR4_EXACT_TRANSITION,
  FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR4_EXPECTED_PROJECT_ID,
  FINANCE_FR4_EXPECTED_WRITE_COUNTS,
  FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR4_PILOT_CLEANUP_COMMAND,
  FINANCE_FR4_PILOT_CLIENT_KEY,
  FINANCE_FR4_PILOT_ONE_SHOT_LIVE_COMMAND,
  FINANCE_FR4_REQUIRED_RBAC_PERMISSION,
  FINANCE_FR4_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import {
  actorHasFinanceFr4Rbac,
  assertFinanceFr4PrepWriteDisabled,
  buildFinanceFr4PrepChecklist,
  evaluateFinanceFr4LiveArmGates,
  type FinanceFr4PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr4PilotGates";
import { FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr4PilotIamDerivation";
import { FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import { FINANCE_FR2_SETTLEMENT_DOC_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr2PilotDocuments";

/** Offline FR2 draft settlement fixture matching Production pilot state. */
export const FINANCE_FR4_PREP_FR2_DRAFT_SETTLEMENT_FIXTURE: Record<
  string,
  unknown
> = {
  id: FINANCE_FR2_SETTLEMENT_DOC_ID,
  partyType: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.partyType,
  partyId: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.partyId,
  countryId: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.countryId,
  currency: "SAR",
  status: "draft",
  direction: "DRIVER_PAYS_COMPANY",
  amountMinor: 1500,
  paidConfirmedMinor: 0,
  sourceAccountingSnapshotId:
    FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.sourceAccountingSnapshotId,
  mutatesFinanceSnapshot: false,
  paymentExecutionForbidden: true,
  agentSettlementCreated: false,
  createdByUserId: "finance_fr2_prepare_actor",
  lockedByUserId: null,
};

export type FinanceFr4PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  pilotInput: "fr2_settlement_v2_draft";
  settlementId: typeof FINANCE_FR2_SETTLEMENT_DOC_ID;
  exactTransition: typeof FINANCE_FR4_EXACT_TRANSITION;
  allowedFieldMutations: typeof FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS;
  calculatedApproval: FinanceFr4CalculatedApproval | null;
  lockedApprovalExpectations: typeof FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS;
  exactExpectedWrites: typeof FINANCE_FR4_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredRbacPermission: typeof FINANCE_FR4_REQUIRED_RBAC_PERMISSION;
  requiredIamPermissions: typeof FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR4_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR4_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr4PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveArmGates: ReturnType<typeof evaluateFinanceFr4LiveArmGates>;
  oneShotLiveCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  clientKey: typeof FINANCE_FR4_PILOT_CLIENT_KEY;
  fr4PrepStatus: "PASS" | "NO-GO";
  separationOfDuties: "prepare≠approve≠execute";
};

export function prepareFinanceFr4SettlementApprovalPilot(input?: {
  fr2Settlement?: Record<string, unknown>;
  fr2SettlementDraftPresent?: boolean;
  fr2IdempotencyComplete?: boolean;
  fr3ReconPass?: boolean;
  priorFr4ApprovalExists?: boolean;
  approverUserId?: string;
  actorPermissions?: FinancePermission[];
}): FinanceFr4PilotPreparationResult {
  assertFinanceFr4PrepWriteDisabled(process.env);

  const settlement =
    input?.fr2Settlement ?? FINANCE_FR4_PREP_FR2_DRAFT_SETTLEMENT_FIXTURE;
  const approverUserId =
    input?.approverUserId ?? "finance_fr4_approver_actor";
  const permissions: FinancePermission[] = input?.actorPermissions ?? [
    "finance:read",
    "settlements:approve",
  ];
  const rbacPass = actorHasFinanceFr4Rbac(permissions);

  const calculated = calculateFinanceFr4ApprovalFromFr2Draft({
    settlement,
    approverUid: approverUserId,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr4(calculated);
  const calcOk =
    calculated.reconciliationStatus === "preconditions_ok" &&
    lockedDenials.length === 0;

  const fr2DraftOk = input?.fr2SettlementDraftPresent !== false;
  const fr2IdemOk = input?.fr2IdempotencyComplete !== false;
  const fr3Ok = input?.fr3ReconPass !== false;
  const noPrior = input?.priorFr4ApprovalExists !== true;

  const checklist = buildFinanceFr4PrepChecklist({
    fr2SettlementDraftPresent: fr2DraftOk,
    fr2IdempotencyComplete: fr2IdemOk,
    fr3ReconPass: fr3Ok,
    noPriorFr4Approval: noPrior,
    currencyMatch: calculated.currency === "SAR",
    amountsImmutable:
      calculated.amountMinor === "1500" &&
      calculated.paidConfirmedMinor === "0",
    directionImmutable: calculated.direction === "DRIVER_PAYS_COMPANY",
    sourceImmutable:
      calculated.sourceAccountingSnapshotId ===
      FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS.sourceAccountingSnapshotId,
    dualControlPossible: calculated.dualControlPass,
    financeRbac: rbacPass,
    fcPoliciesOk: true,
    approvalDistinctFromExecute:
      calculated.paymentExecutionForbidden === true &&
      !permissions.includes("settlements:execute"),
    expectedWritesKnown: true,
    nonFinanceWritesForbidden:
      FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS.length > 0 &&
      FINANCE_FR4_ZERO_WRITE_COUNTS.finance_accounting_snapshots === 0 &&
      FINANCE_FR4_ZERO_WRITE_COUNTS.order === 0 &&
      FINANCE_FR4_ZERO_WRITE_COUNTS.settlement_payments === 0,
    paymentExecutionForbidden: calculated.paymentExecutionForbidden === true,
  });

  const prepChecklistPassCount = checklist.filter((c) => c.pass).length;
  const liveArmGates = evaluateFinanceFr4LiveArmGates({
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
  if (!calcOk) goNoGoReasons.push(...calculated.reconciliationBlockers);

  const goNoGo: "GO" | "NO-GO" =
    goNoGoReasons.length === 0 && prepChecklistPassCount === checklist.length
      ? "GO"
      : "NO-GO";

  return {
    fc01Status: "APPROVED_15_PERCENT",
    fc01LockStatus: FC01_LOCK_STATUS,
    pilotInput: "fr2_settlement_v2_draft",
    settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    exactTransition: FINANCE_FR4_EXACT_TRANSITION,
    allowedFieldMutations: FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
    calculatedApproval: calcOk ? calculated : null,
    lockedApprovalExpectations: FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS,
    exactExpectedWrites: FINANCE_FR4_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredRbacPermission: FINANCE_FR4_REQUIRED_RBAC_PERMISSION,
    requiredIamPermissions: FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR4_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR4_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR4_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount,
    liveArmGates,
    oneShotLiveCommand: FINANCE_FR4_PILOT_ONE_SHOT_LIVE_COMMAND,
    cleanupCommand: FINANCE_FR4_PILOT_CLEANUP_COMMAND,
    goNoGo,
    goNoGoReasons,
    clientKey: FINANCE_FR4_PILOT_CLIENT_KEY,
    fr4PrepStatus: goNoGo === "GO" ? "PASS" : "NO-GO",
    separationOfDuties: "prepare≠approve≠execute",
  };
}
