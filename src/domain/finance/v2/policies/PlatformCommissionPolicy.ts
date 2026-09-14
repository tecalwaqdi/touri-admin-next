/**
 * FC-01 — Platform commission rate.
 * Status: APPROVED at 15% official Touri Taxi platform/company commission.
 * Rate lives ONLY in this versioned Finance policy/config — never scatter 15%
 * literals into UI or business logic.
 *
 * - New eligible calculations: resolve from approved version effective as-of date.
 * - Historical authoritative records: persisted amounts remain SoT (no re-rate).
 * - Future rate changes: new policy version + explicit effectiveFrom.
 * - Missing / unapproved config → FINANCE_POLICY_UNRESOLVED_FC01 (fail closed).
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import { createDraftFinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import {
  FinancePolicyUnresolvedFc01Error,
  type FinancePolicyLockStatus,
} from "@/domain/finance/v2/policies/FinancePolicyCodes";

export type PlatformCommissionPolicy = FinancialPolicy & {
  kind: "platform_commission";
  /** Explicit rate percent when configured+approved; never invent 0 or 15. */
  ratePercent: number | null;
  rateSource: "versioned_config" | "legacy_evidence_only";
};

/**
 * Observed CF hardcode — historical evidence that was promoted into the
 * approved versioned config below. Not a callable rate source for calcs.
 */
export const LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE = {
  ratePercent: 15 as const,
  status: "proven_legacy_behavior" as const,
  productionApproved: false as const,
  promotedToPolicyId: "PLATFORM_COMMISSION_RATE_FC01" as const,
  promotedToVersion: "1.0.0-fc01-approved-15" as const,
  notes:
    "CF hardcoded ~15% of base = proven_legacy_behavior. Promoted to PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT versioned config. Do not read this constant as a rate in business logic.",
};

/**
 * Sentinel for "no approved config present" — fail-closed paths.
 * ratePercent stays null; never use as Production rate.
 */
export const PLATFORM_COMMISSION_POLICY_CONFIG_REQUIRED: PlatformCommissionPolicy =
  {
    ...createDraftFinancialPolicy({
      policyId: "PLATFORM_COMMISSION_RATE_FC01_UNRESOLVED",
      version: "0.0.0-config-required",
      notes:
        "FC-01 fail-closed sentinel when no approved versioned config is bound. Never default to 0 or 15.",
    }),
    kind: "platform_commission",
    ratePercent: null,
    rateSource: "versioned_config",
    productionApproved: false,
    status: "draft",
  };

/**
 * FC-01 APPROVED — official Touri Taxi platform/company commission = 15%.
 * Sourced from legacy evidence into this single versioned config.
 * productionApproved=true → rate may resolve for NEW eligible calculations.
 * Production Finance *writes* remain gated by FINANCE_WRITE_ENABLED separately.
 */
export const PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT: PlatformCommissionPolicy =
  {
    policyId: "PLATFORM_COMMISSION_RATE_FC01",
    version: "1.0.0-fc01-approved-15",
    status: "approved",
    effectiveFrom: "2026-09-13T00:00:00.000Z",
    effectiveTo: null,
    countryId: null,
    currencyCode: null,
    createdAtUtc: "2026-09-13T00:00:00.000Z",
    approvedAtUtc: "2026-09-13T21:00:00.000Z",
    approvedBy: "fc01_human_policy_closure",
    productionApproved: true,
    notes:
      "FC-01 APPROVED: official Touri Taxi platform/company commission rate = 15%. Versioned configurable Finance policy. Effective for new eligible calculations from effectiveFrom. Does NOT retroactively recalculate historical authoritative records. Future rate changes require a new policy version with explicit effectiveFrom. Legacy CF 15% evidence promoted into this config — do not hardcode 15 in UI/logic.",
    kind: "platform_commission",
    ratePercent: LEGACY_PLATFORM_COMMISSION_15_PERCENT_EVIDENCE.ratePercent,
    rateSource: "versioned_config",
  };

export const FC01_LOCK_STATUS: FinancePolicyLockStatus = "APPROVED";

export const FC01_APPROVED_RATE_PERCENT =
  PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.ratePercent!;

/**
 * Offline fixture for tests that need an explicit approved rate other than
 * the locked Production config. productionApproved stays false.
 */
export function createOfflineApprovedCommissionRateFixture(input: {
  ratePercent: number;
  countryId?: string | null;
  currencyCode?: string | null;
  version?: string;
}): PlatformCommissionPolicy {
  if (!Number.isFinite(input.ratePercent) || input.ratePercent <= 0) {
    throw new FinancePolicyUnresolvedFc01Error("fixture_rate_invalid");
  }
  return {
    ...createDraftFinancialPolicy({
      policyId: "PLATFORM_COMMISSION_RATE_FC01_OFFLINE_FIXTURE",
      version: input.version ?? "fixture-1.0.0",
      countryId: input.countryId ?? null,
      currencyCode: input.currencyCode ?? null,
      notes:
        "Offline Fake fixture only — explicit rate for tests. Not the locked FC-01 Production config. FINANCE_WRITE_ENABLED remains false.",
    }),
    kind: "platform_commission",
    ratePercent: input.ratePercent,
    rateSource: "versioned_config",
    status: "approved",
    approvedAtUtc: "2026-09-13T00:00:00.000Z",
    approvedBy: "offline_fixture",
    productionApproved: false,
  };
}

/**
 * Active approved platform commission policy as-of a UTC instant.
 * Returns null when no approved version covers the instant (fail closed).
 */
export function resolveActivePlatformCommissionPolicy(input?: {
  asOfUtc?: string;
  policy?: PlatformCommissionPolicy | null;
}): PlatformCommissionPolicy | null {
  const policy =
    input?.policy === undefined
      ? PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT
      : input.policy;
  if (!policy) return null;
  if (policy.status !== "approved") return null;
  if (policy.ratePercent === null || policy.ratePercent === undefined) {
    return null;
  }
  if (policy.productionApproved !== true) return null;

  const asOf = Date.parse(input?.asOfUtc ?? new Date().toISOString());
  const from = Date.parse(policy.effectiveFrom);
  if (!Number.isFinite(asOf) || !Number.isFinite(from) || asOf < from) {
    return null;
  }
  if (policy.effectiveTo) {
    const to = Date.parse(policy.effectiveTo);
    if (Number.isFinite(to) && asOf >= to) return null;
  }
  return policy;
}

/**
 * Resolve rate for NEW / projected calculation only.
 * Missing/unapproved → FINANCE_POLICY_UNRESOLVED_FC01.
 * Never returns 0 or invents 15 outside an approved versioned config.
 */
export function requireApprovedPlatformCommissionRate(
  policy: PlatformCommissionPolicy | null | undefined,
  opts?: { allowOfflineFixture?: boolean; asOfUtc?: string },
): number {
  if (!policy) {
    throw new FinancePolicyUnresolvedFc01Error("policy_missing");
  }
  if (policy.ratePercent === null || policy.ratePercent === undefined) {
    throw new FinancePolicyUnresolvedFc01Error("rate_missing");
  }
  if (!Number.isFinite(policy.ratePercent)) {
    throw new FinancePolicyUnresolvedFc01Error("rate_not_finite");
  }
  if (policy.ratePercent === 0) {
    throw new FinancePolicyUnresolvedFc01Error("rate_zero_forbidden");
  }
  if (policy.status !== "approved") {
    throw new FinancePolicyUnresolvedFc01Error(`status_${policy.status}`);
  }
  if (policy.productionApproved !== true) {
    if (opts?.allowOfflineFixture === true && policy.productionApproved === false) {
      return policy.ratePercent;
    }
    throw new FinancePolicyUnresolvedFc01Error("production_not_approved");
  }

  const active = resolveActivePlatformCommissionPolicy({
    policy,
    asOfUtc: opts?.asOfUtc,
  });
  if (!active) {
    throw new FinancePolicyUnresolvedFc01Error("not_effective_as_of");
  }
  return active.ratePercent!;
}

/**
 * Convenience: resolve the locked FC-01 approved rate for new calcs.
 * Still fail-closed if registry/policy binding is removed.
 */
export function requireFc01ApprovedPlatformCommissionRate(opts?: {
  asOfUtc?: string;
}): number {
  return requireApprovedPlatformCommissionRate(
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT,
    { asOfUtc: opts?.asOfUtc },
  );
}

/** Historical path: use persisted amount only — never re-rate with policy %. */
export function historicalPlatformCommissionAmountOnly(): {
  ratePercent: null;
  usesPersistedAmount: true;
  fc01Status: typeof FC01_LOCK_STATUS;
  historicalReRateForbidden: true;
} {
  return {
    ratePercent: null,
    usesPersistedAmount: true,
    fc01Status: FC01_LOCK_STATUS,
    historicalReRateForbidden: true,
  };
}
