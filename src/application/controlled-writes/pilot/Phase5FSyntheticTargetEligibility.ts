/**
 * Phase 5F — Synthetic Pilot target eligibility (read-only / offline-safe).
 * Evaluates a single candidate Firestore user-doc snapshot.
 * No PII in diagnostics. No Production mutation.
 */

import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import { summarizeDriverFinancialPresence } from "@/domain/driver/DriverFinancialFieldNotes";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import {
  classifyProvenSyntheticDriver,
  type ProvenSyntheticMarkerKind,
} from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";

export type Phase5FEligibilityDenialCode =
  | "NOT_OPERATIONAL_DRIVER"
  | "NOT_PROVEN_SYNTHETIC"
  | "REGISTRATION_STATUS_MISMATCH"
  | "ACTEV_MNDOB_NOT_FALSE"
  | "COUNTRY_NOT_REPRESENTED"
  | "CITY_NOT_REPRESENTED"
  | "DRIVER_HAS_ACTIVE_TRIP"
  | "FINANCE_IMPACT_PRESENT"
  | "AGENT_ROLE_PRESENT"
  | "CUSTOMER_ROLE_CONTAMINATION"
  | "ADMIN_ROLE_PRESENT"
  | "DOCUMENT_ID_REQUIRED";

export type Phase5FFinanceImpact = "none" | "present";

export type Phase5FSafeEligibilityFacts = {
  documentId: string;
  operationalDriver: boolean;
  synthetic: boolean;
  markersMatched: readonly ProvenSyntheticMarkerKind[];
  currentState: string | null;
  actevMndob: false | true | null;
  activeTrip: boolean;
  financeImpact: Phase5FFinanceImpact;
  countryRepresented: boolean;
  cityRepresented: boolean;
  agentRole: boolean;
  adminRole: boolean;
  customerContamination: boolean;
};

export type Phase5FEligibilityResult = {
  eligible: boolean;
  denials: Phase5FEligibilityDenialCode[];
  facts: Phase5FSafeEligibilityFacts;
};

function asBool(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}

/**
 * Outstanding / bank / wallet pointers that imply operational finance exposure.
 * Presence with a non-null value → financeImpact=present (fail-closed for Pilot).
 */
const FINANCE_IMPACT_FIELDS = [
  "Outstandingonlinepayment",
  "ipanBank",
  "bankIdAcc",
  "bankNaim",
  "banknaimAcc",
] as const;

function assessFinanceImpact(
  data: Record<string, unknown>,
): Phase5FFinanceImpact {
  for (const field of FINANCE_IMPACT_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(data, field) &&
      data[field] != null &&
      data[field] !== "" &&
      data[field] !== 0 &&
      data[field] !== false
    ) {
      return "present";
    }
  }
  // Inventory presence alone is documented; aggregates do not block eligibility
  // unless outstanding/bank fields indicate operational finance dependency.
  void summarizeDriverFinancialPresence(data);
  return "none";
}

/**
 * Evaluate one candidate against Phase 5F required target conditions.
 * Input `data` is a Legacy user-doc field map — diagnostics never echo PII.
 */
export function evaluateSyntheticPilotTargetEligibility(input: {
  documentId: string;
  data: Record<string, unknown>;
}): Phase5FEligibilityResult {
  const denials: Phase5FEligibilityDenialCode[] = [];
  const documentId = input.documentId.trim();
  const data = input.data;

  if (!documentId) {
    denials.push("DOCUMENT_ID_REQUIRED");
  }

  const membership = classifyDriverMembership(data);
  const operationalDriver = membership.isOperationalDriver === true;
  if (!operationalDriver) {
    denials.push("NOT_OPERATIONAL_DRIVER");
  }
  if (membership.isKnownAdministrativeIdentity) {
    denials.push("ADMIN_ROLE_PRESENT");
  }

  const agentRole = data.Isagent === true || data.isagent === true;
  if (agentRole) {
    denials.push("AGENT_ROLE_PRESENT");
  }

  // Customer is exclusionary (!driver && !agent). Dual driver+customer is
  // contamination if ismndob is false while still claiming customer ops — but
  // with ismndob driver candidate, customerCandidate is false. Guard anyway:
  // reject if known customer-only signals without driver discriminator.
  const customerContamination =
    !membership.isDriverCandidate &&
    data.Isagent !== true &&
    data.isagent !== true &&
    (data.ismndob === false || data.ismndob == null);
  // For Pilot we require operational Driver; customerContamination only when
  // the doc is not a driver candidate (already covered by NOT_OPERATIONAL).
  // Explicit additional: never select a non-driver as Pilot target.
  if (customerContamination && !membership.isDriverCandidate) {
    denials.push("CUSTOMER_ROLE_CONTAMINATION");
  }

  const synthetic = classifyProvenSyntheticDriver({ documentId, data });
  if (!synthetic.ok) {
    denials.push("NOT_PROVEN_SYNTHETIC");
  }

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

  const currentState = axes.registration.value;
  if (currentState !== "pending_review") {
    denials.push("REGISTRATION_STATUS_MISMATCH");
  }

  const actev = asBool(data.actev_mndob);
  if (actev !== false) {
    denials.push("ACTEV_MNDOB_NOT_FALSE");
  }

  const rawCountryId = extractLegacyDocRefId(data.Rev_dolh);
  let countryRepresented = false;
  if (rawCountryId) {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    countryRepresented =
      resolved.status === "mapped" && resolved.canonicalCountryId != null;
  }
  if (!countryRepresented) {
    denials.push("COUNTRY_NOT_REPRESENTED");
  }

  const rawCityId = extractLegacyDocRefId(data.mndob_vill);
  const cityRepresented = rawCityId != null && rawCityId.length > 0;
  if (!cityRepresented) {
    denials.push("CITY_NOT_REPRESENTED");
  }

  const activeTrip = axes.tripState.value === "busy";
  if (activeTrip) {
    denials.push("DRIVER_HAS_ACTIVE_TRIP");
  }

  const financeImpact = assessFinanceImpact(data);
  if (financeImpact !== "none") {
    denials.push("FINANCE_IMPACT_PRESENT");
  }

  const facts: Phase5FSafeEligibilityFacts = {
    documentId,
    operationalDriver,
    synthetic: synthetic.ok,
    markersMatched: synthetic.markersMatched,
    currentState,
    actevMndob: actev,
    activeTrip,
    financeImpact,
    countryRepresented,
    cityRepresented,
    agentRole,
    adminRole: membership.isKnownAdministrativeIdentity,
    customerContamination,
  };

  return {
    eligible: denials.length === 0,
    denials,
    facts,
  };
}
