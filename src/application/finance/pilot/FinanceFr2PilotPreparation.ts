/**
 * FR2 Settlement V2 pilot preparation orchestrator — offline.
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 * Input: proven FR1 synthetic finance accounting snapshot only.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr2,
  calculateFinanceFr2SettlementFromFr1Snapshot,
  type FinanceFr2CalculatedSettlement,
  type FinanceFr2SourceSnapshot,
} from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import {
  FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR2_EXPECTED_PROJECT_ID,
  FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR2_PILOT_CLEANUP_COMMAND,
  FINANCE_FR2_PILOT_CLIENT_KEY,
  FINANCE_FR2_PILOT_ONE_SHOT_LIVE_COMMAND,
  FINANCE_FR2_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import {
  actorHasFinanceFr2Rbac,
  assertFinanceFr2PrepWriteDisabled,
  buildFinanceFr2PrepChecklist,
  evaluateFinanceFr2LiveArmGates,
  type FinanceFr2PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr2PilotGates";
import { FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr2PilotIamDerivation";
import { FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import { FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR1_FIXTURE_COUNTRY_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";

/** Locked FR1 snapshot shape used as the only FR2 pilot input (offline prep). */
export const FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE: FinanceFr2SourceSnapshot = {
  orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
  currency: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.currency,
  countryId: FINANCE_FR1_FIXTURE_COUNTRY_ID,
  paymentMethod: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.paymentMethod,
  grossFareMinor: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.grossFareMinor,
  eligibleRevenueMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.eligibleRevenueMinor,
  commissionAmountPersistedMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.commissionAmountMinor,
  driverDeductionsMinor:
    FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverDeductionsMinor,
  driverNetMinor: FINANCE_FR1_LOCKED_SNAPSHOT_EXPECTATIONS.driverNetMinor,
  agentAttributionStatus: "unknown_historical",
  agentId: null,
  agentShareMinor: null,
  settlementDirection: "DRIVER_PAYS_COMPANY",
  mutatesOrderMajors: false,
  historicalReRateForbidden: true,
  lifecycleCompleted: true,
};

export type FinanceFr2PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  pilotInput: "fr1_finance_accounting_snapshot";
  fr1SnapshotId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  calculatedSettlement: FinanceFr2CalculatedSettlement | null;
  lockedSettlementExpectations: typeof FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS;
  exactExpectedWrites: typeof FINANCE_FR2_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredIamPermissions: typeof FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR2_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR2_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr2PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveArmGates: ReturnType<typeof evaluateFinanceFr2LiveArmGates>;
  oneShotLiveCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  clientKey: typeof FINANCE_FR2_PILOT_CLIENT_KEY;
  fr2PrepStatus: "PASS" | "NO-GO";
};

export function prepareFinanceFr2SettlementPilot(input?: {
  fr1Snapshot?: FinanceFr2SourceSnapshot;
  fr1SnapshotComplete?: boolean;
  fr1IdempotencyComplete?: boolean;
  priorFr2SettlementExists?: boolean;
  actorUserId?: string;
  actorPermissions?: FinancePermission[];
}): FinanceFr2PilotPreparationResult {
  assertFinanceFr2PrepWriteDisabled(process.env);

  const snapshot = input?.fr1Snapshot ?? FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE;
  const actorUserId = input?.actorUserId ?? "finance_fr2_prep_actor";
  const permissions: FinancePermission[] = input?.actorPermissions ?? [
    "finance:read",
    "settlements:prepare",
  ];
  const rbacPass = actorHasFinanceFr2Rbac(permissions);

  const calculated = calculateFinanceFr2SettlementFromFr1Snapshot({
    snapshot,
    actorUserId,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr2(calculated);
  const calcOk =
    calculated.reconciliationStatus === "preconditions_ok" &&
    lockedDenials.length === 0;

  const fr1SnapOk = input?.fr1SnapshotComplete !== false;
  const fr1IdemOk = input?.fr1IdempotencyComplete !== false;
  const noPrior = input?.priorFr2SettlementExists !== true;

  const checklist = buildFinanceFr2PrepChecklist({
    fr1SnapshotComplete: fr1SnapOk,
    fr1IdempotencyComplete: fr1IdemOk,
    noPriorFr2Settlement: noPrior,
    currencyMatch: calculated.currency === "SAR",
    valuesReconcileToFr1: calcOk,
    financeRbac: rbacPass,
    countryScopeOk: calculated.countryId === FINANCE_FR1_FIXTURE_COUNTRY_ID,
    fcPoliciesOk: true,
    noMissingRequiredValues: calcOk,
    noDuplicateSettlement: noPrior,
    calculated: calcOk,
    expectedWritesKnown: true,
    nonFinanceWritesForbidden:
      FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS.length > 0 &&
      FINANCE_FR2_ZERO_WRITE_COUNTS.finance_accounting_snapshots === 0 &&
      FINANCE_FR2_ZERO_WRITE_COUNTS.order === 0 &&
      FINANCE_FR2_ZERO_WRITE_COUNTS.settlement_payments === 0,
    paymentExecutionForbidden: calculated.paymentExecutionForbidden === true,
  });

  const prepChecklistPassCount = checklist.filter((c) => c.pass).length;
  const liveArmGates = evaluateFinanceFr2LiveArmGates({
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
    pilotInput: "fr1_finance_accounting_snapshot",
    fr1SnapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    calculatedSettlement: calcOk ? calculated : null,
    lockedSettlementExpectations: FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS,
    exactExpectedWrites: FINANCE_FR2_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredIamPermissions: FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR2_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR2_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR2_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount,
    liveArmGates,
    oneShotLiveCommand: FINANCE_FR2_PILOT_ONE_SHOT_LIVE_COMMAND,
    cleanupCommand: FINANCE_FR2_PILOT_CLEANUP_COMMAND,
    goNoGo,
    goNoGoReasons,
    clientKey: FINANCE_FR2_PILOT_CLIENT_KEY,
    fr2PrepStatus: goNoGo === "GO" ? "PASS" : "NO-GO",
  };
}
