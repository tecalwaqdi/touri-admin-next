/**
 * Phase 4A-6 — Agent duplicate / identity audit + one-country-one-active diagnostics.
 * Never expose phone/email — hashed fingerprint only when auditing collisions.
 * NO auto-select / disable / merge of multi-active agents.
 */

import { createHash } from "node:crypto";
import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import { COUNTRY_CANONICAL_TABLE } from "@/domain/geography/CountryCanonicalization";

export type AgentIdentityRow = {
  sourceDocumentId: string;
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  countryId: string | null;
  isOperationallyActive: boolean;
  mappingStatus: string;
  /** SHA-256 of digits-only phone — never raw phone. */
  phoneHash: string | null;
  testOrNoncanonical?: boolean;
  unmappedCountry?: boolean;
  unknownDiscriminator?: boolean;
  excludedNonAgent?: boolean;
  malformed?: boolean;
  isAgentCandidate?: boolean;
  isOperationalAgent?: boolean;
};

export type AgentDuplicateAuditMetrics = {
  recordsRead: number;
  agentCandidates: number;
  total: number;
  validMapped: number;
  testOrNoncanonical: number;
  excludedNonAgent: number;
  unmappedCountry: number;
  malformed: number;
  exactDocumentIdDuplicates: number;
  activeOperationalDuplicates: number;
  authUidCollisions: number;
  phoneHashCollisions: number;
  unknownDiscriminator: number;
  missingAuthUid: number;
  authUidMismatch: number;
  unexpectedCollections: number;
  /** CRITICAL BUSINESS RULE diagnostics */
  activeAgentsPerCountry: Record<string, number>;
  countriesWithNoAgent: string[];
  countriesWithOneActiveAgent: string[];
  countriesWithMultipleActiveAgents: string[];
};

export function hashAgentPhoneForAudit(
  phone: string | number | null | undefined,
): string | null {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 6) return null;
  return createHash("sha256").update(`agt-phone:${digits}`).digest("hex");
}

export function emptyAgentDuplicateMetrics(): AgentDuplicateAuditMetrics {
  return {
    recordsRead: 0,
    agentCandidates: 0,
    total: 0,
    validMapped: 0,
    testOrNoncanonical: 0,
    excludedNonAgent: 0,
    unmappedCountry: 0,
    malformed: 0,
    exactDocumentIdDuplicates: 0,
    activeOperationalDuplicates: 0,
    authUidCollisions: 0,
    phoneHashCollisions: 0,
    unknownDiscriminator: 0,
    missingAuthUid: 0,
    authUidMismatch: 0,
    unexpectedCollections: 0,
    activeAgentsPerCountry: {},
    countriesWithNoAgent: [],
    countriesWithOneActiveAgent: [],
    countriesWithMultipleActiveAgents: [],
  };
}

function countCollisions(keys: Array<string | null>): number {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let collisions = 0;
  for (const n of counts.values()) {
    if (n > 1) collisions += n;
  }
  return collisions;
}

/**
 * Partition counts must reconcile:
 * recordsRead = validMapped + testOrNoncanonical + excludedNonAgent +
 *   unmappedCountry + malformed + unknownDiscriminator
 */
export function reconcileAgentAuditPartition(
  metrics: AgentDuplicateAuditMetrics,
): {
  ok: boolean;
  partitionedSum: number;
  recordsRead: number;
} {
  const partitionedSum =
    metrics.validMapped +
    metrics.testOrNoncanonical +
    metrics.excludedNonAgent +
    metrics.unmappedCountry +
    metrics.malformed +
    metrics.unknownDiscriminator;
  return {
    ok: partitionedSum === metrics.recordsRead,
    partitionedSum,
    recordsRead: metrics.recordsRead,
  };
}

/**
 * ONE COUNTRY = ONE ACTIVE AGENT diagnostics.
 * Never auto-selects / disables / merges — report only.
 */
export function buildActiveAgentCountryDiagnostics(
  rows: AgentIdentityRow[],
  knownCountryIds?: readonly string[],
): {
  activeAgentsPerCountry: Record<string, number>;
  countriesWithNoAgent: string[];
  countriesWithOneActiveAgent: string[];
  countriesWithMultipleActiveAgents: string[];
} {
  const activeAgentsPerCountry: Record<string, number> = {};
  for (const r of rows) {
    if (!r.isOperationallyActive) continue;
    if (!r.countryId) continue;
    // Only count operational Agent domain rows (not contamination).
    if (r.excludedNonAgent) continue;
    if (r.mappingStatus === "excludedNonAgent") continue;
    if (r.testOrNoncanonical || r.mappingStatus === "testOrNoncanonical") {
      continue;
    }
    activeAgentsPerCountry[r.countryId] =
      (activeAgentsPerCountry[r.countryId] ?? 0) + 1;
  }

  const catalog =
    knownCountryIds ??
    [
      ...new Set(
        COUNTRY_CANONICAL_TABLE.map((r) => r.canonicalCountryId),
      ),
    ];

  const countriesWithNoAgent: string[] = [];
  const countriesWithOneActiveAgent: string[] = [];
  const countriesWithMultipleActiveAgents: string[] = [];

  const seen = new Set<string>();
  for (const id of catalog) {
    seen.add(id);
    const n = activeAgentsPerCountry[id] ?? 0;
    if (n === 0) countriesWithNoAgent.push(id);
    else if (n === 1) countriesWithOneActiveAgent.push(id);
    else countriesWithMultipleActiveAgents.push(id);
  }
  // Countries present in data but not in catalog still counted for multi-active.
  for (const [id, n] of Object.entries(activeAgentsPerCountry)) {
    if (seen.has(id)) continue;
    if (n === 1) countriesWithOneActiveAgent.push(id);
    else if (n > 1) countriesWithMultipleActiveAgents.push(id);
  }

  return {
    activeAgentsPerCountry,
    countriesWithNoAgent,
    countriesWithOneActiveAgent,
    countriesWithMultipleActiveAgents,
  };
}

export function auditAgentDuplicates(
  rows: AgentIdentityRow[],
  options?: {
    unexpectedCollections?: number;
    knownCountryIds?: readonly string[];
  },
): AgentDuplicateAuditMetrics {
  const metrics = emptyAgentDuplicateMetrics();
  metrics.recordsRead = rows.length;
  metrics.total = rows.length;
  metrics.unexpectedCollections = options?.unexpectedCollections ?? 0;

  const docIds = rows.map((r) => r.sourceDocumentId);
  const docCounts = new Map<string, number>();
  for (const id of docIds) {
    docCounts.set(id, (docCounts.get(id) ?? 0) + 1);
  }
  for (const n of docCounts.values()) {
    if (n > 1) metrics.exactDocumentIdDuplicates += n;
  }

  metrics.authUidCollisions = countCollisions(
    rows.map((r) => (r.authUid ? r.authUid : null)),
  );
  metrics.phoneHashCollisions = countCollisions(rows.map((r) => r.phoneHash));

  const operational = rows.filter(
    (r) =>
      r.isOperationalAgent === true ||
      r.mappingStatus === "validMapped" ||
      r.mappingStatus === "unmappedCountry",
  );
  metrics.activeOperationalDuplicates = countCollisions(
    operational.map((r) => (r.authUid ? r.authUid : null)),
  );

  for (const r of rows) {
    if (r.isAgentCandidate !== false) metrics.agentCandidates += 1;
    if (r.mappingStatus === "validMapped") metrics.validMapped += 1;
    if (r.testOrNoncanonical || r.mappingStatus === "testOrNoncanonical") {
      metrics.testOrNoncanonical += 1;
    }
    if (r.excludedNonAgent || r.mappingStatus === "excludedNonAgent") {
      metrics.excludedNonAgent += 1;
    }
    if (r.unmappedCountry || r.mappingStatus === "unmappedCountry") {
      metrics.unmappedCountry += 1;
    }
    if (r.malformed || r.mappingStatus === "malformed") {
      metrics.malformed += 1;
    }
    if (
      r.unknownDiscriminator ||
      r.mappingStatus === "unknownDiscriminator"
    ) {
      metrics.unknownDiscriminator += 1;
    }
    if (r.authUidKnowledge === "missing") metrics.missingAuthUid += 1;
    if (r.authUidKnowledge === "mismatch") metrics.authUidMismatch += 1;
  }

  const countryDiag = buildActiveAgentCountryDiagnostics(
    rows,
    options?.knownCountryIds,
  );
  metrics.activeAgentsPerCountry = countryDiag.activeAgentsPerCountry;
  metrics.countriesWithNoAgent = countryDiag.countriesWithNoAgent;
  metrics.countriesWithOneActiveAgent =
    countryDiag.countriesWithOneActiveAgent;
  metrics.countriesWithMultipleActiveAgents =
    countryDiag.countriesWithMultipleActiveAgents;

  return metrics;
}

export function agentMappingReadyForLiveClose(
  metrics: AgentDuplicateAuditMetrics,
  options?: { excludedNonAgentWithoutEvidence?: number },
): boolean {
  return (
    metrics.exactDocumentIdDuplicates === 0 &&
    metrics.unknownDiscriminator === 0 &&
    metrics.unmappedCountry === 0 &&
    metrics.malformed === 0 &&
    metrics.activeOperationalDuplicates === 0 &&
    metrics.unexpectedCollections === 0 &&
    metrics.countriesWithMultipleActiveAgents.length === 0 &&
    (options?.excludedNonAgentWithoutEvidence ?? 0) === 0
  );
}

export function rowFromCanonicalAgent(
  model: CanonicalAgentReadModel,
  extras?: {
    phoneHash?: string | null;
    unknownDiscriminator?: boolean;
  },
): AgentIdentityRow {
  return {
    sourceDocumentId: model.sourceDocumentId,
    authUid: model.authUid,
    authUidKnowledge: model.authUidKnowledge,
    countryId: model.countryId.value,
    isOperationallyActive: model.isOperationallyActive,
    mappingStatus: model.mappingStatus,
    phoneHash: extras?.phoneHash ?? null,
    testOrNoncanonical: model.mappingStatus === "testOrNoncanonical",
    unmappedCountry: model.mappingStatus === "unmappedCountry",
    unknownDiscriminator:
      extras?.unknownDiscriminator ??
      model.mappingStatus === "unknownDiscriminator",
    excludedNonAgent: model.mappingStatus === "excludedNonAgent",
    malformed: model.mappingStatus === "malformed",
    isAgentCandidate: model.isAgentCandidate,
    isOperationalAgent: model.isOperationalAgent,
  };
}

/** Test/demo markers — never delete; classify only. Evidence required. */
export function isTestOrNoncanonicalAgent(input: {
  documentId: string;
  data: Record<string, unknown>;
  countryId?: string | null;
}): boolean {
  const id = input.documentId.toLowerCase();
  if (/^cp5_|^test_|^demo_|^golden_|^qa_/.test(id)) return true;
  if (input.countryId && /^cp5_country_/.test(input.countryId)) return true;
  const markers = [
    input.data.functional_test,
    input.data.is_test,
    input.data.demo,
    input.data.qa_fixture,
  ];
  if (markers.some((m) => m === true || m === "true")) return true;
  const name = String(
    input.data.display_name ?? input.data.email ?? "",
  ).toLowerCase();
  if (name.includes("functional test") || name.includes("@touri-taxi-test")) {
    return true;
  }
  return false;
}
