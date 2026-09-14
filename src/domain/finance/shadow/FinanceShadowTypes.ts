/**
 * Finance shadow validation types — READ/SHADOW only.
 * Policy codes FC-01..FC-05: FC-01 APPROVED 15% versioned; FC-02..05 APPROVED (F6).
 * Never invent rates/zeros.
 */

export const FINANCE_SHADOW_MISMATCH_CATEGORIES = [
  "LEGACY_DATA",
  "MISSING_AUTHORITATIVE_VALUE",
  "POLICY_UNRESOLVED",
  "MAPPING_ERROR",
  "CALCULATION_ERROR",
  "ROUNDING",
  "SETTLEMENT_CONFLICT",
  "COUNTRY_AGENT_CONFLICT",
  "UNKNOWN",
] as const;

export type FinanceShadowMismatchCategory =
  (typeof FINANCE_SHADOW_MISMATCH_CATEGORIES)[number];

/** User shadow validation policy codes (open blockers). */
export const FINANCE_SHADOW_POLICY_CODES = [
  "FC-01",
  "FC-02",
  "FC-03",
  "FC-04",
  "FC-05",
] as const;

export type FinanceShadowPolicyCode =
  (typeof FINANCE_SHADOW_POLICY_CODES)[number];

export type FinanceShadowOutcome =
  | "CLEAN"
  | "MISMATCH"
  | "MISSING_DATA"
  | "POLICY_BLOCKED";

export type FinanceShadowFinding = {
  /** Stable non-PII token (sha256 prefix of collection:docId). */
  recordToken: string;
  recordKind: "order" | "settlement" | "agent_scope" | "cross";
  /** Validation items 1–15 from Finance Shadow brief. */
  validationItem: number;
  outcome: FinanceShadowOutcome;
  category?: FinanceShadowMismatchCategory;
  policyCodes?: FinanceShadowPolicyCode[];
  code: string;
};

export type FinanceShadowItemStatus =
  | "PASS"
  | "FAIL"
  | "POLICY_BLOCKED"
  | "PARTIAL"
  | "N_A";

export type FinanceShadowAggregate = {
  overallStatus: "SHADOW_PASS" | "NO_GO" | "SKIPPED";
  projectId: string;
  mode: "offline_fixture" | "live_adc_readonly";
  recordsScanned: number;
  ordersScanned: number;
  settlementsScanned: number;
  deterministicRecordsValidated: number;
  cleanMatches: number;
  mismatches: number;
  missingData: number;
  policyBlocked: number;
  policyBlockedByFc: Record<FinanceShadowPolicyCode, number>;
  mismatchesByCategory: Record<FinanceShadowMismatchCategory, number>;
  currencyConflicts: number;
  settlementConflicts: number;
  agentAttributionConflicts: number;
  duplicateIdempotencyConflicts: number;
  piiViolations: number;
  productionWrites: 0;
  productionReads: number;
  financeWriteEnabled: false;
  countriesWithMultipleActiveAgents: number;
  implementationBugsFixed: string[];
  validationItems: Record<string, FinanceShadowItemStatus>;
  controlledFinanceRolloutPrep: "GO" | "NO-GO";
  blockers: string[];
  findingsSample: FinanceShadowFinding[];
};

export function emptyPolicyBlockedByFc(): Record<
  FinanceShadowPolicyCode,
  number
> {
  return {
    "FC-01": 0,
    "FC-02": 0,
    "FC-03": 0,
    "FC-04": 0,
    "FC-05": 0,
  };
}

export function emptyMismatchesByCategory(): Record<
  FinanceShadowMismatchCategory,
  number
> {
  return {
    LEGACY_DATA: 0,
    MISSING_AUTHORITATIVE_VALUE: 0,
    POLICY_UNRESOLVED: 0,
    MAPPING_ERROR: 0,
    CALCULATION_ERROR: 0,
    ROUNDING: 0,
    SETTLEMENT_CONFLICT: 0,
    COUNTRY_AGENT_CONFLICT: 0,
    UNKNOWN: 0,
  };
}

export function emptyValidationItems(): Record<
  string,
  FinanceShadowItemStatus
> {
  const out: Record<string, FinanceShadowItemStatus> = {};
  for (let i = 1; i <= 15; i += 1) out[`item_${i}`] = "N_A";
  return out;
}
