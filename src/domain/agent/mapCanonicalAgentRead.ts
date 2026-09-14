/**
 * Phase 4A-6 — map Legacy user/{id} (Isagent) → CanonicalAgentReadModel.
 *
 * Geography: Rev_dloh_agent → countries only.
 * Never invent country from dolh_agent name, GPS, phone, email, city, currency, language.
 * No agent_country_assignment N+1 — lock doc id derived from country id only.
 * No create / activate / disable / reassign / commission writes.
 */

import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  CanonicalAgentReadModel,
  AgentMappingStatus,
  Provenanced,
} from "@/domain/canonical/CanonicalReadModels";
import { mapAgentOperationalActiveState } from "@/domain/agent/AgentActiveSemantics";
import { summarizeAgentFinancialPresence } from "@/domain/agent/AgentFinancialFieldNotes";
import { isTestOrNoncanonicalAgent } from "@/domain/agent/AgentDuplicateIdentityAudit";
import { classifyAgentMembership } from "@/domain/agent/AgentRoleClassification";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";

function proven<T>(
  value: T | null,
  source: {
    collection: string;
    documentId: string;
    field: string | null;
    sourceValue: unknown;
    confidence?: MappingConfidence;
    warnings?: string[];
  },
): Provenanced<T> {
  return {
    value,
    provenance: {
      sourceSystem: "legacy",
      sourceCollection: source.collection,
      sourceDocumentId: source.documentId,
      sourceField: source.field,
      sourceValue: source.sourceValue as T | null,
      mappingConfidence:
        source.confidence ?? (value == null ? "unknown" : "medium"),
      mappingVersion: LEGACY_MAPPING_VERSION,
      warnings: source.warnings ?? [],
      availabilityStatus: value == null ? "missing" : "available",
    },
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function refPath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object" && value && "path" in value) {
    const p = (value as { path?: unknown }).path;
    return typeof p === "string" && p.trim() ? p.trim() : null;
  }
  return null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function countryDocIdFromPath(pathOrId: string | null): string | null {
  if (!pathOrId) return null;
  const p = pathOrId.replace(/^\/+/, "");
  if (p.startsWith("countries/")) return p.slice("countries/".length) || null;
  return extractLegacyDocRefId(pathOrId) ?? (p.length ? p : null);
}

export type MapCanonicalAgentInput = {
  documentId: string;
  data: Record<string, unknown>;
  now?: Date;
};

export type MapCanonicalAgentResult = {
  model: CanonicalAgentReadModel;
  mappingWarnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
};

export function mapCanonicalAgentFromLegacyDoc(
  input: MapCanonicalAgentInput,
): MapCanonicalAgentResult {
  const docId = input.documentId?.trim() ?? "";
  const data = input.data ?? {};
  const now = input.now ?? new Date();
  const warnings: MappingWarning[] = [];
  const incompleteReasons: string[] = [];

  if (!docId) {
    incompleteReasons.push("missing_document_id");
  }

  const membership = classifyAgentMembership(data);
  if (!membership.isAgentCandidate) {
    incompleteReasons.push("not_agent_discriminator");
  }
  if (membership.discriminatorField === "isagent") {
    warnings.push({
      code: "agent_discriminator_isagent",
      field: "isagent",
      message:
        "Agent matched via lowercase isagent alias — primary Admin/Functions list uses Isagent==true",
      severity: "warning",
    });
  }
  if (membership.isContaminatingNonAgentIdentity) {
    warnings.push({
      code: "agent_role_contamination",
      field: membership.roleEvidenceKind,
      message: `Non-agent administrative identity ${membership.authoritativeRole} excluded from Agent domain`,
      severity: "info",
    });
  }

  const active = mapAgentOperationalActiveState(data, now);

  // Identity: sourceDocumentId vs authUid
  const uidField = str(data.uid);
  const authUid: string | null = uidField;
  let authUidKnowledge: CanonicalAgentReadModel["authUidKnowledge"] = "missing";
  if (uidField) {
    if (uidField === docId) {
      authUidKnowledge = "known";
    } else {
      authUidKnowledge = "mismatch";
      warnings.push({
        code: "auth_uid_mismatch",
        field: "uid",
        message: "uid field differs from Firestore document id",
        severity: "warning",
      });
    }
  } else if (Object.prototype.hasOwnProperty.call(data, "uid")) {
    authUidKnowledge = "unknown";
  } else {
    authUidKnowledge = "missing";
  }

  // Geography — Rev_dloh_agent ONLY
  const rawCountryId = extractLegacyDocRefId(data.Rev_dloh_agent);
  const sourceCountryPath = refPath(data.Rev_dloh_agent);
  let countryId: string | null = null;
  let countryConfidence: MappingConfidence = "unknown";
  if (!rawCountryId) {
    incompleteReasons.push("countryId_missing");
  } else {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    if (resolved.status === "mapped" && resolved.canonicalCountryId) {
      countryId = resolved.canonicalCountryId;
      countryConfidence = resolved.confidence;
    } else {
      incompleteReasons.push("countryId_unmapped");
      countryId = rawCountryId;
      countryConfidence = "low";
    }
  }

  // Never invent from name / GPS / phone / currency / language / city
  if (
    !rawCountryId &&
    (data.dolh_agent != null ||
      data.agent_geo_center != null ||
      data.agent_country_iso != null ||
      data.agent_currency_code != null ||
      data.phone_number != null)
  ) {
    warnings.push({
      code: "geo_not_inferred_from_non_ref",
      field: "Rev_dloh_agent",
      message:
        "Country name/GPS/phone/currency present but country not invented — Rev_dloh_agent required",
      severity: "info",
    });
  }

  const lockCountryDocId = countryDocIdFromPath(
    sourceCountryPath ?? (countryId ? `countries/${countryId}` : null),
  );
  const assignmentLockDocId = lockCountryDocId;

  const financial = summarizeAgentFinancialPresence(data);
  const displayName = str(data.display_name ?? data.displayName ?? data.name);

  let mappingStatus: AgentMappingStatus = "validMapped";
  if (!docId) {
    mappingStatus = "malformed";
  } else if (!membership.isAgentCandidate) {
    mappingStatus = "unknownDiscriminator";
  } else if (membership.isContaminatingNonAgentIdentity) {
    mappingStatus = "excludedNonAgent";
  } else if (
    isTestOrNoncanonicalAgent({
      documentId: docId,
      data,
      countryId: rawCountryId,
    })
  ) {
    mappingStatus = "testOrNoncanonical";
  } else if (!membership.hasProvenAgentRoleEvidence) {
    mappingStatus = "malformed";
    incompleteReasons.push("missing_proven_agent_role_evidence");
  } else if (!rawCountryId || incompleteReasons.includes("countryId_unmapped")) {
    mappingStatus = "unmappedCountry";
  } else {
    mappingStatus = "validMapped";
  }

  const mappingConfidence: MappingConfidence =
    mappingStatus === "validMapped" && incompleteReasons.length === 0
      ? "high"
      : mappingStatus === "validMapped"
        ? "medium"
        : "low";

  const model: CanonicalAgentReadModel = {
    id: docId,
    canonicalAgentId: docId,
    sourceDocumentId: docId,
    authUid,
    authUidKnowledge,
    legacyCollection: "user",
    source: "legacy_user_agent",
    isAgent: proven(membership.isOperationalAgent, {
      collection: "user",
      documentId: docId,
      field: membership.discriminatorField === "unknown"
        ? "Isagent"
        : membership.discriminatorField,
      sourceValue:
        data.Isagent ?? data.isagent ?? null,
      confidence: membership.isOperationalAgent ? "high" : "low",
    }),
    isAgentCandidate: membership.isAgentCandidate,
    isOperationalAgent: membership.isOperationalAgent,
    discriminatorField: membership.discriminatorField,
    authoritativeRole: membership.authoritativeRole,
    roleEvidenceKind: membership.isContaminatingNonAgentIdentity
      ? membership.roleEvidenceKind
      : membership.hasProvenAgentRoleEvidence
        ? membership.agentEvidenceKind
        : membership.roleEvidenceKind,
    hasCountryAdminPanelRule: membership.hasCountryAdminPanelRule,
    displayName: proven(displayName, {
      collection: "user",
      documentId: docId,
      field: "display_name",
      sourceValue: data.display_name ?? data.displayName ?? data.name ?? null,
    }),
    accountState: active.accountState,
    operationalActiveState: active.operationalActive,
    isOperationallyActive: active.isActive,
    authEnabledKnowledge: "not_queried",
    countryId: proven(countryId, {
      collection: "user",
      documentId: docId,
      field: "Rev_dloh_agent",
      sourceValue: sourceCountryPath,
      confidence: countryConfidence,
      warnings: rawCountryId
        ? []
        : [
            "Agent missing Rev_dloh_agent — not inventing from dolh_agent/GPS/phone/currency",
          ],
    }),
    countrySourcePath: sourceCountryPath,
    assignmentLockDocId: proven(assignmentLockDocId, {
      collection: "agent_country_assignment",
      documentId: assignmentLockDocId ?? "",
      field: null,
      sourceValue: assignmentLockDocId,
      confidence: assignmentLockDocId ? "medium" : "unknown",
      warnings: [
        "Derived lock doc id only — agent_country_assignment not fetched in list (no N+1)",
      ],
    }),
    agentTotalPercent: proven(num(data.Agent_total), {
      collection: "user",
      documentId: docId,
      field: "Agent_total",
      sourceValue: data.Agent_total ?? null,
      confidence: "medium",
      warnings: ["DOCUMENT_ONLY — not settlement-safe"],
    }),
    appCommissionPercentStored: proven(num(data.app_commission_percent), {
      collection: "user",
      documentId: docId,
      field: "app_commission_percent",
      sourceValue: data.app_commission_percent ?? null,
      confidence: "low",
      warnings: ["DOCUMENT_ONLY — not trip platform rate SoT"],
    }),
    vatPercentStored: proven(num(data.vat_percent), {
      collection: "user",
      documentId: docId,
      field: "vat_percent",
      sourceValue: data.vat_percent ?? null,
      confidence: "low",
      warnings: ["DOCUMENT_ONLY — not trip VAT SoT"],
    }),
    financial,
    activeFromUtc: iso(data.agent_date_reg),
    activeToUtc: iso(data.agent_date_end),
    createdAtUtc: iso(data.created_time),
    mappingStatus,
    incompleteReasons,
    mappingConfidence,
    mappingVersion: LEGACY_MAPPING_VERSION,
    statusWarnings: warnings.map((w) => w.message),
  };

  return { model, mappingWarnings: warnings, mappingConfidence };
}
