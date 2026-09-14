/**
 * Phase 4A-6 — safe live-window agent mapping diagnostics.
 * Never includes phone, email, GPS, city inference, currency, language,
 * Auth tokens, or raw commission settlement amounts beyond DOCUMENT_ONLY notes.
 */

import type {
  CanonicalAgentReadModel,
  AgentMappingStatus,
} from "@/domain/canonical/CanonicalReadModels";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { isTestOrNoncanonicalAgent } from "@/domain/agent/AgentDuplicateIdentityAudit";
import type {
  AuthoritativeAgentRole,
  AgentRoleEvidenceKind,
} from "@/domain/agent/AgentRoleClassification";

export type AgentTestClassification =
  | "operational"
  | "testOrNoncanonical"
  | "excludedNonAgent";

export type AgentCountryMappingDiag =
  | "mapped"
  | "unmapped"
  | "missing"
  | "testOrNoncanonical"
  | "excludedNonAgent"
  | "malformed"
  | "not_applicable";

export type AgentMappingDiagnostic = {
  sourceDocumentId: string;
  agentCandidate: boolean;
  authoritativeRole: AuthoritativeAgentRole | string;
  roleEvidenceKind: AgentRoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  sourceCountryReferenceId: string | null;
  isOperationallyActive: boolean;
  operationalActiveState: string;
  mappingStatus: AgentMappingStatus;
  testClassification: AgentTestClassification;
  countryMapping: AgentCountryMappingDiag;
};

export type AgentLiveClosingStats = {
  unmappedCountry: number;
  unknownDiscriminator: number;
  malformed: number;
  activeOperationalDuplicates: number;
  exactDocumentIdDuplicates: number;
  unexpectedCollections: number;
  productionWrites: number;
  excludedNonAgent: number;
  excludedNonAgentWithoutEvidence: number;
  countriesWithMultipleActiveAgents: number;
};

/** Closing gates for Agents live window — multi-active must fail close. */
export function agentLiveClosingGatesPass(
  stats: AgentLiveClosingStats,
): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.unknownDiscriminator === 0 &&
    stats.malformed === 0 &&
    stats.activeOperationalDuplicates === 0 &&
    stats.exactDocumentIdDuplicates === 0 &&
    stats.unexpectedCollections === 0 &&
    stats.productionWrites === 0 &&
    stats.excludedNonAgentWithoutEvidence === 0 &&
    stats.countriesWithMultipleActiveAgents === 0
  );
}

function refIdFromPathOrValue(
  pathOrId: string | null | undefined,
): string | null {
  if (pathOrId == null || !String(pathOrId).trim()) return null;
  const extracted = extractLegacyDocRefId(pathOrId);
  if (extracted) return extracted;
  const trimmed = String(pathOrId).trim();
  return trimmed.length ? trimmed : null;
}

export function assessAgentCountryMapping(input: {
  sourceCountryReferenceId: string | null;
  mappingStatus: AgentMappingStatus;
  testClassification: AgentTestClassification;
}): AgentCountryMappingDiag {
  if (input.mappingStatus === "excludedNonAgent") {
    return "excludedNonAgent";
  }
  if (input.mappingStatus === "malformed") {
    return "malformed";
  }
  if (input.testClassification === "testOrNoncanonical") {
    return "testOrNoncanonical";
  }
  if (!input.sourceCountryReferenceId) {
    return "missing";
  }
  if (
    input.mappingStatus === "unmappedCountry" ||
    resolveCanonicalCountryId(input.sourceCountryReferenceId).status !==
      "mapped"
  ) {
    return "unmapped";
  }
  return "mapped";
}

export function buildAgentMappingDiagnostic(input: {
  sourceDocumentId: string;
  agentCandidate: boolean;
  authoritativeRole: AuthoritativeAgentRole | string;
  roleEvidenceKind: AgentRoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  isOperationallyActive: boolean;
  operationalActiveState: string;
  mappingStatus: AgentMappingStatus;
  testClassification: AgentTestClassification;
}): AgentMappingDiagnostic {
  const sourceCountryReferenceId = refIdFromPathOrValue(
    input.sourceCountryReferencePath,
  );
  return {
    sourceDocumentId: input.sourceDocumentId,
    agentCandidate: input.agentCandidate,
    authoritativeRole: input.authoritativeRole,
    roleEvidenceKind: input.roleEvidenceKind,
    sourceCountryReferencePath: input.sourceCountryReferencePath,
    sourceCountryReferenceId,
    isOperationallyActive: input.isOperationallyActive,
    operationalActiveState: input.operationalActiveState,
    mappingStatus: input.mappingStatus,
    testClassification: input.testClassification,
    countryMapping: assessAgentCountryMapping({
      sourceCountryReferenceId,
      mappingStatus: input.mappingStatus,
      testClassification: input.testClassification,
    }),
  };
}

export function diagnosticFromCanonicalAgent(
  model: CanonicalAgentReadModel,
): AgentMappingDiagnostic {
  const testClassification: AgentTestClassification =
    model.mappingStatus === "testOrNoncanonical"
      ? "testOrNoncanonical"
      : model.mappingStatus === "excludedNonAgent"
        ? "excludedNonAgent"
        : "operational";
  return buildAgentMappingDiagnostic({
    sourceDocumentId: model.sourceDocumentId,
    agentCandidate: model.isAgentCandidate,
    authoritativeRole: model.authoritativeRole,
    roleEvidenceKind: model.roleEvidenceKind,
    sourceCountryReferencePath: model.countrySourcePath,
    isOperationallyActive: model.isOperationallyActive,
    operationalActiveState: model.operationalActiveState,
    mappingStatus: model.mappingStatus,
    testClassification,
  });
}

export function selectAgentDiagnosticsForLiveSummary(
  models: CanonicalAgentReadModel[],
): AgentMappingDiagnostic[] {
  const interesting = new Set<AgentMappingStatus>([
    "unmappedCountry",
    "malformed",
    "unknownDiscriminator",
    "testOrNoncanonical",
    "excludedNonAgent",
  ]);
  return models
    .filter((m) => interesting.has(m.mappingStatus))
    .map(diagnosticFromCanonicalAgent);
}

export function classifyAgentTestFromSource(input: {
  documentId: string;
  data: Record<string, unknown>;
  countryId?: string | null;
}): Exclude<AgentTestClassification, "excludedNonAgent"> {
  return isTestOrNoncanonicalAgent(input)
    ? "testOrNoncanonical"
    : "operational";
}

export function agentLiveReportHasSensitiveLeak(serialized: string): boolean {
  return (
    /firebasestorage\.googleapis\.com/i.test(serialized) ||
    /Bearer\s+\S+/i.test(serialized) ||
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(serialized) ||
    /BEGIN (RSA )?PRIVATE KEY/i.test(serialized) ||
    /\+966\d{8,}/.test(serialized) ||
    /phone_number/i.test(serialized) ||
    /agent_geo_center/i.test(serialized) ||
    /agent_bounds_/i.test(serialized)
  );
}

export function formatAgentMappingNoGoMessage(
  diagnostics: AgentMappingDiagnostic[],
): string {
  const parts = diagnostics
    .filter((d) =>
      [
        "unmappedCountry",
        "malformed",
        "unknownDiscriminator",
      ].includes(d.mappingStatus),
    )
    .map((d) => {
      const country =
        d.sourceCountryReferencePath ??
        (d.sourceCountryReferenceId
          ? `countries/${d.sourceCountryReferenceId}`
          : "(missing Rev_dloh_agent)");
      return `${d.sourceDocumentId} status=${d.mappingStatus} role=${d.authoritativeRole} country=${country} countryMapping=${d.countryMapping} active=${d.operationalActiveState} test=${d.testClassification}`;
    });
  return `NO-GO: agent mapping gate failed — ${parts.join("; ") || "blocking mapping stats"}`;
}

/** True when exclusion carries authoritative Firestore role evidence. */
export function excludedNonAgentHasAuthoritativeEvidence(
  d: Pick<
    AgentMappingDiagnostic,
    "mappingStatus" | "roleEvidenceKind" | "authoritativeRole"
  >,
): boolean {
  if (d.mappingStatus !== "excludedNonAgent") return false;
  if (d.roleEvidenceKind === "none") return false;
  return ["super_admin", "finance", "partner", "transport"].includes(
    String(d.authoritativeRole),
  );
}
