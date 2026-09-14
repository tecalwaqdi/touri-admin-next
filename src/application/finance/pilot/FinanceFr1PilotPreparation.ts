/**
 * FR1 pilot preparation orchestrator — offline + optional ADC read-only search.
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { requireFc01ApprovedPlatformCommissionRate } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  classifyFinanceFr1Trip,
  selectOneSafeSyntheticFinanceFr1Candidate,
  type FinanceFr1CandidateOrder,
  type FinanceFr1TripClassification,
} from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import {
  calculateFinanceFr1PilotSnapshot,
  type FinanceFr1CalculatedSnapshot,
} from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR1_PILOT_CLEANUP_COMMAND,
  FINANCE_FR1_PILOT_CLIENT_KEY,
  FINANCE_FR1_PILOT_ONE_SHOT_LIVE_COMMAND,
  FINANCE_FR1_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  actorHasFinanceFr1Rbac,
  assertFinanceFr1PrepWriteDisabled,
  buildFinanceFr1PrepChecklist,
  evaluateFinanceFr1LiveArmGates,
  type FinanceFr1PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr1PilotGates";
import { FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr1PilotIamDerivation";

export type FinanceFr1PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  fc01RatePercent: number;
  pilotCandidateFound: boolean;
  pilotTripClassification: FinanceFr1TripClassification | "none";
  pilotOrderId: string | null;
  calculatedSnapshot: FinanceFr1CalculatedSnapshot | null;
  exactExpectedWrites: typeof FINANCE_FR1_EXPECTED_WRITE_COUNTS;
  alreadyAppliedWrites: typeof FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredIamPermissions: typeof FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR1_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR1_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr1PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveArmGates: ReturnType<typeof evaluateFinanceFr1LiveArmGates>;
  oneShotLiveCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  clientKey: typeof FINANCE_FR1_PILOT_CLIENT_KEY;
};

const ONE_SHOT_LIVE_COMMAND = FINANCE_FR1_PILOT_ONE_SHOT_LIVE_COMMAND;

const CLEANUP_COMMAND = FINANCE_FR1_PILOT_CLEANUP_COMMAND;

export function prepareFinanceFr1Pilot(input: {
  orders: FinanceFr1CandidateOrder[];
  actorUserId?: string;
  actorPermissions?: FinancePermission[];
  priorSnapshotExists?: boolean;
  discountFundingOwner?: "company" | "agent" | "driver" | "campaign" | null;
  asOfUtc?: string;
}): FinanceFr1PilotPreparationResult {
  assertFinanceFr1PrepWriteDisabled(process.env);

  const fc01RatePercent = requireFc01ApprovedPlatformCommissionRate({
    asOfUtc: input.asOfUtc ?? "2026-09-13T21:00:00.000Z",
  });

  const candidate = selectOneSafeSyntheticFinanceFr1Candidate(input.orders);
  const actorUserId = input.actorUserId ?? "finance_fr1_prep_actor";
  const permissions: FinancePermission[] = input.actorPermissions ?? [
    "finance:read",
    "settlements:prepare",
  ];
  const rbacPass = actorHasFinanceFr1Rbac(permissions);

  let calculated: FinanceFr1CalculatedSnapshot | null = null;
  let classification: FinanceFr1TripClassification | "none" = "none";

  if (candidate) {
    classification = classifyFinanceFr1Trip(candidate);
    calculated = calculateFinanceFr1PilotSnapshot({
      order: candidate,
      actorUserId,
      discountFundingOwner: input.discountFundingOwner ?? "company",
      asOfUtc: input.asOfUtc ?? "2026-09-13T21:00:00.000Z",
    });
  }

  const noPrior = input.priorSnapshotExists !== true;
  const majorsComplete = Boolean(
    calculated &&
      calculated.grossFareMinor != null &&
      calculated.commissionAmountPersistedMinor != null &&
      calculated.vatAmountMinor != null &&
      calculated.driverNetMinor != null,
  );
  const discountOk = Boolean(
    calculated &&
      (!calculated.discountPolicyBlocked ||
        calculated.discountMinor == null),
  );
  const agentOk = Boolean(
    calculated &&
      (calculated.agentAttributionStatus === "snapshot" ||
        calculated.agentAttributionStatus === "unknown_historical"),
  );
  const reconciliationOk = Boolean(
    calculated && calculated.reconciliationStatus === "preconditions_ok",
  );

  const checklist = buildFinanceFr1PrepChecklist({
    candidateFound: Boolean(candidate),
    classification: classification === "none" ? null : classification,
    lifecycleCompleted: Boolean(calculated?.lifecycleCompleted),
    currencyPresent: Boolean(calculated?.currency?.trim()),
    majorsComplete,
    fc01RateResolves: fc01RatePercent === 15,
    discountOk: candidate ? discountOk : false,
    driverNetPresent: Boolean(calculated?.driverNetMinor != null),
    agentOk: candidate ? agentOk : false,
    noPriorSnapshot: candidate ? noPrior : false,
    reconciliationOk: candidate ? reconciliationOk : false,
    calculated: Boolean(calculated),
    expectedWritesKnown: true,
    rbacPass,
    nonFinanceWritesForbidden:
      FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS.length > 0 &&
      FINANCE_FR1_ZERO_WRITE_COUNTS.order === 0 &&
      FINANCE_FR1_ZERO_WRITE_COUNTS.drivers === 0,
  });

  const prepChecklistPassCount = checklist.filter((c) => c.pass).length;
  const liveArmGates = evaluateFinanceFr1LiveArmGates({
    env: process.env,
    mode: "preparation",
  });

  const goNoGoReasons: string[] = [];
  if (!candidate) {
    goNoGoReasons.push("no_safe_synthetic_test_completed_trip");
  }
  if (candidate && classification !== "synthetic_test") {
    goNoGoReasons.push("candidate_not_synthetic_test");
  }
  if (!rbacPass) goNoGoReasons.push("rbac_incomplete");
  if (input.priorSnapshotExists === true) {
    goNoGoReasons.push("prior_snapshot_or_idempotency_exists");
  }
  if (calculated && calculated.reconciliationStatus !== "preconditions_ok") {
    goNoGoReasons.push(
      ...calculated.reconciliationBlockers.map((b) => `recon:${b}`),
    );
  }
  if (prepChecklistPassCount < 14) {
    goNoGoReasons.push(
      `prep_checklist_incomplete:${prepChecklistPassCount}/14`,
    );
  }
  goNoGoReasons.push("FINANCE_WRITE_ENABLED=false_during_prep");
  goNoGoReasons.push("live_apply_not_executed_this_session");

  // Prep session itself is always NO-GO for live write. Conditional GO only
  // means "prep artifacts ready for a future armed session".
  const prepReadyForFutureArm =
    Boolean(candidate) &&
    classification === "synthetic_test" &&
    prepChecklistPassCount === 14 &&
    calculated?.reconciliationStatus === "preconditions_ok" &&
    noPrior &&
    rbacPass;

  return {
    fc01Status: "APPROVED_15_PERCENT",
    fc01LockStatus: FC01_LOCK_STATUS,
    fc01RatePercent,
    pilotCandidateFound: Boolean(candidate),
    pilotTripClassification: classification,
    pilotOrderId: candidate?.documentId ?? null,
    calculatedSnapshot: calculated,
    exactExpectedWrites: FINANCE_FR1_EXPECTED_WRITE_COUNTS,
    alreadyAppliedWrites: FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredIamPermissions: FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR1_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR1_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR1_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount,
    liveArmGates,
    oneShotLiveCommand: ONE_SHOT_LIVE_COMMAND,
    cleanupCommand: CLEANUP_COMMAND,
    // Explicit: this preparation task never returns GO for live write.
    // Future armed session may use prepReadyForFutureArm separately.
    goNoGo: prepReadyForFutureArm ? "GO" : "NO-GO",
    goNoGoReasons: prepReadyForFutureArm
      ? [
          "PREP_READY — live write still requires separate armed session with FINANCE_FR1_PILOT_APPLY=1 and FINANCE_WRITE_ENABLED=true; not executed this session",
        ]
      : goNoGoReasons,
    clientKey: FINANCE_FR1_PILOT_CLIENT_KEY,
  };
}

export function emptyFinanceFr1PilotPreparationNoGo(): FinanceFr1PilotPreparationResult {
  return prepareFinanceFr1Pilot({
    orders: [],
    actorPermissions: ["finance:read", "settlements:prepare"],
  });
}
