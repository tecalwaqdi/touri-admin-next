/**
 * Aggregate Finance shadow findings into safe summary (no PII).
 */

import type { FinanceShadowFinding } from "@/domain/finance/shadow/FinanceShadowTypes";
import {
  emptyMismatchesByCategory,
  emptyPolicyBlockedByFc,
  emptyValidationItems,
  type FinanceShadowAggregate,
  type FinanceShadowItemStatus,
  type FinanceShadowMismatchCategory,
  type FinanceShadowPolicyCode,
} from "@/domain/finance/shadow/FinanceShadowTypes";
import { isFinancePolicyApproved } from "@/domain/finance/v2/policies/FinancePolicyRegistry";
import { assertFinanceShadowReportSafe } from "@/domain/finance/shadow/financeShadowPii";

const IMPLEMENTATION_BUG_CATEGORIES: FinanceShadowMismatchCategory[] = [
  "MAPPING_ERROR",
  "CALCULATION_ERROR",
];

function tallyItemStatus(
  findings: FinanceShadowFinding[],
  item: number,
): FinanceShadowItemStatus {
  const subset = findings.filter((f) => f.validationItem === item);
  if (subset.length === 0) return "N_A";
  const hasFail = subset.some(
    (f) =>
      f.outcome === "MISMATCH" &&
      f.category != null &&
      IMPLEMENTATION_BUG_CATEGORIES.includes(f.category),
  );
  if (hasFail) return "FAIL";
  const hasMismatch = subset.some((f) => f.outcome === "MISMATCH");
  const hasPolicy = subset.some((f) => f.outcome === "POLICY_BLOCKED");
  const hasMissing = subset.some((f) => f.outcome === "MISSING_DATA");
  const hasClean = subset.some((f) => f.outcome === "CLEAN");
  if (hasMismatch && !hasFail) return "PARTIAL";
  if (hasPolicy && !hasClean && !hasMismatch) return "POLICY_BLOCKED";
  if (hasPolicy && hasClean) return "PARTIAL";
  if (hasMissing && !hasClean) return "PARTIAL";
  if (hasClean) return "PASS";
  return "PARTIAL";
}

export function aggregateFinanceShadowFindings(input: {
  projectId: string;
  mode: FinanceShadowAggregate["mode"];
  ordersScanned: number;
  settlementsScanned: number;
  productionReads: number;
  countriesWithMultipleActiveAgents: number;
  findings: FinanceShadowFinding[];
  implementationBugsFixed?: string[];
}): FinanceShadowAggregate {
  const findings = input.findings;
  const policyBlockedByFc = emptyPolicyBlockedByFc();
  const mismatchesByCategory = emptyMismatchesByCategory();

  let cleanMatches = 0;
  let mismatches = 0;
  let missingData = 0;
  let policyBlocked = 0;
  let currencyConflicts = 0;
  let settlementConflicts = 0;
  let agentAttributionConflicts = 0;
  let duplicateIdempotencyConflicts = 0;

  for (const f of findings) {
    if (f.outcome === "CLEAN") cleanMatches += 1;
    if (f.outcome === "MISMATCH") {
      mismatches += 1;
      if (f.category) mismatchesByCategory[f.category] += 1;
    }
    if (f.outcome === "MISSING_DATA") missingData += 1;
    if (f.outcome === "POLICY_BLOCKED") {
      policyBlocked += 1;
      for (const code of f.policyCodes ?? []) {
        policyBlockedByFc[code] += 1;
      }
      if (f.category === "POLICY_UNRESOLVED") {
        mismatchesByCategory.POLICY_UNRESOLVED += 1;
      }
    }
    if (
      f.code.includes("currency") &&
      (f.outcome === "MISMATCH" || f.outcome === "MISSING_DATA")
    ) {
      currencyConflicts += 1;
    }
    if (
      f.category === "SETTLEMENT_CONFLICT" ||
      f.code.includes("settlement")
    ) {
      if (f.outcome === "MISMATCH") settlementConflicts += 1;
    }
    if (
      f.category === "COUNTRY_AGENT_CONFLICT" ||
      (f.code.includes("agent") && f.outcome === "MISMATCH")
    ) {
      agentAttributionConflicts += 1;
    }
    if (f.validationItem === 11 && f.outcome === "MISMATCH") {
      duplicateIdempotencyConflicts += 1;
    }
  }

  const validationItems = emptyValidationItems();
  for (let i = 1; i <= 15; i += 1) {
    validationItems[`item_${i}`] = tallyItemStatus(findings, i);
  }
  // Item 15 = discrepancy classification present
  validationItems.item_15 =
    findings.some((f) => f.outcome === "MISMATCH" || f.outcome === "POLICY_BLOCKED")
      ? "PASS"
      : findings.length > 0
        ? "PASS"
        : "N_A";

  const implementationBugMismatches =
    mismatchesByCategory.MAPPING_ERROR + mismatchesByCategory.CALCULATION_ERROR;

  const recordsScanned = input.ordersScanned + input.settlementsScanned;
  const deterministicRecordsValidated = findings.filter(
    (f) => f.outcome === "CLEAN" || f.outcome === "MISMATCH",
  ).length;

  const blockers: string[] = [];
  if (implementationBugMismatches > 0) {
    blockers.push(
      `implementation_bug_mismatches=${implementationBugMismatches}`,
    );
  }
  for (const code of Object.keys(policyBlockedByFc) as FinanceShadowPolicyCode[]) {
    if (policyBlockedByFc[code] > 0) {
      blockers.push(`${code}_unresolved`);
    }
  }

  // FC-01..05 APPROVED → controlled rollout PREP may GO; write GO still separate.
  const prepReady =
    isFinancePolicyApproved("FC-01") &&
    isFinancePolicyApproved("FC-02") &&
    isFinancePolicyApproved("FC-03") &&
    isFinancePolicyApproved("FC-04") &&
    isFinancePolicyApproved("FC-05") &&
    implementationBugMismatches === 0;
  if (!prepReady) {
    blockers.push("f6_policy_prep_incomplete");
  }

  const overallStatus: FinanceShadowAggregate["overallStatus"] =
    implementationBugMismatches > 0 ? "NO_GO" : "SHADOW_PASS";

  const aggregate: FinanceShadowAggregate = {
    overallStatus,
    projectId: input.projectId,
    mode: input.mode,
    recordsScanned,
    ordersScanned: input.ordersScanned,
    settlementsScanned: input.settlementsScanned,
    deterministicRecordsValidated,
    cleanMatches,
    mismatches,
    missingData,
    policyBlocked,
    policyBlockedByFc,
    mismatchesByCategory,
    currencyConflicts,
    settlementConflicts,
    agentAttributionConflicts,
    duplicateIdempotencyConflicts,
    piiViolations: 0,
    productionWrites: 0,
    productionReads: input.productionReads,
    financeWriteEnabled: false,
    countriesWithMultipleActiveAgents: input.countriesWithMultipleActiveAgents,
    implementationBugsFixed: input.implementationBugsFixed ?? [],
    validationItems,
    controlledFinanceRolloutPrep: prepReady ? "GO" : "NO-GO",
    blockers: [...new Set(blockers)],
    findingsSample: findings.slice(0, 40),
  };

  const serialized = JSON.stringify(aggregate);
  const pii = assertFinanceShadowReportSafe(serialized);
  aggregate.piiViolations = pii.piiViolations;
  if (pii.piiViolations > 0) {
    aggregate.overallStatus = "NO_GO";
    aggregate.blockers.push("pii_in_report");
  }

  return aggregate;
}
