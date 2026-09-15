/**
 * Read-model record classification for pilot/test hygiene.
 * Classification only — never deletes or mutates Production data.
 *
 * Contractual markers (do NOT invent prefix-only commercial exclusion):
 * - SourceLabel.looksLikePilotOrTestDocumentId (test_/pilot_/frN_)
 * - Domain isTestOrNoncanonical* helpers (cp5_/demo_/golden_/qa_ + flags/email)
 * - Canonical mappingStatus === "testOrNoncanonical"
 * - Finance FR pilot chain IDs via looksLikePilotOrTestDocumentId
 */

import { looksLikePilotOrTestDocumentId } from "@/domain/production-read/SourceLabel";

export type RecordClass = "operational" | "pilot" | "test" | "unknown";

export type RecordClassificationEvidence =
  | "contractual_pilot_id"
  | "mapping_status_testOrNoncanonical"
  | "domain_test_marker"
  | "none";

export type RecordClassification = {
  recordClass: RecordClass;
  evidence: RecordClassificationEvidence;
  /** True when classification used only a contractual ID pattern (SourceLabel). */
  usedContractualIdMarker: boolean;
};

/**
 * Classify a Production read-model row.
 * Prefer mappingStatus / domain flags when present; ID markers only when contractual.
 */
export function classifyProductionRecord(input: {
  id: string | null | undefined;
  mappingStatus?: string | null;
  /** Result of isTestOrNoncanonical* when raw doc evidence was available. */
  domainTestOrNoncanonical?: boolean;
}): RecordClassification {
  if (input.mappingStatus === "testOrNoncanonical") {
    return {
      recordClass: "test",
      evidence: "mapping_status_testOrNoncanonical",
      usedContractualIdMarker: false,
    };
  }
  if (input.domainTestOrNoncanonical === true) {
    return {
      recordClass: "test",
      evidence: "domain_test_marker",
      usedContractualIdMarker: false,
    };
  }
  if (looksLikePilotOrTestDocumentId(input.id)) {
    // Contractual SourceLabel pilot/test ID regex — safe for labeling, not for silent exclusion alone.
    const id = String(input.id ?? "").toLowerCase();
    const isPilot =
      /(?:^|_)(?:pilot_|fr[1-7]_)/i.test(id) ||
      id.includes("test_adminnext_");
    return {
      recordClass: isPilot ? "pilot" : "test",
      evidence: "contractual_pilot_id",
      usedContractualIdMarker: true,
    };
  }
  if (input.mappingStatus == null && input.domainTestOrNoncanonical == null) {
    return {
      recordClass: "unknown",
      evidence: "none",
      usedContractualIdMarker: false,
    };
  }
  return {
    recordClass: "operational",
    evidence: "none",
    usedContractualIdMarker: false,
  };
}

/** True when any classified row is pilot/test (or unknown markers present via contractual IDs). */
export function sampleIncludesPilotOrTest(
  rows: Array<{
    id: string | null | undefined;
    mappingStatus?: string | null;
    domainTestOrNoncanonical?: boolean;
  }>,
): boolean {
  return rows.some((r) => {
    const c = classifyProductionRecord(r);
    return c.recordClass === "pilot" || c.recordClass === "test";
  });
}

/**
 * Unsafe commercial exclusion guard — prefix-only filtering without domain/mapping
 * evidence must not be used to silently drop KPI rows.
 */
export function isUnsafePrefixOnlyExclusion(input: {
  usedOnlyIdPrefix: boolean;
  hasDomainOrMappingEvidence: boolean;
}): boolean {
  return input.usedOnlyIdPrefix && !input.hasDomainOrMappingEvidence;
}
