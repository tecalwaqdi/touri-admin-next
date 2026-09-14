/**
 * Phase 5K — orchestrate read-only verification of Phase 5J provisioned fixture.
 * No Auth/Firestore/Finance/Trip writes. No RequestDriverChanges apply.
 */

import { PHASE_5I_FIXTURE_COUNTRY_ID } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import { verifyPhase5JCanonicalFixture } from "@/application/controlled-writes/pilot/Phase5JCanonicalFixtureVerification";
import { verifyPhase5KAuthUser } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";
import { explainPhase5JClaimVerificationReadCountZero } from "@/application/controlled-writes/pilot/Phase5KClaimVerificationExplanation";
import { verifyPhase5KFinanceAndTrip } from "@/application/controlled-writes/pilot/Phase5KFinanceTripVerification";
import { verifyPhase5KFirestoreFixture } from "@/application/controlled-writes/pilot/Phase5KFirestoreVerification";
import { evaluatePhase5KPilotCompatibility } from "@/application/controlled-writes/pilot/Phase5KPilotCompatibilityCheck";
import {
  loadPhase5KFixtureUidFromRegistry,
  type Phase5KRegistrySourceResult,
} from "@/application/controlled-writes/pilot/Phase5KRegistrySource";
import type { Phase5KReadOnlyPorts } from "@/application/controlled-writes/pilot/Phase5KReadOnlyFirebaseAdapters";
import {
  emptyPhase5KVerificationSafeSummary,
  evaluatePhase5KPassConditions,
  type Phase5KVerificationSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5KVerificationSafeSummary";
import { PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE } from "@/application/controlled-writes/pilot/isPhase5KVerifyProvisionedDriverFixtureEnabled";
import { assertPhase5KWriteFlagsFalse } from "@/application/controlled-writes/pilot/Phase5KWriteFlagAssert";

export type Phase5KVerifyInput = {
  readonly harnessArmed: boolean;
  readonly cwd?: string;
  /** Injected ports for offline unit tests; live harness supplies ADC ports. */
  readonly ports?: Phase5KReadOnlyPorts;
  /** Optional offline registry override (tests). */
  readonly registryOverride?: Phase5KRegistrySourceResult;
  readonly writeFlags?: typeof PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE;
};

export type Phase5KVerifyResult = {
  readonly summary: Phase5KVerificationSafeSummary;
  readonly phase5jClaimNote: string;
};

/**
 * Run Phase 5K verification. When harnessArmed=false → SKIPPED.
 * When armed but ports missing → PENDING_OPERATOR (offline readiness still reportable).
 */
export async function runPhase5KVerifyProvisionedFixture(
  input: Phase5KVerifyInput,
): Promise<Phase5KVerifyResult> {
  const claimNote = explainPhase5JClaimVerificationReadCountZero();
  const writeFlags = input.writeFlags ?? PHASE_5K_REQUIRED_WRITE_FLAGS_FALSE;
  const flagsOk = assertPhase5KWriteFlagsFalse(writeFlags);

  if (!input.harnessArmed) {
    return {
      summary: emptyPhase5KVerificationSafeSummary({
        overallStatus: "SKIPPED",
        allWriteFlagsFalseAfterRun: flagsOk,
        phase5jClaimVerificationNote: claimNote.summary,
        blocker: "PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE!=1",
      }),
      phase5jClaimNote: claimNote.summary,
    };
  }

  const registry =
    input.registryOverride ??
    loadPhase5KFixtureUidFromRegistry(input.cwd ?? process.cwd());

  if (!registry.ok) {
    return {
      summary: emptyPhase5KVerificationSafeSummary({
        overallStatus: "PHASE5K_FIXTURE_VERIFICATION_FAILED",
        fixtureFound: false,
        logicalFixtureNameMatch: registry.logicalFixtureNameMatch,
        provisioningStatusMatch: registry.provisioningStatusMatch,
        registryStatus: registry.status,
        allWriteFlagsFalseAfterRun: flagsOk,
        pilotDryRunEligible: false,
        denials: [registry.code],
        blocker: registry.message,
        phase5jClaimVerificationNote: claimNote.summary,
        liveVerificationAttempted: false,
      }),
      phase5jClaimNote: claimNote.summary,
    };
  }

  if (!input.ports) {
    return {
      summary: emptyPhase5KVerificationSafeSummary({
        overallStatus: "PENDING_OPERATOR",
        fixtureFound: true,
        logicalFixtureNameMatch: true,
        provisioningStatusMatch: true,
        registryStatus: registry.status,
        allWriteFlagsFalseAfterRun: flagsOk,
        pilotDryRunEligible: false,
        blocker:
          "PENDING_OPERATOR — registry OK; ADC read-only ports not supplied",
        phase5jClaimVerificationNote: claimNote.summary,
        liveVerificationAttempted: false,
      }),
      phase5jClaimNote: claimNote.summary,
    };
  }

  const ports = input.ports;
  const uid = registry.uid;

  const authUser = await ports.auth.getUser(uid);
  const claimVerificationReadCount = authUser ? 1 : 0;
  // Re-read claims explicitly counted (same getUser already counted as 1).
  const auth = verifyPhase5KAuthUser(authUser, claimVerificationReadCount);

  const fsDoc = await ports.firestore.getUserDoc(uid);
  const firestore = verifyPhase5KFirestoreFixture(
    fsDoc.exists ? fsDoc.data : null,
  );

  const canonical = verifyPhase5JCanonicalFixture({
    uid,
    data: fsDoc.exists && fsDoc.data ? fsDoc.data : undefined,
  });

  const financeTrip = verifyPhase5KFinanceAndTrip(
    fsDoc.exists ? fsDoc.data : null,
  );

  const pilot = evaluatePhase5KPilotCompatibility({
    driverId: uid,
    registrationStatus: canonical.ok
      ? canonical.registrationStatus
      : firestore.firestoreFixtureFound
        ? String(
            (fsDoc.data as Record<string, unknown> | null)?.registration_status ??
              null,
          )
        : null,
    operationalDriver: canonical.ok ? canonical.operationalDriver : false,
    hasActiveTrip: financeTrip.hasActiveTrip,
    countryId: PHASE_5I_FIXTURE_COUNTRY_ID,
    preconditionToken: fsDoc.preconditionToken,
    writeFlags,
  });

  const denials = [
    ...auth.denials,
    ...firestore.denials,
    ...(canonical.ok ? [] : [canonical.code]),
    ...financeTrip.denials,
    ...pilot.denials,
  ];

  const base = {
    authUserFound: auth.authUserFound,
    authDisabled: auth.authDisabled,
    expectedClaimsMatch: auth.expectedClaimsMatch,
    elevatedClaimsFound: auth.elevatedClaimsFound,
    firestoreFixtureFound: firestore.firestoreFixtureFound,
    synthetic: canonical.ok ? canonical.synthetic : false,
    operationalDriver: canonical.ok ? canonical.operationalDriver : false,
    registrationStatus: canonical.ok
      ? canonical.registrationStatus
      : (fsDoc.data?.registration_status as string | undefined) ?? null,
    countryMapped: firestore.countryMapped,
    cityMapped: firestore.cityMapped,
    hasActiveTrip: financeTrip.hasActiveTrip,
    financialImpact: financeTrip.financialImpact,
    pendingSettlement: financeTrip.pendingSettlement,
    walletMutationRequired: financeTrip.walletMutationRequired,
    rbacPass: pilot.rbacPass,
    scopePass: pilot.scopePass,
    transitionAllowed: pilot.transitionAllowed,
    preconditionAvailable: pilot.preconditionAvailable,
    productionWrites: 0 as const,
    claimVerificationReadCount: auth.claimVerificationReadCount,
  };

  const pass = evaluatePhase5KPassConditions(base);
  const verified = pass.ok && flagsOk && pilot.allWriteFlagsFalse;

  const summary: Phase5KVerificationSafeSummary = {
    overallStatus: verified
      ? "PHASE5K_FIXTURE_VERIFIED"
      : "PHASE5K_FIXTURE_VERIFICATION_FAILED",
    fixtureFound: true,
    authUserFound: base.authUserFound,
    authDisabled: base.authDisabled,
    claimVerificationReadCount: base.claimVerificationReadCount,
    expectedClaimsMatch: base.expectedClaimsMatch,
    elevatedClaimsFound: base.elevatedClaimsFound,
    firestoreFixtureFound: base.firestoreFixtureFound,
    synthetic: base.synthetic,
    authoritativeRole: canonical.ok ? canonical.authoritativeRole : "unknown",
    operationalDriver: base.operationalDriver,
    registrationStatus: base.registrationStatus,
    countryMapped: base.countryMapped,
    cityMapped: base.cityMapped,
    hasActiveTrip: base.hasActiveTrip,
    financialImpact: base.financialImpact,
    pendingSettlement: base.pendingSettlement,
    walletMutationRequired: base.walletMutationRequired,
    rbacPass: base.rbacPass,
    scopePass: base.scopePass,
    transitionAllowed: base.transitionAllowed,
    preconditionAvailable: base.preconditionAvailable,
    pilotDryRunEligible: verified,
    productionReads: ports.readCounter.productionReads,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    allWriteFlagsFalseAfterRun: flagsOk && pilot.allWriteFlagsFalse,
    logicalFixtureNameMatch: true,
    provisioningStatusMatch: true,
    registryStatus: registry.status,
    liveVerificationAttempted: true,
    denials: pass.ok ? denials : [...denials, ...(!pass.ok ? pass.denials : [])],
    phase5jClaimVerificationNote: claimNote.summary,
    blocker: verified
      ? undefined
      : !pass.ok
        ? pass.denials.join(",")
        : denials.join(",") || "VERIFICATION_FAILED",
  };

  return { summary, phase5jClaimNote: claimNote.summary };
}
