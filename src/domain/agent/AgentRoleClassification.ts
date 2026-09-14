/**
 * Phase 4A-6 — Agent membership vs Legacy administrative contamination.
 *
 * Shared Firestore `user` collection: Isagent alone is a candidate gate —
 * not sufficient when SUPERADMIN / finance / partner / transport also match.
 *
 * Evidence mirrors panel_claims.js + AdminRoleService + admin_add_agent create path.
 * Auth customClaims alone are insufficient (may be empty).
 *
 * Do NOT collapse Admin into Agent. country_admin (isAdminRule=2) is the
 * expected panel persona for operational country agents — not contamination.
 */

export type AuthoritativeAgentRole =
  | "agent"
  | "country_admin"
  | "super_admin"
  | "finance"
  | "partner"
  | "transport"
  | "unknown";

export type AgentRoleEvidenceKind =
  | "firestore_IsAdmin"
  | "firestore_isAdmin"
  | "firestore_isAdminRule"
  | "firestore_IsAdminRule"
  | "firestore_Isagent"
  | "firestore_isagent"
  | "firestore_is_partner"
  | "firestore_isPartner"
  | "firestore_Rev_dloh_agent"
  | "firestore_Agent_total"
  | "firestore_app_commission_percent"
  | "firestore_vat_percent"
  | "firestore_agent_date_reg"
  | "firestore_agent_date_end"
  | "firestore_dolh_agent"
  | "discriminator_Isagent"
  | "discriminator_isagent"
  | "none";

export type AgentMembershipClassification = {
  isAgentCandidate: boolean;
  discriminatorField: "Isagent" | "isagent" | "unknown";
  isContaminatingNonAgentIdentity: boolean;
  authoritativeRole: AuthoritativeAgentRole;
  roleEvidenceKind: AgentRoleEvidenceKind;
  hasProvenAgentRoleEvidence: boolean;
  agentEvidenceKind: AgentRoleEvidenceKind;
  /** true when Legacy also carries country_admin panel rule (isAdminRule=2). */
  hasCountryAdminPanelRule: boolean;
  isOperationalAgent: boolean;
};

function normalizeAdminRule(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "object" && value) {
    if (
      "toNumber" in value &&
      typeof (value as { toNumber: () => number }).toNumber === "function"
    ) {
      try {
        return (value as { toNumber: () => number }).toNumber();
      } catch {
        /* fall through */
      }
    }
    if ("value" in value) {
      return normalizeAdminRule((value as { value: unknown }).value);
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fieldPresent(value: unknown): boolean {
  return value != null && value !== "";
}

/**
 * Primary Admin / Functions list discriminator + lowercase alias.
 * Isagent alone is a candidate gate — not sufficient for operational Agent.
 */
export function isAgentCandidateFromDoc(data: Record<string, unknown>): {
  isAgentCandidate: boolean;
  discriminatorField: "Isagent" | "isagent" | "unknown";
  evidenceKind: AgentRoleEvidenceKind;
} {
  if (data.Isagent === true) {
    return {
      isAgentCandidate: true,
      discriminatorField: "Isagent",
      evidenceKind: "discriminator_Isagent",
    };
  }
  if (data.isagent === true) {
    return {
      isAgentCandidate: true,
      discriminatorField: "isagent",
      evidenceKind: "discriminator_isagent",
    };
  }
  return {
    isAgentCandidate: false,
    discriminatorField: "unknown",
    evidenceKind: "none",
  };
}

/**
 * Proven agent-role evidence — admin_add_agent create path + commercial fields
 * + assignment country ref (Rev_dloh_agent).
 * dolh_agent (country name string) is presence-only evidence — never geography SoT.
 */
export function hasProvenAgentRoleEvidence(
  data: Record<string, unknown>,
): { proven: boolean; evidenceKind: AgentRoleEvidenceKind } {
  if (fieldPresent(data.Rev_dloh_agent)) {
    return { proven: true, evidenceKind: "firestore_Rev_dloh_agent" };
  }
  if (fieldPresent(data.Agent_total)) {
    return { proven: true, evidenceKind: "firestore_Agent_total" };
  }
  const rule = normalizeAdminRule(data.isAdminRule ?? data.IsAdminRule);
  if (rule === 2) {
    return {
      proven: true,
      evidenceKind:
        data.isAdminRule != null
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
    };
  }
  if (fieldPresent(data.app_commission_percent)) {
    return { proven: true, evidenceKind: "firestore_app_commission_percent" };
  }
  if (fieldPresent(data.vat_percent)) {
    return { proven: true, evidenceKind: "firestore_vat_percent" };
  }
  if (fieldPresent(data.agent_date_reg)) {
    return { proven: true, evidenceKind: "firestore_agent_date_reg" };
  }
  if (fieldPresent(data.agent_date_end)) {
    return { proven: true, evidenceKind: "firestore_agent_date_end" };
  }
  if (fieldPresent(data.dolh_agent)) {
    return { proven: true, evidenceKind: "firestore_dolh_agent" };
  }
  return { proven: false, evidenceKind: "none" };
}

/**
 * Contaminating administrative identities that must NOT enter Agent domain
 * even when Isagent is true (shared user collection).
 *
 * country_admin / isAdminRule=2 is NOT contamination — that is the expected
 * panel persona for operational country agents (admin_add_agent writes both).
 */
export function classifyContaminatingIdentity(
  data: Record<string, unknown>,
): {
  role: AuthoritativeAgentRole;
  roleEvidenceKind: AgentRoleEvidenceKind;
  isContaminatingNonAgentIdentity: boolean;
} {
  const ruleFromIsAdminRule = normalizeAdminRule(data.isAdminRule);
  const ruleFromIsAdminRulePascal = normalizeAdminRule(data.IsAdminRule);
  const ruleNum =
    ruleFromIsAdminRule !== 0
      ? ruleFromIsAdminRule
      : ruleFromIsAdminRulePascal;

  if (data.IsAdmin === true) {
    return {
      role: "super_admin",
      roleEvidenceKind: "firestore_IsAdmin",
      isContaminatingNonAgentIdentity: true,
    };
  }
  if (data.isAdmin === true) {
    return {
      role: "super_admin",
      roleEvidenceKind: "firestore_isAdmin",
      isContaminatingNonAgentIdentity: true,
    };
  }
  if (ruleFromIsAdminRule === 1 || ruleFromIsAdminRulePascal === 1) {
    return {
      role: "super_admin",
      roleEvidenceKind:
        ruleFromIsAdminRule === 1
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonAgentIdentity: true,
    };
  }

  if (ruleNum === 5) {
    return {
      role: "finance",
      roleEvidenceKind:
        ruleFromIsAdminRule === 5
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonAgentIdentity: true,
    };
  }

  if (ruleNum === 3) {
    return {
      role: "partner",
      roleEvidenceKind:
        ruleFromIsAdminRule === 3
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonAgentIdentity: true,
    };
  }
  if (data.is_partner === true) {
    return {
      role: "partner",
      roleEvidenceKind: "firestore_is_partner",
      isContaminatingNonAgentIdentity: true,
    };
  }
  if (data.isPartner === true) {
    return {
      role: "partner",
      roleEvidenceKind: "firestore_isPartner",
      isContaminatingNonAgentIdentity: true,
    };
  }

  if (ruleNum === 4) {
    return {
      role: "transport",
      roleEvidenceKind:
        ruleFromIsAdminRule === 4
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonAgentIdentity: true,
    };
  }

  return {
    role: "unknown",
    roleEvidenceKind: "none",
    isContaminatingNonAgentIdentity: false,
  };
}

/**
 * Full membership predicate:
 * isAgentCandidate = Isagent===true || isagent===true
 * isContaminatingNonAgentIdentity = super_admin|finance|partner|transport
 * isOperationalAgent = candidate && !contaminating && proven agent-role evidence
 */
export function classifyAgentMembership(
  data: Record<string, unknown>,
): AgentMembershipClassification {
  const candidate = isAgentCandidateFromDoc(data);
  const contaminating = classifyContaminatingIdentity(data);
  const agentEv = hasProvenAgentRoleEvidence(data);
  const ruleNum = normalizeAdminRule(data.isAdminRule ?? data.IsAdminRule);
  const hasCountryAdminPanelRule = ruleNum === 2;

  const isOperationalAgent =
    candidate.isAgentCandidate &&
    !contaminating.isContaminatingNonAgentIdentity &&
    agentEv.proven;

  let authoritativeRole: AuthoritativeAgentRole = "unknown";
  let roleEvidenceKind: AgentRoleEvidenceKind = "none";

  if (contaminating.isContaminatingNonAgentIdentity) {
    authoritativeRole = contaminating.role;
    roleEvidenceKind = contaminating.roleEvidenceKind;
  } else if (isOperationalAgent) {
    // Primary domain role is agent; country_admin panel rule is orthogonal metadata.
    authoritativeRole = "agent";
    roleEvidenceKind = agentEv.evidenceKind;
  } else if (hasCountryAdminPanelRule && !candidate.isAgentCandidate) {
    // Panel country_admin without Isagent — not Agent domain.
    authoritativeRole = "country_admin";
    roleEvidenceKind =
      data.isAdminRule != null
        ? "firestore_isAdminRule"
        : "firestore_IsAdminRule";
  } else if (candidate.isAgentCandidate) {
    authoritativeRole = "unknown";
    roleEvidenceKind = candidate.evidenceKind;
  }

  return {
    isAgentCandidate: candidate.isAgentCandidate,
    discriminatorField: candidate.discriminatorField,
    isContaminatingNonAgentIdentity:
      contaminating.isContaminatingNonAgentIdentity,
    authoritativeRole,
    roleEvidenceKind,
    hasProvenAgentRoleEvidence: agentEv.proven,
    agentEvidenceKind: agentEv.evidenceKind,
    hasCountryAdminPanelRule,
    isOperationalAgent,
  };
}
