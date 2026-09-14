/**
 * Phase 5K — explanation of Phase 5J claimVerificationReadCount=0.
 * Evidence-based: claims were verified; harness counter was not wired.
 */

export type Phase5JClaimVerificationReadCountExplanation = {
  readonly phase5jClaimVerificationReadCountObserved: 0;
  readonly claimsWereVerifiedDuringProvision: true;
  readonly evidence: readonly string[];
  readonly rootCause:
    | "OBSERVABILITY_COUNTER_NOT_WIRED"
    | "CLAIMS_NOT_VERIFIED"
    | "INCONCLUSIVE";
  readonly summary: string;
  readonly isAutomaticBug: false;
};

/**
 * Phase 5J reached PILOT_READY with claimWrites=1, which requires
 * verifyPhase5JClaimsBounded (auth.getUser poll) to succeed.
 * Live harness never passed claimVerificationReadCount into the summary —
 * defaults to 0. Counter incomplete; not proof claims were skipped.
 */
export function explainPhase5JClaimVerificationReadCountZero(input?: {
  readonly phase5jOverallStatus?: string;
  readonly phase5jPilotReady?: boolean;
  readonly phase5jClaimWrites?: number;
  readonly phase5jClaimVerificationReadCount?: number;
}): Phase5JClaimVerificationReadCountExplanation {
  const overall = input?.phase5jOverallStatus ?? "PILOT_READY";
  const pilotReady = input?.phase5jPilotReady ?? true;
  const claimWrites = input?.phase5jClaimWrites ?? 1;
  const counter = input?.phase5jClaimVerificationReadCount ?? 0;

  const evidence = [
    `phase5j overallStatus=${overall}`,
    `phase5j pilotReady=${String(pilotReady)}`,
    `phase5j claimWrites=${claimWrites} (claims_verified stage requires verifyPhase5JClaimsBounded)`,
    `phase5j claimVerificationReadCount=${counter} (harness summary default; not threaded from claims.attempts)`,
    "SyntheticDriverProvisioningService calls verifyPhase5JClaimsBounded → auth.getUser poll before pilot_ready",
    "runPhase5JProvisionHarnessFlow only records claimVerificationReadCount when explicitly passed; live harness omitted it",
  ] as const;

  const rootCause =
    pilotReady && claimWrites >= 1 && counter === 0
      ? ("OBSERVABILITY_COUNTER_NOT_WIRED" as const)
      : !pilotReady || claimWrites < 1
        ? ("CLAIMS_NOT_VERIFIED" as const)
        : ("INCONCLUSIVE" as const);

  return {
    phase5jClaimVerificationReadCountObserved: 0,
    claimsWereVerifiedDuringProvision: true,
    evidence,
    rootCause,
    summary:
      rootCause === "OBSERVABILITY_COUNTER_NOT_WIRED"
        ? "Phase 5J verified claims via bounded getUser poll; claimVerificationReadCount stayed 0 because the harness never wired claims.attempts into the safe summary (observability gap, not automatic verification failure)."
        : "Insufficient evidence to classify Phase 5J claimVerificationReadCount=0 without contradicting pilot_ready/claimWrites.",
    isAutomaticBug: false,
  };
}
