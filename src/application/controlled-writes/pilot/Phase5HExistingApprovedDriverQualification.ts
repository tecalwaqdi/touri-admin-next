/**
 * Phase 5H pivot — qualify ONE existing Phase 5G approved synthetic Driver
 * for approved→suspended Pilot (with suspended→approved rollback plan).
 * READ-ONLY. No Production mutation. No fixture create. No Auth create.
 */

import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import type { CanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import type { DriverAccountEnabled } from "@/domain/driver/DriverCanonicalStatuses";
import {
  classifyPhase5GSyntheticEvidence,
  type Phase5GSyntheticEvidenceKind,
} from "@/application/controlled-writes/pilot/Phase5GSyntheticEvidence";
import {
  classifyPhase5GFinanceSafety,
  isPhase5GFinancePilotSafe,
  type Phase5GFinanceImpactClassification,
  type Phase5GPendingSettlement,
  type Phase5GWalletImpact,
} from "@/application/controlled-writes/pilot/Phase5GFinanceSafetyClassification";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";
import { enumeratePhase5GTargetActionCandidates } from "@/application/controlled-writes/pilot/Phase5GPilotActionSafety";
import {
  assessAuthImpactForApprovedSuspendPilot,
  type Phase5HApprovedSuspendAuthAssessment,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverAuthImpact";
import {
  buildExactRollbackDiffPlan,
  buildExactSuspendDiffPlan,
  PHASE_5H_EXPECTED_FUTURE_ROLLBACK_WRITE_COUNTS,
  PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS,
  PHASE_5H_EXPECTED_QUALIFICATION_SESSION_WRITES,
  type Phase5HExpectedFutureWriteCounts,
  type Phase5HRollbackDiffPlan,
  type Phase5HSuspendDiffPlan,
} from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverDiffContract";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";

export const PHASE_5H_EXISTING_APPROVED_PILOT_ACTION = "suspend" as const;
export const PHASE_5H_EXISTING_APPROVED_ROLLBACK_ACTION = "approve" as const;

export type Phase5HExistingApprovedPilotVerdict =
  | "GO"
  | "CONDITIONAL_GO"
  | "NO_GO";

export type Phase5HExistingApprovedNoGoCode =
  | "PENDING_OPERATOR_TARGET_ID"
  | "PILOT_TARGET_NOT_SYNTHETIC"
  | "NOT_OPERATIONAL_DRIVER"
  | "ROLE_CONFLICT"
  | "NOT_APPROVED_STATE"
  | "DRIVER_HAS_ACTIVE_TRIP"
  | "FINANCE_UNKNOWN_OR_PRESENT"
  | "AUTH_SIDE_EFFECT_PRESENT"
  | "ROLLBACK_NOT_SAFE"
  | "PHASE5G_NOT_SAFE_RANK"
  | "REAL_USER_IMPACT_UNKNOWN";

export type Phase5HExistingApprovedQualificationInput = {
  /**
   * Safe document id from Phase 5G inventory (no PII).
   * When unknown without Production → null → PENDING_OPERATOR.
   */
  documentId: string | null;
  data?: Record<string, unknown> | null;
  mappingStatus?: string | null;
  /**
   * When true, offline contract path qualifies against selection rules +
   * Auth/diff without a live document payload.
   */
  offlineContractOnly?: boolean;
};

export type Phase5HExistingApprovedQualificationResult = {
  EXISTING_APPROVED_SYNTHETIC_PILOT: "NO_GO" | "GO" | "CONDITIONAL_GO";
  verdict: Phase5HExistingApprovedPilotVerdict;
  qualificationScore: number;
  safeTargetId: string | "PENDING_OPERATOR";
  syntheticProof: {
    ok: boolean;
    evidenceKind: Phase5GSyntheticEvidenceKind | null;
    markersMatched: readonly string[];
    code?: "PILOT_TARGET_NOT_SYNTHETIC";
  };
  currentState: {
    registrationStatus: CanonicalDriverRegistrationStatus | "PENDING_OPERATOR";
    accountEnabled: DriverAccountEnabled | "PENDING_OPERATOR";
    operationalDriver: boolean | "PENDING_OPERATOR";
    authoritativeRole: "driver" | "conflict" | "unknown" | "PENDING_OPERATOR";
    conflictingRole: boolean | "PENDING_OPERATOR";
  };
  activeTrip: {
    hasActiveTrip: boolean | "PENDING_OPERATOR";
    tripState: "idle" | "busy" | "unknown" | "PENDING_OPERATOR";
    code?: "DRIVER_HAS_ACTIVE_TRIP";
  };
  finance: {
    pendingSettlement: Phase5GPendingSettlement | "PENDING_OPERATOR";
    payoutDependency: "none" | "present" | "unknown" | "PENDING_OPERATOR";
    walletMutationRequired: false | "PENDING_OPERATOR" | true;
    financialImpact: Phase5GFinanceImpactClassification | "PENDING_OPERATOR";
    walletImpact: Phase5GWalletImpact | "PENDING_OPERATOR";
  };
  auth: Phase5HApprovedSuspendAuthAssessment;
  cloudFunctions: {
    highRisk: readonly string[];
    controlled: readonly string[];
    harmless: readonly string[];
  };
  suspendDiff: Phase5HSuspendDiffPlan;
  rollbackDiff: Phase5HRollbackDiffPlan;
  rollbackSupported: true;
  rollbackSafe: false;
  availabilityImpact: "registration_status_suspended_only";
  realUserImpact: "none" | "unknown" | "PENDING_OPERATOR";
  rbacScope: {
    requiredRole: "super_admin";
    countryScope: "super_admin_unscoped_or_in_scope";
    permission: "drivers:approve";
  };
  precondition: {
    expectedCurrentState: "approved";
    preconditionTokenCaptured: boolean;
    rawTokenExposed: false;
  };
  idempotencyKeys: {
    suspend: string;
    rollback: string;
    separate: true;
  };
  auditPlan: {
    intentBeforeWrite: true;
    resultAfterWrite: true;
    noPii: true;
  };
  expectedFutureWriteCounts: {
    suspend: Phase5HExpectedFutureWriteCounts;
    rollback: Phase5HExpectedFutureWriteCounts;
    session: Phase5HExpectedFutureWriteCounts;
  };
  phase5GNote: {
    syntheticDriversFoundLive: 5;
    approvedLive: 1;
    unknownLive: 4;
    safePilotCandidatesLive: 0;
    suspendSafetyRankWhenEligible: "ACCEPTABLE_WITH_CAUTION";
    onlySafeRankIsNeedsChangesFromPendingReview: true;
  };
  noGoCodes: readonly Phase5HExistingApprovedNoGoCode[];
  recommendation: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING";
  silentFallbackToOtherDriver: false;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
};

function scoreFromNoGo(codes: readonly Phase5HExistingApprovedNoGoCode[]): number {
  // Base 78 for complete offline contracts; Auth NO-GO + pending target deduct.
  let score = 78;
  if (codes.includes("AUTH_SIDE_EFFECT_PRESENT")) score -= 28;
  if (codes.includes("ROLLBACK_NOT_SAFE")) score -= 8;
  if (codes.includes("PENDING_OPERATOR_TARGET_ID")) score -= 6;
  if (codes.includes("PHASE5G_NOT_SAFE_RANK")) score -= 4;
  if (codes.includes("REAL_USER_IMPACT_UNKNOWN")) score -= 2;
  return Math.max(0, Math.min(100, score));
}

/**
 * Qualify the existing approved synthetic Driver Pilot path offline / with
 * optional live-safe classifications. Always Auth NO-GO from 5H evidence.
 */
export function qualifyExistingApprovedSyntheticDriver(
  input: Phase5HExistingApprovedQualificationInput = {
    documentId: null,
    offlineContractOnly: true,
  },
): Phase5HExistingApprovedQualificationResult {
  const auth = assessAuthImpactForApprovedSuspendPilot();
  const suspendDiff = buildExactSuspendDiffPlan();
  const rollbackDiff = buildExactRollbackDiffPlan();
  const noGoCodes: Phase5HExistingApprovedNoGoCode[] = [
    "AUTH_SIDE_EFFECT_PRESENT",
    "ROLLBACK_NOT_SAFE",
    "PHASE5G_NOT_SAFE_RANK",
  ];

  const offline = input.offlineContractOnly === true || !input.documentId?.trim();

  let safeTargetId: string | "PENDING_OPERATOR" = "PENDING_OPERATOR";
  let syntheticProof: Phase5HExistingApprovedQualificationResult["syntheticProof"] =
    {
      ok: false,
      evidenceKind: null,
      markersMatched: [],
    };
  let currentState: Phase5HExistingApprovedQualificationResult["currentState"] = {
    registrationStatus: "PENDING_OPERATOR",
    accountEnabled: "PENDING_OPERATOR",
    operationalDriver: "PENDING_OPERATOR",
    authoritativeRole: "PENDING_OPERATOR",
    conflictingRole: "PENDING_OPERATOR",
  };
  let activeTrip: Phase5HExistingApprovedQualificationResult["activeTrip"] = {
    hasActiveTrip: "PENDING_OPERATOR",
    tripState: "PENDING_OPERATOR",
  };
  let finance: Phase5HExistingApprovedQualificationResult["finance"] = {
    pendingSettlement: "PENDING_OPERATOR",
    payoutDependency: "PENDING_OPERATOR",
    walletMutationRequired: "PENDING_OPERATOR",
    financialImpact: "PENDING_OPERATOR",
    walletImpact: "PENDING_OPERATOR",
  };
  let realUserImpact: Phase5HExistingApprovedQualificationResult["realUserImpact"] =
    "PENDING_OPERATOR";

  if (offline) {
    noGoCodes.push("PENDING_OPERATOR_TARGET_ID");
    noGoCodes.push("REAL_USER_IMPACT_UNKNOWN");
    // Offline: prove synthetic selection rules against a representative approved
    // synthetic shape — not a live ID and not a silent fallback target.
    const representative = {
      documentId: "test_phase5h_existing_approved_representative_offline",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        is_test: true,
        functional_test: true,
        qa_fixture: true,
        on_trip: false,
        mndon_newacc: false,
        is_online: false,
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
      } as Record<string, unknown>,
    };
    const evidence = classifyPhase5GSyntheticEvidence(representative);
    syntheticProof = {
      ok: evidence.ok,
      evidenceKind: evidence.syntheticEvidenceKind,
      markersMatched: evidence.markersMatched,
      code: evidence.ok ? undefined : "PILOT_TARGET_NOT_SYNTHETIC",
    };
    const row = buildPhase5GInventoryRecord(representative);
    if (row) {
      const cands = enumeratePhase5GTargetActionCandidates(row);
      const suspendCand = cands.find((c) => c.action === "suspend");
      // Even when base-eligible, suspend is ACCEPTABLE_WITH_CAUTION — not SAFE.
      if (suspendCand?.safetyRank !== "SAFE") {
        // already recorded PHASE5G_NOT_SAFE_RANK
      }
    }
  } else {
    const documentId = input.documentId!.trim();
    safeTargetId = documentId;
    const data = input.data ?? {};
    const evidence = classifyPhase5GSyntheticEvidence({
      documentId,
      data,
      mappingStatus: input.mappingStatus,
    });
    if (!evidence.ok) {
      noGoCodes.push("PILOT_TARGET_NOT_SYNTHETIC");
      syntheticProof = {
        ok: false,
        evidenceKind: null,
        markersMatched: evidence.markersMatched,
        code: "PILOT_TARGET_NOT_SYNTHETIC",
      };
    } else {
      syntheticProof = {
        ok: true,
        evidenceKind: evidence.syntheticEvidenceKind,
        markersMatched: evidence.markersMatched,
      };
    }

    const membership = classifyDriverMembership(data);
    const axes = mapDriverCanonicalStatuses({
      registration_status:
        data.registration_status == null
          ? null
          : String(data.registration_status),
      submission_status:
        data.submission_status == null ? null : String(data.submission_status),
      actev_mndob:
        typeof data.actev_mndob === "boolean" ? data.actev_mndob : null,
      account_status:
        data.account_status == null ? null : String(data.account_status),
      is_online: typeof data.is_online === "boolean" ? data.is_online : null,
      ngl: data.ngl,
      operational_status:
        data.operational_status == null
          ? null
          : String(data.operational_status),
      on_trip: typeof data.on_trip === "boolean" ? data.on_trip : null,
      mndon_newacc:
        typeof data.mndon_newacc === "boolean" ? data.mndon_newacc : null,
    });

    const agentRole = data.Isagent === true || data.isagent === true;
    const adminRole = membership.isKnownAdministrativeIdentity === true;
    const conflictingRole = agentRole || adminRole;
    const operationalDriver = membership.isOperationalDriver === true;

    if (!operationalDriver) noGoCodes.push("NOT_OPERATIONAL_DRIVER");
    if (conflictingRole) noGoCodes.push("ROLE_CONFLICT");
    if (axes.registration.value !== "approved") {
      noGoCodes.push("NOT_APPROVED_STATE");
    }

    const tripState =
      axes.tripState.value === "busy"
        ? "busy"
        : axes.tripState.value === "idle"
          ? "idle"
          : "unknown";
    const hasActiveTrip = tripState === "busy";
    if (hasActiveTrip || tripState !== "idle") {
      noGoCodes.push("DRIVER_HAS_ACTIVE_TRIP");
      activeTrip = {
        hasActiveTrip,
        tripState,
        code: "DRIVER_HAS_ACTIVE_TRIP",
      };
    } else {
      activeTrip = { hasActiveTrip: false, tripState: "idle" };
    }

    const fin = classifyPhase5GFinanceSafety(data);
    if (!isPhase5GFinancePilotSafe(fin)) {
      noGoCodes.push("FINANCE_UNKNOWN_OR_PRESENT");
    }
    finance = {
      pendingSettlement: fin.pendingSettlement,
      payoutDependency:
        fin.financeImpactClassification === "none" ? "none" : "present",
      walletMutationRequired: false,
      financialImpact: fin.financeImpactClassification,
      walletImpact: fin.walletImpact,
    };

    currentState = {
      registrationStatus: axes.registration.value,
      accountEnabled: axes.account.value,
      operationalDriver,
      authoritativeRole: conflictingRole
        ? "conflict"
        : operationalDriver
          ? "driver"
          : "unknown",
      conflictingRole,
    };

    // Country mapped + synthetic markers → treat real-user impact as none only
    // when geography resolves; otherwise unknown.
    const countryId = extractLegacyDocRefId(data.Rev_dolh);
    const country = countryId
      ? resolveCanonicalCountryId(countryId)
      : null;
    realUserImpact =
      evidence.ok && country?.status === "mapped" ? "none" : "unknown";
    if (realUserImpact !== "none") {
      noGoCodes.push("REAL_USER_IMPACT_UNKNOWN");
    }
  }

  const uniqueCodes = [...new Set(noGoCodes)];

  return {
    EXISTING_APPROVED_SYNTHETIC_PILOT: "NO_GO",
    verdict: "NO_GO",
    qualificationScore: scoreFromNoGo(uniqueCodes),
    safeTargetId,
    syntheticProof,
    currentState,
    activeTrip,
    finance,
    auth,
    cloudFunctions: {
      highRisk: auth.highRiskTriggers,
      controlled: [],
      harmless: ["refreshMyClaims", "notifyAdminsDriverApplication", "adminAdjustDriverWallet"],
    },
    suspendDiff,
    rollbackDiff,
    rollbackSupported: true,
    rollbackSafe: false,
    availabilityImpact: "registration_status_suspended_only",
    realUserImpact,
    rbacScope: {
      requiredRole: "super_admin",
      countryScope: "super_admin_unscoped_or_in_scope",
      permission: "drivers:approve",
    },
    precondition: {
      expectedCurrentState: "approved",
      preconditionTokenCaptured: false,
      rawTokenExposed: false,
    },
    idempotencyKeys: {
      suspend: suspendDiff.idempotencyKey,
      rollback: rollbackDiff.idempotencyKey,
      separate: true,
    },
    auditPlan: {
      intentBeforeWrite: true,
      resultAfterWrite: true,
      noPii: true,
    },
    expectedFutureWriteCounts: {
      suspend: PHASE_5H_EXPECTED_FUTURE_SUSPEND_WRITE_COUNTS,
      rollback: PHASE_5H_EXPECTED_FUTURE_ROLLBACK_WRITE_COUNTS,
      session: PHASE_5H_EXPECTED_QUALIFICATION_SESSION_WRITES,
    },
    phase5GNote: {
      syntheticDriversFoundLive: 5,
      approvedLive: 1,
      unknownLive: 4,
      safePilotCandidatesLive: 0,
      suspendSafetyRankWhenEligible: "ACCEPTABLE_WITH_CAUTION",
      onlySafeRankIsNeedsChangesFromPendingReview: true,
    },
    noGoCodes: uniqueCodes,
    recommendation: "AUTH_SAFE_SYNTHETIC_FIXTURE_PROVISIONING",
    silentFallbackToOtherDriver: false,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
  };
}
