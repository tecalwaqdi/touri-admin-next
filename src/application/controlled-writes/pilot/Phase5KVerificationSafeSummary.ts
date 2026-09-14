/**
 * Phase 5K — safe verification summary (no password/token/email/phone/UID dump).
 */

export type Phase5KOverallStatus =
  | "SKIPPED"
  | "PENDING_OPERATOR"
  | "PHASE5K_FIXTURE_VERIFIED"
  | "PHASE5K_FIXTURE_VERIFICATION_FAILED";

export type Phase5KVerificationSafeSummary = {
  overallStatus: Phase5KOverallStatus;
  fixtureFound: boolean;
  authUserFound: boolean;
  authDisabled: boolean;
  claimVerificationReadCount: number;
  expectedClaimsMatch: boolean;
  elevatedClaimsFound: boolean;
  firestoreFixtureFound: boolean;
  synthetic: boolean;
  authoritativeRole: "driver" | "unknown" | null;
  operationalDriver: boolean;
  registrationStatus: string | null;
  countryMapped: boolean;
  cityMapped: boolean;
  hasActiveTrip: boolean | "unknown";
  financialImpact: "none" | "present" | "unknown";
  pendingSettlement: boolean | "unknown";
  walletMutationRequired: boolean | "unknown";
  rbacPass: boolean;
  scopePass: boolean;
  transitionAllowed: boolean;
  preconditionAvailable: boolean;
  pilotDryRunEligible: boolean;
  productionReads: number;
  productionWrites: 0;
  authWrites: 0;
  financeWrites: 0;
  tripWrites: 0;
  allWriteFlagsFalseAfterRun: boolean;
  logicalFixtureNameMatch?: boolean;
  provisioningStatusMatch?: boolean;
  registryStatus?: string | null;
  liveVerificationAttempted?: boolean;
  blocker?: string;
  denials?: readonly string[];
  phase5jClaimVerificationNote?: string;
};

export function emptyPhase5KVerificationSafeSummary(
  overrides?: Partial<Phase5KVerificationSafeSummary>,
): Phase5KVerificationSafeSummary {
  return {
    overallStatus: "SKIPPED",
    fixtureFound: false,
    authUserFound: false,
    authDisabled: false,
    claimVerificationReadCount: 0,
    expectedClaimsMatch: false,
    elevatedClaimsFound: false,
    firestoreFixtureFound: false,
    synthetic: false,
    authoritativeRole: null,
    operationalDriver: false,
    registrationStatus: null,
    countryMapped: false,
    cityMapped: false,
    hasActiveTrip: "unknown",
    financialImpact: "unknown",
    pendingSettlement: "unknown",
    walletMutationRequired: "unknown",
    rbacPass: false,
    scopePass: false,
    transitionAllowed: false,
    preconditionAvailable: false,
    pilotDryRunEligible: false,
    productionReads: 0,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    allWriteFlagsFalseAfterRun: true,
    ...overrides,
  };
}

/** PASS only when every required condition holds. */
export function evaluatePhase5KPassConditions(s: {
  authUserFound: boolean;
  authDisabled: boolean;
  expectedClaimsMatch: boolean;
  elevatedClaimsFound: boolean;
  firestoreFixtureFound: boolean;
  synthetic: boolean;
  operationalDriver: boolean;
  registrationStatus: string | null;
  countryMapped: boolean;
  cityMapped: boolean;
  hasActiveTrip: boolean | "unknown";
  financialImpact: "none" | "present" | "unknown";
  pendingSettlement: boolean | "unknown";
  walletMutationRequired: boolean | "unknown";
  rbacPass: boolean;
  scopePass: boolean;
  transitionAllowed: boolean;
  preconditionAvailable: boolean;
  productionWrites: number;
  claimVerificationReadCount: number;
}): { ok: true } | { ok: false; denials: string[] } {
  const denials: string[] = [];
  if (!s.authUserFound) denials.push("AUTH_USER_NOT_FOUND");
  if (!s.authDisabled) denials.push("AUTH_NOT_DISABLED");
  if (!s.expectedClaimsMatch) denials.push("CLAIMS_MISMATCH");
  if (s.elevatedClaimsFound) denials.push("ELEVATED_CLAIMS_FOUND");
  if (s.claimVerificationReadCount < 1) {
    denials.push("CLAIM_VERIFICATION_READ_COUNT_LT_1");
  }
  if (!s.firestoreFixtureFound) denials.push("FIRESTORE_FIXTURE_NOT_FOUND");
  if (!s.synthetic) denials.push("NOT_SYNTHETIC");
  if (!s.operationalDriver) denials.push("NOT_OPERATIONAL_DRIVER");
  if (s.registrationStatus !== "pending_review") {
    denials.push("REGISTRATION_NOT_PENDING_REVIEW");
  }
  if (!s.countryMapped) denials.push("COUNTRY_NOT_MAPPED");
  if (!s.cityMapped) denials.push("CITY_NOT_MAPPED");
  if (s.hasActiveTrip !== false) denials.push("ACTIVE_TRIP_OR_UNKNOWN");
  if (s.financialImpact !== "none") denials.push("FINANCIAL_IMPACT_NOT_NONE");
  if (s.pendingSettlement !== false) denials.push("PENDING_SETTLEMENT");
  if (s.walletMutationRequired !== false) {
    denials.push("WALLET_MUTATION_REQUIRED_OR_UNKNOWN");
  }
  if (!s.rbacPass) denials.push("RBAC_FAIL");
  if (!s.scopePass) denials.push("SCOPE_FAIL");
  if (!s.transitionAllowed) denials.push("TRANSITION_NOT_ALLOWED");
  if (!s.preconditionAvailable) denials.push("PRECONDITION_UNAVAILABLE");
  if (s.productionWrites !== 0) denials.push("PRODUCTION_WRITES_NONZERO");
  return denials.length === 0 ? { ok: true } : { ok: false, denials };
}
