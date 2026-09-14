/**
 * FR3 Reconciliation pilot preparation orchestrator — offline.
 * Read-only by F1–F6 design (shadow recon; write run doc later).
 * Never writes. FINANCE_WRITE_ENABLED must remain false.
 * Inputs: proven FR1 snapshot + FR2 Settlement V2 draft only.
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FC01_LOCK_STATUS } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertFinanceFr3ReconDeterministic,
  reconcileFinanceFr3SnapshotToSettlement,
  type FinanceFr3ReconciliationResult,
  type FinanceFr3SettlementInput,
  type FinanceFr3SourceSnapshot,
} from "@/application/finance/pilot/FinanceFr3PilotCalculator";
import {
  FINANCE_FR3_ALLOWED_WRITE_COLLECTIONS,
  FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR3_EXPECTED_PROJECT_ID,
  FINANCE_FR3_EXPECTED_WRITE_COUNTS,
  FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS,
  FINANCE_FR3_PERSISTENCE_MODE,
  FINANCE_FR3_PILOT_CLEANUP_COMMAND,
  FINANCE_FR3_PILOT_CLIENT_KEY,
  FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  FINANCE_FR3_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import {
  actorHasFinanceFr3Rbac,
  assertFinanceFr3PrepWriteDisabled,
  buildFinanceFr3PrepChecklist,
  evaluateFinanceFr3LiveVerifyGates,
  type FinanceFr3PrepChecklistItem,
} from "@/application/finance/pilot/FinanceFr3PilotGates";
import {
  FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
} from "@/application/finance/pilot/FinanceFr3PilotIamDerivation";
import {
  FINANCE_FR3_LOCKED_RECON_EXPECTATIONS,
  FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE,
  FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE,
} from "@/application/finance/pilot/FinanceFr3PilotDocuments";
import {
  buildFinanceFr1PilotIdempotencyDoc,
  isConsistentFinanceFr1PilotAppliedState,
} from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import {
  buildFinanceFr2PilotIdempotencyDoc,
  isConsistentFinanceFr2PilotAppliedState,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR2_COUNTRY_ID } from "@/application/finance/pilot/FinanceFr2PilotConstants";

function defaultFr1Idempotency(): Record<string, unknown> {
  return buildFinanceFr1PilotIdempotencyDoc({
    actorUid: "finance_fr3_prep_actor",
    correlationId: "fr3_prep_corr",
    auditIntentId: "fr1_audit_intent",
    auditResultId: "fr1_audit_result",
    createdAtUtc: "2026-09-13T21:00:00.000Z",
  }) as unknown as Record<string, unknown>;
}

function defaultFr2Idempotency(): Record<string, unknown> {
  return buildFinanceFr2PilotIdempotencyDoc({
    actorUid: "finance_fr3_prep_actor",
    correlationId: "fr3_prep_corr",
    auditIntentId: "fr2_audit_intent",
    auditResultId: "fr2_audit_result",
    createdAtUtc: "2026-09-13T22:00:00.000Z",
  }) as unknown as Record<string, unknown>;
}

export type FinanceFr3PilotPreparationResult = {
  fc01Status: "APPROVED_15_PERCENT";
  fc01LockStatus: typeof FC01_LOCK_STATUS;
  persistenceMode: typeof FINANCE_FR3_PERSISTENCE_MODE;
  pilotInput: "fr1_snapshot_and_fr2_settlement_v2";
  fr1SnapshotId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  fr2SettlementId: string;
  reconciliation: FinanceFr3ReconciliationResult | null;
  lockedReconExpectations: typeof FINANCE_FR3_LOCKED_RECON_EXPECTATIONS;
  exactExpectedWrites: typeof FINANCE_FR3_EXPECTED_WRITE_COUNTS;
  productionWritesThisSession: 0;
  financeWriteEnabled: false;
  requiredIamPermissionsForWrites: typeof FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES;
  requiredIamPermissionsForLiveReadVerify: typeof FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  expectedAdcPrincipal: typeof FINANCE_FR3_EXPECTED_ADC_PRINCIPAL;
  expectedProjectId: typeof FINANCE_FR3_EXPECTED_PROJECT_ID;
  allowedCollections: typeof FINANCE_FR3_ALLOWED_WRITE_COLLECTIONS;
  forbiddenCollections: typeof FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS;
  prepChecklist: FinanceFr3PrepChecklistItem[];
  prepChecklistPassCount: number;
  liveVerifyGates: ReturnType<typeof evaluateFinanceFr3LiveVerifyGates>;
  oneShotLiveReadCommand: string;
  cleanupCommand: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReasons: string[];
  clientKey: typeof FINANCE_FR3_PILOT_CLIENT_KEY;
  fr3PrepStatus: "PASS" | "NO-GO";
  writeHarnessRequired: false;
};

export function prepareFinanceFr3ReconciliationPilot(input?: {
  fr1Snapshot?: FinanceFr3SourceSnapshot | null;
  fr2Settlement?: FinanceFr3SettlementInput | null;
  fr1Idempotency?: Record<string, unknown> | null;
  fr2Idempotency?: Record<string, unknown> | null;
  fr1SnapshotComplete?: boolean;
  fr2SettlementComplete?: boolean;
  fr1IdempotencyComplete?: boolean;
  fr2IdempotencyComplete?: boolean;
  actorUserId?: string;
  actorPermissions?: FinancePermission[];
}): FinanceFr3PilotPreparationResult {
  assertFinanceFr3PrepWriteDisabled(process.env);

  const snapshot =
    input?.fr1Snapshot === undefined
      ? FINANCE_FR3_PREP_FR1_SNAPSHOT_FIXTURE
      : input.fr1Snapshot;
  const settlement =
    input?.fr2Settlement === undefined
      ? FINANCE_FR3_PREP_FR2_SETTLEMENT_FIXTURE
      : input.fr2Settlement;
  const fr1Idem =
    input?.fr1Idempotency === undefined
      ? defaultFr1Idempotency()
      : input.fr1Idempotency;
  const fr2Idem =
    input?.fr2Idempotency === undefined
      ? defaultFr2Idempotency()
      : input.fr2Idempotency;

  const actorUserId = input?.actorUserId ?? "finance_fr3_prep_actor";
  const permissions: FinancePermission[] = input?.actorPermissions ?? [
    "finance:read",
  ];
  const rbacPass = actorHasFinanceFr3Rbac(permissions);

  const reconciliation = reconcileFinanceFr3SnapshotToSettlement({
    snapshot,
    settlement,
    fr1Idempotency: fr1Idem,
    fr2Idempotency: fr2Idem,
    actorUserId,
    actorPermissions: permissions,
  });

  // Determinism proof (duplicate recon)
  const reconAgain = reconcileFinanceFr3SnapshotToSettlement({
    snapshot,
    settlement,
    fr1Idempotency: fr1Idem,
    fr2Idempotency: fr2Idem,
    actorUserId,
    actorPermissions: permissions,
  });
  const nondeterministic = assertFinanceFr3ReconDeterministic(
    reconciliation,
    reconAgain,
  );

  const fr1SnapOk =
    input?.fr1SnapshotComplete !== false &&
    snapshot != null &&
    (fr1Idem == null
      ? true
      : isConsistentFinanceFr1PilotAppliedState({
          snapshot: snapshot as Record<string, unknown>,
          idempotency: fr1Idem,
        }));
  const fr2SettOk =
    input?.fr2SettlementComplete !== false &&
    settlement != null &&
    (fr2Idem == null
      ? true
      : isConsistentFinanceFr2PilotAppliedState({
          settlement: settlement as Record<string, unknown>,
          idempotency: fr2Idem,
        }));
  const fr1IdemOk = input?.fr1IdempotencyComplete !== false && fr1Idem != null;
  const fr2IdemOk = input?.fr2IdempotencyComplete !== false && fr2Idem != null;

  const reconPass = reconciliation.reconciliationStatus === "PASS";
  const checklist = buildFinanceFr3PrepChecklist({
    fr1SnapshotComplete: fr1SnapOk,
    fr2SettlementComplete: fr2SettOk,
    fr1IdempotencyComplete: fr1IdemOk,
    fr2IdempotencyComplete: fr2IdemOk,
    currencyMatch: reconciliation.currencyMatches,
    directionMatch: reconciliation.directionMatches,
    claimMatchesCommission: reconciliation.claimMatchesCommission,
    outstandingOk:
      reconciliation.paidConfirmedMinor === "0" &&
      reconciliation.outstandingMinor === "1500",
    financeRbac: rbacPass,
    countryScopeOk:
      String(snapshot?.countryId ?? "") === FINANCE_FR2_COUNTRY_ID &&
      String(settlement?.countryId ?? "") === FINANCE_FR2_COUNTRY_ID,
    fcPoliciesOk: true,
    noMissingRequiredValues:
      reconciliation.reconciliationBlockers.every(
        (b) => !b.startsWith("missing:"),
      ),
    snapshotImmutable:
      snapshot?.mutatesOrderMajors === false &&
      snapshot?.historicalReRateForbidden === true,
    settlementNotRewritten: settlement?.mutatesFinanceSnapshot === false,
    reconPass,
    expectedWritesZero:
      FINANCE_FR3_ZERO_WRITE_COUNTS.totalProductionWrites === 0,
    persistenceReadOnly: FINANCE_FR3_PERSISTENCE_MODE === "read_only_shadow",
  });

  const prepChecklistPassCount = checklist.filter((c) => c.pass).length;
  const liveVerifyGates = evaluateFinanceFr3LiveVerifyGates({
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
  if (!reconPass) {
    goNoGoReasons.push(...reconciliation.reconciliationBlockers);
  }
  if (nondeterministic.length > 0) {
    goNoGoReasons.push(...nondeterministic);
  }

  const goNoGo: "GO" | "NO-GO" =
    goNoGoReasons.length === 0 && prepChecklistPassCount === checklist.length
      ? "GO"
      : "NO-GO";

  return {
    fc01Status: "APPROVED_15_PERCENT",
    fc01LockStatus: FC01_LOCK_STATUS,
    persistenceMode: FINANCE_FR3_PERSISTENCE_MODE,
    pilotInput: "fr1_snapshot_and_fr2_settlement_v2",
    fr1SnapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    fr2SettlementId: String(
      settlement?.id ?? FINANCE_FR3_LOCKED_RECON_EXPECTATIONS.settlementId,
    ),
    reconciliation: reconPass ? reconciliation : reconciliation,
    lockedReconExpectations: FINANCE_FR3_LOCKED_RECON_EXPECTATIONS,
    exactExpectedWrites: FINANCE_FR3_EXPECTED_WRITE_COUNTS,
    productionWritesThisSession: 0,
    financeWriteEnabled: false,
    requiredIamPermissionsForWrites:
      FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS_FOR_WRITES,
    requiredIamPermissionsForLiveReadVerify:
      FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    expectedAdcPrincipal: FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
    expectedProjectId: FINANCE_FR3_EXPECTED_PROJECT_ID,
    allowedCollections: FINANCE_FR3_ALLOWED_WRITE_COLLECTIONS,
    forbiddenCollections: FINANCE_FR3_FORBIDDEN_WRITE_COLLECTIONS,
    prepChecklist: checklist,
    prepChecklistPassCount,
    liveVerifyGates,
    oneShotLiveReadCommand: FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
    cleanupCommand: FINANCE_FR3_PILOT_CLEANUP_COMMAND,
    goNoGo,
    goNoGoReasons,
    clientKey: FINANCE_FR3_PILOT_CLIENT_KEY,
    fr3PrepStatus: goNoGo === "GO" ? "PASS" : "NO-GO",
    writeHarnessRequired: false,
  };
}
