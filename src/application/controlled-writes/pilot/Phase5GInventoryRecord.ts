/**
 * Phase 5G — build safe inventory record for one proven synthetic Driver.
 * ANY registration state. No PII. No mutation.
 */

import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import type { CanonicalDriverRegistrationStatus } from "@/domain/driver/CanonicalDriverRegistrationStatus";
import type { DriverAccountEnabled } from "@/domain/driver/DriverCanonicalStatuses";
import {
  classifyPhase5GSyntheticEvidence,
  type Phase5GSyntheticEvidenceKind,
} from "@/application/controlled-writes/pilot/Phase5GSyntheticEvidence";
import {
  classifyPhase5GFinanceSafety,
  isPhase5GFinancePilotSafe,
  type Phase5GFinanceImpactClassification,
  type Phase5GPendingSettlement,
  type Phase5GWalletImpact,
} from "@/application/controlled-writes/pilot/Phase5GFinanceSafetyClassification";
import { AUTH_REQUIRED_FOR_PILOT_TARGET } from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";

export type Phase5GCountryMapping =
  | "mapped"
  | "unmapped"
  | "missing"
  | "unknown";

export type Phase5GCityMapping = "present" | "missing" | "unknown";

export type Phase5GTripState = "idle" | "busy" | "unknown";

export type Phase5GSafePilotReason =
  | "PROVEN_SYNTHETIC"
  | "OPERATIONAL_DRIVER"
  | "KNOWN_REGISTRATION_STATE"
  | "COUNTRY_MAPPED"
  | "CITY_PRESENT"
  | "NO_ACTIVE_TRIP"
  | "FINANCE_IMPACT_NONE"
  | "AUTH_DEPENDENCY_FALSE"
  | "NO_CONFLICTING_ROLE"
  | "NOT_PROVEN_SYNTHETIC"
  | "NOT_OPERATIONAL_DRIVER"
  | "REGISTRATION_STATE_UNKNOWN"
  | "COUNTRY_NOT_MAPPED"
  | "CITY_MISSING"
  | "HAS_ACTIVE_TRIP"
  | "FINANCE_NOT_SAFE"
  | "AUTH_DEPENDENCY_REQUIRED"
  | "CONFLICTING_ROLE"
  | "EXCLUDED_UNKNOWN_IDENTITY"
  | "REAL_USER_RELATIONSHIP_SUSPECTED";

/** §4 safe inventory fields only — never email/phone/name/bank/FCM. */
export type Phase5GSyntheticInventoryRecord = {
  sourceDocumentId: string;
  syntheticEvidenceKind: Phase5GSyntheticEvidenceKind;
  operationalDriver: boolean;
  registrationStatus: CanonicalDriverRegistrationStatus;
  accountEnabled: DriverAccountEnabled;
  countryMapping: Phase5GCountryMapping;
  cityMapping: Phase5GCityMapping;
  tripState: Phase5GTripState;
  hasActiveTrip: boolean;
  financeImpactClassification: Phase5GFinanceImpactClassification;
  pendingSettlement: Phase5GPendingSettlement;
  walletImpact: Phase5GWalletImpact;
  authDependency: boolean;
  conflictingRole: boolean;
  safePilotEligible: boolean;
  safePilotReasons: readonly Phase5GSafePilotReason[];
};

function assessCountry(data: Record<string, unknown>): Phase5GCountryMapping {
  const rawCountryId = extractLegacyDocRefId(data.Rev_dolh);
  if (!rawCountryId) return "missing";
  const resolved = resolveCanonicalCountryId(rawCountryId);
  if (resolved.status === "mapped" && resolved.canonicalCountryId != null) {
    return "mapped";
  }
  return "unmapped";
}

function assessCity(data: Record<string, unknown>): Phase5GCityMapping {
  const rawCityId = extractLegacyDocRefId(data.mndob_vill);
  if (!rawCityId) return "missing";
  return "present";
}

/**
 * Build one safe inventory row. Returns null when not proven synthetic
 * (or when excludedUnknownIdentity — never reclassify).
 */
export function buildPhase5GInventoryRecord(input: {
  documentId: string;
  data: Record<string, unknown>;
  mappingStatus?: string | null;
}): Phase5GSyntheticInventoryRecord | null {
  const evidence = classifyPhase5GSyntheticEvidence({
    documentId: input.documentId,
    data: input.data,
    mappingStatus: input.mappingStatus,
  });
  if (!evidence.ok || evidence.syntheticEvidenceKind == null) {
    return null;
  }

  const data = input.data;
  const membership = classifyDriverMembership(data);
  const axes = mapDriverCanonicalStatuses({
    registration_status:
      data.registration_status == null
        ? null
        : String(data.registration_status),
    submission_status:
      data.submission_status == null ? null : String(data.submission_status),
    actev_mndob: typeof data.actev_mndob === "boolean" ? data.actev_mndob : null,
    account_status:
      data.account_status == null ? null : String(data.account_status),
    is_online: typeof data.is_online === "boolean" ? data.is_online : null,
    ngl: data.ngl,
    operational_status:
      data.operational_status == null
        ? null
        : String(data.operational_status),
    on_trip: typeof data.on_trip === "boolean" ? data.on_trip : null,
    mndon_newacc:
      typeof data.mndon_newacc === "boolean" ? data.mndon_newacc : null,
  });

  const tripState: Phase5GTripState =
    axes.tripState.value === "busy"
      ? "busy"
      : axes.tripState.value === "idle"
        ? "idle"
        : "unknown";
  const hasActiveTrip = tripState === "busy";

  const finance = classifyPhase5GFinanceSafety(data);
  const countryMapping = assessCountry(data);
  const cityMapping = assessCity(data);

  const agentRole = data.Isagent === true || data.isagent === true;
  const adminRole = membership.isKnownAdministrativeIdentity === true;
  const conflictingRole = agentRole || adminRole;

  // Auth: Pilot path is Firestore-domain-only (Phase 5E).
  const authDependency: boolean = AUTH_REQUIRED_FOR_PILOT_TARGET;

  const reasons: Phase5GSafePilotReason[] = [];
  reasons.push("PROVEN_SYNTHETIC");

  const operationalDriver = membership.isOperationalDriver === true;
  if (operationalDriver) reasons.push("OPERATIONAL_DRIVER");
  else reasons.push("NOT_OPERATIONAL_DRIVER");

  const registrationStatus = axes.registration.value;
  if (registrationStatus !== "unknown") {
    reasons.push("KNOWN_REGISTRATION_STATE");
  } else {
    reasons.push("REGISTRATION_STATE_UNKNOWN");
  }

  if (countryMapping === "mapped") reasons.push("COUNTRY_MAPPED");
  else reasons.push("COUNTRY_NOT_MAPPED");

  if (cityMapping === "present") reasons.push("CITY_PRESENT");
  else reasons.push("CITY_MISSING");

  if (!hasActiveTrip && tripState === "idle") {
    reasons.push("NO_ACTIVE_TRIP");
  } else if (hasActiveTrip) {
    reasons.push("HAS_ACTIVE_TRIP");
  } else {
    // unknown trip → fail-closed
    reasons.push("HAS_ACTIVE_TRIP");
  }

  if (isPhase5GFinancePilotSafe(finance)) {
    reasons.push("FINANCE_IMPACT_NONE");
  } else {
    reasons.push("FINANCE_NOT_SAFE");
  }

  if (!authDependency) reasons.push("AUTH_DEPENDENCY_FALSE");
  else reasons.push("AUTH_DEPENDENCY_REQUIRED");

  if (!conflictingRole) reasons.push("NO_CONFLICTING_ROLE");
  else reasons.push("CONFLICTING_ROLE");

  // Strict §9–12 eligibility (base — action validity evaluated separately).
  const safePilotEligible =
    operationalDriver &&
    registrationStatus !== "unknown" &&
    countryMapping === "mapped" &&
    cityMapping === "present" &&
    tripState === "idle" &&
    !hasActiveTrip &&
    isPhase5GFinancePilotSafe(finance) &&
    !authDependency &&
    !conflictingRole;

  return {
    sourceDocumentId: input.documentId.trim(),
    syntheticEvidenceKind: evidence.syntheticEvidenceKind,
    operationalDriver,
    registrationStatus,
    accountEnabled: axes.account.value,
    countryMapping,
    cityMapping,
    tripState,
    hasActiveTrip,
    financeImpactClassification: finance.financeImpactClassification,
    pendingSettlement: finance.pendingSettlement,
    walletImpact: finance.walletImpact,
    authDependency,
    conflictingRole,
    safePilotEligible,
    safePilotReasons: reasons,
  };
}
