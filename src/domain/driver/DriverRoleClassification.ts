/**
 * Phase 4A-5 — Driver membership vs Legacy administrative identity.
 *
 * Authoritative role evidence mirrors Legacy offline inventory
 * (`pre_reset_inventory.js` / `reset_operational_baseline.js`) and
 * `panel_claims.js` / `AdminRoleService` — Firestore user doc fields.
 * Auth customClaims alone are insufficient (may be empty while inventory
 * still classifies SUPERADMIN from IsAdmin / isAdminRule).
 *
 * No Auth Admin lookups. No invented fields.
 */

export type AuthoritativeLegacyRole =
  | "SUPERADMIN"
  | "FINANCE"
  | "COUNTRY_ADMIN"
  | "PARTNER"
  | "TRANSPORT_MANAGER"
  | "DRIVER"
  | "NONE";

export type RoleEvidenceKind =
  | "firestore_IsAdmin"
  | "firestore_isAdmin"
  | "firestore_isAdminRule"
  | "firestore_IsAdminRule"
  | "firestore_IsAgent"
  | "firestore_isagent"
  | "firestore_is_partner"
  | "firestore_isPartner"
  | "firestore_driver_registration_status"
  | "firestore_driver_actev_mndob"
  | "firestore_driver_registration_flow_version"
  | "firestore_driver_mndobTypeCar"
  | "firestore_driver_mndob_type_car"
  | "discriminator_ismndob"
  | "discriminator_ismndom"
  | "none";

export type DriverMembershipClassification = {
  isDriverCandidate: boolean;
  discriminatorField: "ismndob" | "ismndom" | "unknown";
  isKnownAdministrativeIdentity: boolean;
  authoritativeRole: AuthoritativeLegacyRole;
  roleEvidenceKind: RoleEvidenceKind;
  hasProvenDriverRoleEvidence: boolean;
  driverEvidenceKind: RoleEvidenceKind;
  isOperationalDriver: boolean;
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
  return value != null;
}

/**
 * Primary Admin list discriminator + proven typo alias (ismndom).
 * ismndob alone is a candidate gate — not sufficient for operational Driver.
 */
export function isDriverCandidateFromDoc(data: Record<string, unknown>): {
  isDriverCandidate: boolean;
  discriminatorField: "ismndob" | "ismndom" | "unknown";
  evidenceKind: RoleEvidenceKind;
} {
  if (data.ismndob === true) {
    return {
      isDriverCandidate: true,
      discriminatorField: "ismndob",
      evidenceKind: "discriminator_ismndob",
    };
  }
  if (data.ismndom === true) {
    return {
      isDriverCandidate: true,
      discriminatorField: "ismndom",
      evidenceKind: "discriminator_ismndom",
    };
  }
  return {
    isDriverCandidate: false,
    discriminatorField: "unknown",
    evidenceKind: "none",
  };
}

/**
 * Proven driver-role evidence — same fields as Legacy auth inventory isDriver
 * (`pre_reset_inventory.js`), plus schema field `mndob_type_car` (UserRecord).
 */
export function hasProvenDriverRoleEvidence(
  data: Record<string, unknown>,
): { proven: boolean; evidenceKind: RoleEvidenceKind } {
  if (fieldPresent(data.registration_status)) {
    return {
      proven: true,
      evidenceKind: "firestore_driver_registration_status",
    };
  }
  if (data.actev_mndob === true) {
    return { proven: true, evidenceKind: "firestore_driver_actev_mndob" };
  }
  if (fieldPresent(data.registration_flow_version)) {
    return {
      proven: true,
      evidenceKind: "firestore_driver_registration_flow_version",
    };
  }
  if (fieldPresent(data.mndobTypeCar)) {
    return { proven: true, evidenceKind: "firestore_driver_mndobTypeCar" };
  }
  if (fieldPresent(data.mndob_type_car)) {
    return { proven: true, evidenceKind: "firestore_driver_mndob_type_car" };
  }
  return { proven: false, evidenceKind: "none" };
}

/**
 * Authoritative Legacy administrative / panel role from user/{uid} fields.
 * Priority matches pre_reset_inventory.js role assignment (super → finance →
 * country → …). Does not read Auth customClaims (not on the Firestore doc;
 * claims may be {} while inventory still labels SUPERADMIN).
 */
export function classifyAuthoritativeLegacyRole(
  data: Record<string, unknown>,
): {
  role: AuthoritativeLegacyRole;
  roleEvidenceKind: RoleEvidenceKind;
  isKnownAdministrativeIdentity: boolean;
} {
  const ruleFromIsAdminRule = normalizeAdminRule(data.isAdminRule);
  const ruleFromIsAdminRulePascal = normalizeAdminRule(data.IsAdminRule);
  const ruleNum =
    ruleFromIsAdminRule !== 0
      ? ruleFromIsAdminRule
      : ruleFromIsAdminRulePascal;

  // SUPERADMIN — pre_reset_inventory: IsAdmin===true || isAdminRule===1
  // panel_claims: isAdmin || IsAdmin || ruleNum===1
  if (data.IsAdmin === true) {
    return {
      role: "SUPERADMIN",
      roleEvidenceKind: "firestore_IsAdmin",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (data.isAdmin === true) {
    return {
      role: "SUPERADMIN",
      roleEvidenceKind: "firestore_isAdmin",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (ruleFromIsAdminRule === 1) {
    return {
      role: "SUPERADMIN",
      roleEvidenceKind: "firestore_isAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (ruleFromIsAdminRulePascal === 1) {
    return {
      role: "SUPERADMIN",
      roleEvidenceKind: "firestore_IsAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }

  // FINANCE / accountant — panel_claims isAdminRule=5
  if (ruleNum === 5) {
    return {
      role: "FINANCE",
      roleEvidenceKind:
        ruleFromIsAdminRule === 5
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }

  // COUNTRY_ADMIN — inventory: IsAgent; panel: isAdminRule=2 / isagent
  if (data.IsAgent === true) {
    return {
      role: "COUNTRY_ADMIN",
      roleEvidenceKind: "firestore_IsAgent",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (data.isagent === true) {
    return {
      role: "COUNTRY_ADMIN",
      roleEvidenceKind: "firestore_isagent",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (ruleNum === 2) {
    return {
      role: "COUNTRY_ADMIN",
      roleEvidenceKind:
        ruleFromIsAdminRule === 2
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }

  // PARTNER — panel_claims rule 3 / is_partner
  if (ruleNum === 3) {
    return {
      role: "PARTNER",
      roleEvidenceKind:
        ruleFromIsAdminRule === 3
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (data.is_partner === true) {
    return {
      role: "PARTNER",
      roleEvidenceKind: "firestore_is_partner",
      isKnownAdministrativeIdentity: true,
    };
  }
  if (data.isPartner === true) {
    return {
      role: "PARTNER",
      roleEvidenceKind: "firestore_isPartner",
      isKnownAdministrativeIdentity: true,
    };
  }

  // TRANSPORT_MANAGER — panel_claims rule 4
  if (ruleNum === 4) {
    return {
      role: "TRANSPORT_MANAGER",
      roleEvidenceKind:
        ruleFromIsAdminRule === 4
          ? "firestore_isAdminRule"
          : "firestore_IsAdminRule",
      isKnownAdministrativeIdentity: true,
    };
  }

  const driverEv = hasProvenDriverRoleEvidence(data);
  if (driverEv.proven) {
    return {
      role: "DRIVER",
      roleEvidenceKind: driverEv.evidenceKind,
      isKnownAdministrativeIdentity: false,
    };
  }

  return {
    role: "NONE",
    roleEvidenceKind: "none",
    isKnownAdministrativeIdentity: false,
  };
}

/**
 * Full membership predicate:
 * isDriverCandidate = ismndob===true || proven alias (ismndom)
 * isKnownAdministrativeIdentity = Legacy admin/superadmin/etc from user doc
 * isOperationalDriver = candidate && !admin && proven driver-role evidence
 */
export function classifyDriverMembership(
  data: Record<string, unknown>,
): DriverMembershipClassification {
  const candidate = isDriverCandidateFromDoc(data);
  const admin = classifyAuthoritativeLegacyRole(data);
  const driverEv = hasProvenDriverRoleEvidence(data);
  const isOperationalDriver =
    candidate.isDriverCandidate &&
    !admin.isKnownAdministrativeIdentity &&
    driverEv.proven;

  return {
    isDriverCandidate: candidate.isDriverCandidate,
    discriminatorField: candidate.discriminatorField,
    isKnownAdministrativeIdentity: admin.isKnownAdministrativeIdentity,
    authoritativeRole: admin.role,
    roleEvidenceKind: admin.isKnownAdministrativeIdentity
      ? admin.roleEvidenceKind
      : candidate.isDriverCandidate
        ? candidate.evidenceKind
        : admin.roleEvidenceKind,
    hasProvenDriverRoleEvidence: driverEv.proven,
    driverEvidenceKind: driverEv.evidenceKind,
    isOperationalDriver,
  };
}

/** Conflicting registration_status vs submission_status (both present, diverge). */
export function hasConflictingDriverRegistration(
  data: Record<string, unknown>,
): boolean {
  const reg =
    data.registration_status == null
      ? null
      : String(data.registration_status).trim().toLowerCase();
  const sub =
    data.submission_status == null
      ? null
      : String(data.submission_status).trim().toLowerCase();
  if (!reg || !sub) return false;
  if (reg === sub) return false;
  // Alias equivalence used by CanonicalDriverRegistrationStatus
  const aliases: Record<string, string> = {
    submitted: "pending_review",
    pending: "pending_review",
  };
  const norm = (s: string) => aliases[s] ?? s;
  return norm(reg) !== norm(sub);
}
