/**
 * PC-10 commercial KPI policy for Production dashboards.
 *
 * Rules (authoritative):
 * 1. Exclude pilot/test rows from commercial KPI interpretation ONLY with
 *    reliable domain/mapping evidence — never prefix-only silent drops.
 * 2. When evidence is uncertain → KEEP the row and surface DQ / pilot notice.
 * 3. Never delete or mutate Production data for hygiene.
 * 4. Bounded samples remain labeled bounded (PC-1) — never exact totals.
 */

import {
  classifyProductionRecord,
  isUnsafePrefixOnlyExclusion,
  sampleIncludesPilotOrTest,
  type RecordClass,
  type RecordClassification,
} from "@/domain/production-read/RecordClassification";

export type CommercialKpiRowDecision =
  | "include_operational"
  | "include_with_pilot_notice"
  | "include_uncertain_with_dq_notice"
  | "exclude_with_reliable_evidence";

export type CommercialKpiPolicyDecision = {
  decision: CommercialKpiRowDecision;
  recordClass: RecordClass;
  classification: RecordClassification;
  /** True when commercial dashboards must show pilot/DQ honesty chrome. */
  requiresOperatorNotice: boolean;
  rationale: string;
};

/**
 * Decide how a single Production sample row participates in commercial KPIs.
 * Default bias: keep + notice when uncertain; never prefix-only exclude.
 */
export function decideCommercialKpiRow(input: {
  id: string | null | undefined;
  mappingStatus?: string | null;
  domainTestOrNoncanonical?: boolean;
}): CommercialKpiPolicyDecision {
  const classification = classifyProductionRecord(input);
  const { recordClass, evidence, usedContractualIdMarker } = classification;

  if (recordClass === "operational") {
    return {
      decision: "include_operational",
      recordClass,
      classification,
      requiresOperatorNotice: false,
      rationale: "No pilot/test evidence — include in commercial sample.",
    };
  }

  if (recordClass === "unknown") {
    return {
      decision: "include_uncertain_with_dq_notice",
      recordClass,
      classification,
      requiresOperatorNotice: true,
      rationale:
        "Uncertain classification — keep row and show DQ/pilot honesty notice.",
    };
  }

  // pilot | test
  const hasDomainOrMappingEvidence =
    evidence === "mapping_status_testOrNoncanonical" ||
    evidence === "domain_test_marker";

  if (
    isUnsafePrefixOnlyExclusion({
      usedOnlyIdPrefix: usedContractualIdMarker && !hasDomainOrMappingEvidence,
      hasDomainOrMappingEvidence,
    })
  ) {
    // Contractual ID markers alone are labeling-safe but NOT silent commercial exclusion.
    return {
      decision: "include_with_pilot_notice",
      recordClass,
      classification,
      requiresOperatorNotice: true,
      rationale:
        "Prefix/ID marker only — keep in sample; show pilot notice (no silent exclude).",
    };
  }

  if (hasDomainOrMappingEvidence) {
    return {
      decision: "exclude_with_reliable_evidence",
      recordClass,
      classification,
      requiresOperatorNotice: true,
      rationale:
        "Reliable domain/mapping evidence — eligible for commercial exclusion; notice still required on sample.",
    };
  }

  return {
    decision: "include_with_pilot_notice",
    recordClass,
    classification,
    requiresOperatorNotice: true,
    rationale: "Pilot/test class without stronger evidence — keep + notice.",
  };
}

/** Aggregate sample honesty for dashboard responses. */
export function commercialSampleRequiresPilotNotice(
  rows: Array<{
    id: string | null | undefined;
    mappingStatus?: string | null;
    domainTestOrNoncanonical?: boolean;
  }>,
): boolean {
  if (sampleIncludesPilotOrTest(rows)) return true;
  return rows.some((r) => decideCommercialKpiRow(r).requiresOperatorNotice);
}

/** PC-10 posture: Production must not silently drop prefix-only matches. */
export const COMMERCIAL_KPI_POLICY = {
  allowPrefixOnlySilentExclusion: false as const,
  uncertainBehavior: "keep_with_dq_or_pilot_notice" as const,
  productionDeletionAllowed: false as const,
  pilotExecutedInPc10: false as const,
} as const;
