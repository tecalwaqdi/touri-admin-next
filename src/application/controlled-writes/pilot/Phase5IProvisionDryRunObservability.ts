/**
 * Phase 5I — safe dry-run summary + observability (plan only).
 * No token / email / phone / password / generated UID.
 */

import type { Phase5IDryRunResult } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import { PHASE_5I_PARTIAL_FAILURE_HANDLING } from "@/application/controlled-writes/pilot/Phase5IProvisioningOrder";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED } from "@/application/controlled-writes/pilot/isPhase5ISyntheticDriverProvisionEnabled";

export type Phase5IDryRunOverallStatus =
  | "SKIPPED"
  | "DRY_RUN_PASS"
  | "DRY_RUN_NO_GO"
  | "FAIL";

/**
 * Safe planning fields only — operator summary artifact.
 * Matches Phase 5I dry-run harness §5 contract.
 */
export type Phase5IProvisionDryRunSafeSummary = {
  overallStatus: Phase5IDryRunOverallStatus;
  dryRunExecuted: boolean;
  logicalFixtureName: typeof PHASE_5I_LOGICAL_FIXTURE_NAME | null;
  authFixtureStrategyValid: boolean;
  disabledAuthSupported: boolean;
  uidStrategyValid: boolean;
  firestoreFixtureSchemaValid: boolean;
  syntheticClassificationValid: boolean;
  driverMembershipValid: boolean;
  expectedClaimsSafe: boolean;
  expectedClaimKeyCount: number;
  elevatedPrivilege: boolean;
  communicationImpact: string | null;
  triggerEffectsBounded: boolean;
  partialFailureRecoveryDefined: boolean;
  exactWriteCountsKnown: boolean;
  /** Design-session lock: false while wouldWrite stays false. */
  provisioningWouldBePossible: boolean;
  wouldCreateAuth: boolean;
  wouldCreateFirestoreFixture: boolean;
  actualAuthWrites: 0;
  actualFirestoreWrites: 0;
  productionWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  agentWrites: 0;
  customerWrites: 0;
  authCreateInvocationCount: 0;
  firestoreCreateInvocationCount: 0;
  setCustomUserClaimsInvocationCount: 0;
  allWriteFlagsFalseAfterRun: boolean;
  /**
   * Design-session semantics: wouldWrite=false while gates stay locked.
   * Documented — not a planning failure by itself.
   */
  wouldWrite: boolean;
  actualWrite: false;
  blocker?: string;
};

export function assertPhase5IWriteFlagsFalse(): boolean {
  return (
    CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled === false &&
    CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled === false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.GLOBAL_PRODUCTION_WRITE_ENABLED ===
      false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.PRODUCTION_WRITE_ENABLED ===
      false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.DRIVER_WRITE_ENABLED === false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED ===
      false &&
    PHASE_5I_GLOBAL_WRITE_GATES_DOCUMENTED.FINANCE_WRITE_ENABLED === false
  );
}

export function summarizePhase5IProvisionDryRunSafe(
  result: Phase5IDryRunResult | null,
  opts?: {
    dryRunExecuted?: boolean;
    overallOverride?: Phase5IDryRunOverallStatus;
    blocker?: string;
  },
): Phase5IProvisionDryRunSafeSummary {
  const flagsOk = assertPhase5IWriteFlagsFalse();
  const dryRunExecuted = opts?.dryRunExecuted ?? result !== null;

  if (!result) {
    return {
      overallStatus: opts?.overallOverride ?? "SKIPPED",
      dryRunExecuted: false,
      logicalFixtureName: null,
      authFixtureStrategyValid: false,
      disabledAuthSupported: false,
      uidStrategyValid: false,
      firestoreFixtureSchemaValid: false,
      syntheticClassificationValid: false,
      driverMembershipValid: false,
      expectedClaimsSafe: false,
      expectedClaimKeyCount: 0,
      elevatedPrivilege: false,
      communicationImpact: null,
      triggerEffectsBounded: false,
      partialFailureRecoveryDefined: false,
      exactWriteCountsKnown: false,
      provisioningWouldBePossible: false,
      wouldCreateAuth: false,
      wouldCreateFirestoreFixture: false,
      actualAuthWrites: 0,
      actualFirestoreWrites: 0,
      productionWrites: 0,
      financeWrites: 0,
      tripWrites: 0,
      agentWrites: 0,
      customerWrites: 0,
      authCreateInvocationCount: 0,
      firestoreCreateInvocationCount: 0,
      setCustomUserClaimsInvocationCount: 0,
      allWriteFlagsFalseAfterRun: flagsOk,
      wouldWrite: false,
      actualWrite: false,
      blocker:
        opts?.blocker ??
        "PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN!=1 — dry-run body not executed",
    };
  }

  const authFixtureStrategyValid =
    result.authModel.disabled === true &&
    result.authModel.email === undefined &&
    result.authModel.phoneNumber === undefined &&
    result.authModel.password === undefined &&
    result.emailRequirement.realEmailAllowed === false &&
    result.passwordPolicy.passwordPreferred === false;

  const disabledAuthSupported =
    result.disabledCompat.disabledTrueCompatibleWithSetCustomUserClaims ===
      true &&
    result.disabledCompat.disabledBlocksClientSignIn === true;

  const uidStrategyValid =
    result.uidStrategy.preferAuthGeneratedUid === true &&
    result.uidStrategy.authUidEqualsFirestoreDocId === true &&
    result.uidStrategy.forbidOrphanNonAuthDocIds === true &&
    result.uidStrategy.syntheticViaFirestoreMarkers === true;

  const firestoreFixtureSchemaValid =
    result.membership.operationalDriver === true &&
    result.geography.countryMapping === "mapped" &&
    result.geography.cityMapping === "mapped";

  const syntheticClassificationValid =
    result.membership.synthetic === true &&
    result.membership.safePilotEligible === true;

  const driverMembershipValid = result.membership.operationalDriver === true;

  const expectedClaimsSafe =
    result.elevatedVerdict === "AUTH_SAFE_FIXTURE_GO" &&
    result.claimKeyCount === 1;

  const triggerEffectsBounded =
    result.syncClaimsClass === "bounded_predictable";

  const partialFailureRecoveryDefined =
    PHASE_5I_PARTIAL_FAILURE_HANDLING.authOnlyOrphan.multiCreateForbidden ===
      true &&
    PHASE_5I_PARTIAL_FAILURE_HANDLING.claimsSyncFailure.multiCreateForbidden ===
      true;

  const exactWriteCountsKnown =
    result.writeCounts.authCreate === 0 &&
    result.writeCounts.firestoreUserCreates === 0 &&
    result.futureWriteCounts.authCreate === 1 &&
    result.futureWriteCounts.firestoreUserCreates === 1;

  const planningOk =
    dryRunExecuted &&
    authFixtureStrategyValid &&
    disabledAuthSupported &&
    uidStrategyValid &&
    firestoreFixtureSchemaValid &&
    syntheticClassificationValid &&
    driverMembershipValid &&
    expectedClaimsSafe &&
    triggerEffectsBounded &&
    partialFailureRecoveryDefined &&
    exactWriteCountsKnown &&
    result.actualWrite === false &&
    result.productionWrites === 0 &&
    result.authWrites === 0 &&
    flagsOk &&
    result.communication.verdict === "COMMUNICATION_GO";

  // Design-session lock: wouldWrite stays false; that is expected, not NO_GO alone.
  const overall: Phase5IDryRunOverallStatus =
    opts?.overallOverride ??
    (planningOk ? "DRY_RUN_PASS" : "DRY_RUN_NO_GO");

  return {
    overallStatus: overall,
    dryRunExecuted,
    logicalFixtureName: result.logicalName,
    authFixtureStrategyValid,
    disabledAuthSupported,
    uidStrategyValid,
    firestoreFixtureSchemaValid,
    syntheticClassificationValid,
    driverMembershipValid,
    expectedClaimsSafe,
    expectedClaimKeyCount: result.claimKeyCount,
    elevatedPrivilege: result.elevatedVerdict !== "AUTH_SAFE_FIXTURE_GO",
    communicationImpact: result.communication.verdict,
    triggerEffectsBounded,
    partialFailureRecoveryDefined,
    exactWriteCountsKnown,
    provisioningWouldBePossible: result.wouldWrite === true,
    wouldCreateAuth: result.wouldWrite === true,
    wouldCreateFirestoreFixture: result.wouldWrite === true,
    actualAuthWrites: 0,
    actualFirestoreWrites: 0,
    productionWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    authCreateInvocationCount: 0,
    firestoreCreateInvocationCount: 0,
    setCustomUserClaimsInvocationCount: 0,
    allWriteFlagsFalseAfterRun: flagsOk,
    wouldWrite: result.wouldWrite,
    actualWrite: false,
    blocker: opts?.blocker,
  };
}

export type Phase5IDryRunObservabilityEvent = {
  readonly event: "phase5i_provision_dry_run";
  readonly overallStatus: Phase5IDryRunOverallStatus;
  readonly dryRunExecuted: boolean;
  readonly actualWrite: false;
  readonly productionWrites: 0;
  readonly authWrites: 0;
  readonly wouldWrite: boolean;
  readonly elevatedPrivilege: boolean;
  readonly allWriteFlagsFalseAfterRun: boolean;
};

export function toPhase5IDryRunObservabilityEvent(
  summary: Phase5IProvisionDryRunSafeSummary,
): Phase5IDryRunObservabilityEvent {
  return {
    event: "phase5i_provision_dry_run",
    overallStatus: summary.overallStatus,
    dryRunExecuted: summary.dryRunExecuted,
    actualWrite: false,
    productionWrites: 0,
    authWrites: 0,
    wouldWrite: summary.wouldWrite,
    elevatedPrivilege: summary.elevatedPrivilege,
    allWriteFlagsFalseAfterRun: summary.allWriteFlagsFalseAfterRun,
  };
}
