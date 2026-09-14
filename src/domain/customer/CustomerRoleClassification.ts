/**
 * Phase 4A-7 — Customer membership vs shared Firestore `user` contamination.
 *
 * Admin list candidate (admin_customers_adapter.adminIsAppCustomer):
 *   !isagent && !ismndob && !ismndom
 * That predicate is EXCLUSION-ONLY — NOT positive Customer evidence.
 *
 * Positive CUSTOMER evidence mirrors Legacy inventory residual + Customer App
 * signup (`pre_reset_inventory.js` / `createUserRecordData` / home_pag):
 * after excluding SUPERADMIN/FINANCE/COUNTRY_ADMIN/DRIVER, inventory labels
 * CUSTOMER when the user doc has profile keys (or Auth email). Signup writes
 * actev_user, phone_number/phone_n, email, display_name, created_time, uid.
 *
 * There is NO `is_customer` field. Do not invent one. Do not classify Customer
 * by exclusion alone.
 *
 * Auth UID / Auth claims are identity only — never authoritative for Customer role.
 */

export type AuthoritativeCustomerRole =
  | "customer"
  | "driver"
  | "agent"
  | "super_admin"
  | "finance"
  | "partner"
  | "transport"
  | "country_admin"
  | "tour_guide"
  | "unknown";

export type CustomerRoleEvidenceKind =
  | "firestore_IsAdmin"
  | "firestore_isAdmin"
  | "firestore_isAdminRule"
  | "firestore_IsAdminRule"
  | "firestore_Isagent"
  | "firestore_isagent"
  | "firestore_ismndob"
  | "firestore_ismndom"
  | "firestore_is_partner"
  | "firestore_isPartner"
  | "firestore_is_tour_guide"
  | "firestore_actev_user"
  | "firestore_phone_number"
  | "firestore_phone_n"
  | "firestore_email"
  | "firestore_display_name"
  | "firestore_Bookings_User"
  | "firestore_created_time"
  | "exclusionary_non_driver_non_agent"
  | "none";

export type CustomerMembershipClassification = {
  /** Admin exclusionary filter only — not Customer proof. */
  isCustomerCandidate: boolean;
  discriminatorKind: "exclusionary_non_driver_non_agent" | "unknown";
  isContaminatingNonCustomerIdentity: boolean;
  authoritativeRole: AuthoritativeCustomerRole;
  roleEvidenceKind: CustomerRoleEvidenceKind;
  /** Proven Legacy CUSTOMER evidence (signup / inventory residual fields). */
  hasPositiveCustomerEvidence: boolean;
  /** @deprecated alias — prefer hasPositiveCustomerEvidence */
  hasProvenCustomerRoleEvidence: boolean;
  customerEvidenceKind: CustomerRoleEvidenceKind;
  /**
   * candidate && positive evidence && !known other role.
   * Geography gates apply only when this is true.
   */
  isOperationalCustomer: boolean;
  /** True when driver persona flags present. */
  isDriverPersona: boolean;
  /** True when agent persona flags present. */
  isAgentPersona: boolean;
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

function hasOwn(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

/**
 * Admin/Functions customer candidate — exclusionary, not a positive flag.
 * Matches adminIsAppCustomer / dashboard countAppUsers (ismndom included).
 */
export function isCustomerCandidateFromDoc(data: Record<string, unknown>): {
  isCustomerCandidate: boolean;
  isDriverPersona: boolean;
  isAgentPersona: boolean;
  discriminatorKind: "exclusionary_non_driver_non_agent" | "unknown";
  evidenceKind: CustomerRoleEvidenceKind;
} {
  const isDriverPersona = data.ismndob === true || data.ismndom === true;
  const isAgentPersona = data.Isagent === true || data.isagent === true;
  if (isDriverPersona || isAgentPersona) {
    return {
      isCustomerCandidate: false,
      isDriverPersona,
      isAgentPersona,
      discriminatorKind: "unknown",
      evidenceKind: isDriverPersona
        ? data.ismndob === true
          ? "firestore_ismndob"
          : "firestore_ismndom"
        : data.Isagent === true
          ? "firestore_Isagent"
          : "firestore_isagent",
    };
  }
  return {
    isCustomerCandidate: true,
    isDriverPersona: false,
    isAgentPersona: false,
    discriminatorKind: "exclusionary_non_driver_non_agent",
    evidenceKind: "exclusionary_non_driver_non_agent",
  };
}

/**
 * Positive CUSTOMER evidence — NOT exclusion alone.
 *
 * Proven by:
 * - Customer App signup / createUserRecordData (home_pag): actev_user,
 *   phone_number/phone_n, email, display_name, created_time
 * - Inventory CUSTOMER residual (pre_reset_inventory.js): after excluding
 *   SUPERADMIN/FINANCE/COUNTRY_ADMIN/DRIVER, non-empty profile keys (email
 *   on the Firestore doc is the Auth-email proxy available without Auth Admin)
 * - Bookings_User optional activity aggregate (DOCUMENT_ONLY)
 *
 * uid alone is identity, not role proof (Auth UID ≠ Customer membership).
 */
export function hasPositiveCustomerEvidence(
  data: Record<string, unknown>,
): { proven: boolean; evidenceKind: CustomerRoleEvidenceKind } {
  if (hasOwn(data, "actev_user")) {
    return { proven: true, evidenceKind: "firestore_actev_user" };
  }
  if (fieldPresent(data.phone_number)) {
    return { proven: true, evidenceKind: "firestore_phone_number" };
  }
  if (fieldPresent(data.phone_n) && Number(data.phone_n) !== 0) {
    return { proven: true, evidenceKind: "firestore_phone_n" };
  }
  if (fieldPresent(data.email)) {
    return { proven: true, evidenceKind: "firestore_email" };
  }
  if (fieldPresent(data.display_name) || fieldPresent(data.displayName)) {
    return { proven: true, evidenceKind: "firestore_display_name" };
  }
  if (fieldPresent(data.Bookings_User) || fieldPresent(data.bookings_count)) {
    return { proven: true, evidenceKind: "firestore_Bookings_User" };
  }
  if (fieldPresent(data.created_time) || fieldPresent(data.created_at)) {
    return { proven: true, evidenceKind: "firestore_created_time" };
  }
  return { proven: false, evidenceKind: "none" };
}

/** @deprecated prefer hasPositiveCustomerEvidence */
export function hasProvenCustomerRoleEvidence(
  data: Record<string, unknown>,
): { proven: boolean; evidenceKind: CustomerRoleEvidenceKind } {
  return hasPositiveCustomerEvidence(data);
}

/**
 * Contaminating non-customer identities on the shared `user` collection.
 * Unlike Agents: isAdminRule=2 (country_admin) IS contamination for Customer domain.
 */
export function classifyContaminatingNonCustomerIdentity(
  data: Record<string, unknown>,
): {
  role: AuthoritativeCustomerRole;
  roleEvidenceKind: CustomerRoleEvidenceKind;
  isContaminatingNonCustomerIdentity: boolean;
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
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (data.isAdmin === true) {
    return {
      role: "super_admin",
      roleEvidenceKind: "firestore_isAdmin",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (ruleFromIsAdminRule === 1 || ruleFromIsAdminRulePascal === 1) {
    return {
      role: "super_admin",
      roleEvidenceKind:
        ruleFromIsAdminRule === 1
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (ruleNum === 5) {
    return {
      role: "finance",
      roleEvidenceKind:
        ruleFromIsAdminRule === 5
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (ruleNum === 3 || data.is_partner === true || data.isPartner === true) {
    if (data.is_partner === true) {
      return {
        role: "partner",
        roleEvidenceKind: "firestore_is_partner",
        isContaminatingNonCustomerIdentity: true,
      };
    }
    if (data.isPartner === true) {
      return {
        role: "partner",
        roleEvidenceKind: "firestore_isPartner",
        isContaminatingNonCustomerIdentity: true,
      };
    }
    return {
      role: "partner",
      roleEvidenceKind:
        ruleFromIsAdminRule === 3
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (ruleNum === 4) {
    return {
      role: "transport",
      roleEvidenceKind:
        ruleFromIsAdminRule === 4
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (ruleNum === 2) {
    return {
      role: "country_admin",
      roleEvidenceKind:
        ruleFromIsAdminRule === 2
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isContaminatingNonCustomerIdentity: true,
    };
  }
  if (data.is_tour_guide === true) {
    return {
      role: "tour_guide",
      roleEvidenceKind: "firestore_is_tour_guide",
      isContaminatingNonCustomerIdentity: true,
    };
  }

  return {
    role: "unknown",
    roleEvidenceKind: "none",
    isContaminatingNonCustomerIdentity: false,
  };
}

/**
 * Full membership:
 * isCustomerCandidate = !driver && !agent   (exclusionary — Admin list filter)
 * isContaminating / knownOtherRole = SUPERADMIN|FINANCE|PARTNER|TRANSPORT|
 *   country_admin|tour_guide|driver|agent
 * hasPositiveCustomerEvidence = signup / inventory CUSTOMER residual fields
 * isOperationalCustomer = candidate && positive && !knownOtherRole
 *
 * candidate && !positive && !knownOtherRole → excludedUnknownIdentity (mapper)
 */
export function classifyCustomerMembership(
  data: Record<string, unknown>,
): CustomerMembershipClassification {
  const candidate = isCustomerCandidateFromDoc(data);
  const contaminating = classifyContaminatingNonCustomerIdentity(data);
  const customerEv = hasPositiveCustomerEvidence(data);

  const knownOtherRole =
    candidate.isDriverPersona ||
    candidate.isAgentPersona ||
    contaminating.isContaminatingNonCustomerIdentity;

  const isOperationalCustomer =
    candidate.isCustomerCandidate &&
    !knownOtherRole &&
    customerEv.proven;

  let authoritativeRole: AuthoritativeCustomerRole = "unknown";
  let roleEvidenceKind: CustomerRoleEvidenceKind = "none";

  if (candidate.isDriverPersona) {
    authoritativeRole = "driver";
    roleEvidenceKind = candidate.evidenceKind;
  } else if (candidate.isAgentPersona) {
    authoritativeRole = "agent";
    roleEvidenceKind = candidate.evidenceKind;
  } else if (contaminating.isContaminatingNonCustomerIdentity) {
    authoritativeRole = contaminating.role;
    roleEvidenceKind = contaminating.roleEvidenceKind;
  } else if (isOperationalCustomer) {
    authoritativeRole = "customer";
    roleEvidenceKind = customerEv.evidenceKind;
  } else if (candidate.isCustomerCandidate) {
    // Exclusionary candidate without positive CUSTOMER evidence → unknown identity
    authoritativeRole = "unknown";
    roleEvidenceKind = "none";
  }

  return {
    isCustomerCandidate: candidate.isCustomerCandidate,
    discriminatorKind: candidate.discriminatorKind,
    isContaminatingNonCustomerIdentity:
      contaminating.isContaminatingNonCustomerIdentity,
    authoritativeRole,
    roleEvidenceKind,
    hasPositiveCustomerEvidence: customerEv.proven,
    hasProvenCustomerRoleEvidence: customerEv.proven,
    customerEvidenceKind: customerEv.evidenceKind,
    isOperationalCustomer,
    isDriverPersona: candidate.isDriverPersona,
    isAgentPersona: candidate.isAgentPersona,
  };
}
