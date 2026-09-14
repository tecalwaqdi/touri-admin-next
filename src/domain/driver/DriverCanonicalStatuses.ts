/**
 * Phase 4A-5 — Six orthogonal driver status axes.
 * Evidence: admin_driver_status_truth.dart + DRIVER_STATUS_MAPPING.md.
 *
 * ACCOUNT ≠ REGISTRATION ≠ ONLINE ≠ AVAILABILITY ≠ TRIP ≠ COMPLIANCE
 * Availability is the ONLY axis Legacy derives (account + online + onTrip).
 * Do not collapse registration into account or invent online from GPS.
 */

import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import {
  resolveCanonicalDriverRegistrationStatus,
  type CanonicalDriverRegistrationStatus,
} from "@/domain/driver/CanonicalDriverRegistrationStatus";

export type DriverStatusAxis =
  | "registration"
  | "account"
  | "online"
  | "availability"
  | "tripState"
  | "compliance";

export type DriverAccountEnabled = "enabled" | "disabled" | "unknown";
export type DriverOnlineStatus = "online" | "offline" | "unknown";
export type DriverAvailabilityStatus =
  | "available"
  | "busy"
  | "unavailable"
  | "unknown";
export type DriverTripState = "idle" | "busy" | "unknown";
export type DriverComplianceStatus =
  | "ready"
  | "incomplete"
  | "expired"
  | "unknown";

export type DriverAxisStatus<T extends string | boolean | null = string | null> =
  {
    axis: DriverStatusAxis;
    value: T;
    sourceField: string | null;
    confidence: MappingConfidence;
    unknownBehavior: string;
  };

export type DriverCanonicalStatuses = {
  registration: DriverAxisStatus<CanonicalDriverRegistrationStatus>;
  account: DriverAxisStatus<DriverAccountEnabled>;
  online: DriverAxisStatus<DriverOnlineStatus>;
  /** Legacy-derived (admin_driver_status_truth) — not an independent SoT field. */
  availability: DriverAxisStatus<DriverAvailabilityStatus>;
  tripState: DriverAxisStatus<DriverTripState>;
  compliance: DriverAxisStatus<DriverComplianceStatus>;
  /**
   * Phase 3.7 compatibility aliases (same evidence; do not treat as extra SoT).
   * `accountBool` mirrors actev_mndob boolean for older callers.
   */
  approval: DriverAxisStatus;
  presence: DriverAxisStatus<boolean | null>;
  document: DriverAxisStatus;
  accountBool: boolean | null;
  warnings: string[];
  /** Raw evidence flags for audits (not collapsed). */
  evidence: {
    actev_mndob: boolean | null;
    ngl: boolean | null;
    is_online: boolean | null;
    mndon_newacc: boolean | null;
    operational_status: string | null;
    registration_documents_status: string | null;
  };
};

export type LegacyDriverStatusFields = {
  registration_status?: string | null;
  submission_status?: string | null;
  actev_mndob?: boolean | null;
  account_status?: string | null;
  is_online?: boolean | null;
  ngl?: unknown;
  operational_status?: string | null;
  on_trip?: boolean | null;
  mndon_newacc?: boolean | null;
  document_review_status?: string | null;
  registration_documents_status?: string | null;
};

function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Map Legacy driver fields into six orthogonal axes.
 * Never treat actev_mndob as approval; never invent online from GPS freshness.
 */
export function mapDriverCanonicalStatuses(
  fields: LegacyDriverStatusFields,
): DriverCanonicalStatuses {
  const warnings: string[] = [];

  const reg = resolveCanonicalDriverRegistrationStatus({
    registration_status: fields.registration_status,
    submission_status: fields.submission_status,
  });
  if (
    !fields.registration_status?.trim() &&
    fields.submission_status?.trim()
  ) {
    warnings.push("registration_status missing; fallback submission_status");
  }

  if (
    reg.status === "pending_review" &&
    fields.actev_mndob === true
  ) {
    warnings.push(
      "pending_review with actev_mndob=true ≠ approved (admin_driver_status_truth)",
    );
  }

  const registration: DriverAxisStatus<CanonicalDriverRegistrationStatus> = {
    axis: "registration",
    value: reg.status,
    sourceField:
      reg.sourceField === "missing" ? null : reg.sourceField,
    confidence: reg.status === "unknown" ? "unknown" : "high",
    unknownBehavior: "Leave unknown; do not infer approved from account active",
  };

  const actev = asBool(fields.actev_mndob);
  let accountValue: DriverAccountEnabled = "unknown";
  let accountSource: string | null = null;
  if (actev === true) {
    accountValue = "enabled";
    accountSource = "actev_mndob";
  } else if (actev === false) {
    accountValue = "disabled";
    accountSource = "actev_mndob";
  } else if (asStr(fields.account_status)) {
    const a = asStr(fields.account_status)!.toLowerCase();
    accountSource = "account_status";
    if (a === "active" || a === "enabled") accountValue = "enabled";
    else if (a === "inactive" || a === "disabled") accountValue = "disabled";
    else accountValue = "unknown";
  }

  const account: DriverAxisStatus<DriverAccountEnabled> = {
    axis: "account",
    value: accountValue,
    sourceField: accountSource,
    confidence: actev != null ? "high" : accountSource ? "medium" : "unknown",
    unknownBehavior: "null/unknown — do not infer from registration",
  };

  const isOnline = asBool(fields.is_online);
  const ngl = asBool(fields.ngl);
  const ops = asStr(fields.operational_status)?.toLowerCase() ?? null;

  let onlineValue: DriverOnlineStatus = "unknown";
  let onlineSource: string | null = null;
  if (isOnline === true) {
    onlineValue = "online";
    onlineSource = "is_online";
  } else if (isOnline === false) {
    onlineValue = "offline";
    onlineSource = "is_online";
  } else if (ngl === true) {
    onlineValue = "online";
    onlineSource = "ngl";
  } else if (ngl === false) {
    onlineValue = "offline";
    onlineSource = "ngl";
  } else if (ops === "online") {
    onlineValue = "online";
    onlineSource = "operational_status";
  } else if (ops === "offline") {
    onlineValue = "offline";
    onlineSource = "operational_status";
  }

  const online: DriverAxisStatus<DriverOnlineStatus> = {
    axis: "online",
    value: onlineValue,
    sourceField: onlineSource,
    confidence: onlineValue === "unknown" ? "unknown" : "medium",
    unknownBehavior: "Offline GPS freshness must not imply Online",
  };

  const onTripFlag =
    asBool(fields.on_trip) === true ||
    asBool(fields.mndon_newacc) === true ||
    ops === "on_trip" ||
    ops === "busy";

  let tripStateValue: DriverTripState = "unknown";
  let tripSource: string | null = null;
  if (
    asBool(fields.on_trip) === true ||
    asBool(fields.mndon_newacc) === true
  ) {
    tripStateValue = "busy";
    tripSource =
      asBool(fields.mndon_newacc) === true ? "mndon_newacc" : "on_trip";
  } else if (ops === "on_trip" || ops === "busy") {
    tripStateValue = "busy";
    tripSource = "operational_status";
  } else if (
    asBool(fields.on_trip) === false ||
    asBool(fields.mndon_newacc) === false ||
    (asBool(fields.mndon_newacc) == null &&
      asBool(fields.on_trip) == null &&
      ops != null &&
      ops !== "on_trip" &&
      ops !== "busy")
  ) {
    // Explicit false on busy flags → idle; ops present but not busy → idle
    if (
      asBool(fields.mndon_newacc) === false ||
      asBool(fields.on_trip) === false
    ) {
      tripStateValue = "idle";
      tripSource =
        asBool(fields.mndon_newacc) === false ? "mndon_newacc" : "on_trip";
    } else if (ops != null) {
      tripStateValue = "idle";
      tripSource = "operational_status";
    }
  }
  // If all busy evidence absent → unknown (do not invent idle from missing)

  const tripState: DriverAxisStatus<DriverTripState> = {
    axis: "tripState",
    value: tripStateValue,
    sourceField: tripSource,
    confidence: tripStateValue === "unknown" ? "unknown" : "medium",
    unknownBehavior:
      "Use mndon_newacc / on_trip / ops; no order ActiveOrder N+1 in readiness",
  };

  // Legacy availability derivation (admin_driver_status_truth) — explicit.
  let availabilityValue: DriverAvailabilityStatus = "unknown";
  if (accountValue === "disabled") {
    availabilityValue = "unavailable";
  } else if (accountValue === "enabled" && onTripFlag) {
    availabilityValue = "busy";
  } else if (accountValue === "enabled" && onlineValue === "online") {
    availabilityValue = "available";
  } else if (accountValue === "enabled" && onlineValue === "offline") {
    availabilityValue = "unavailable";
  } else {
    availabilityValue = "unknown";
  }

  const availability: DriverAxisStatus<DriverAvailabilityStatus> = {
    axis: "availability",
    value: availabilityValue,
    sourceField: "derived(account+online+tripState)",
    confidence:
      availabilityValue === "unknown" ? "unknown" : "medium",
    unknownBehavior:
      "Legacy-derived only; do not invent available when online unknown",
  };

  const docsRaw = asStr(fields.registration_documents_status)?.toLowerCase();
  let complianceValue: DriverComplianceStatus = "unknown";
  let complianceSource: string | null = null;
  if (docsRaw === "complete") {
    complianceValue = "ready";
    complianceSource = "registration_documents_status";
  } else if (
    docsRaw === "missing" ||
    docsRaw === "needs_reupload" ||
    docsRaw === "incomplete"
  ) {
    complianceValue = "incomplete";
    complianceSource = "registration_documents_status";
  } else if (docsRaw === "expired") {
    complianceValue = "expired";
    complianceSource = "registration_documents_status";
  } else if (asStr(fields.document_review_status)) {
    const d = asStr(fields.document_review_status)!.toLowerCase();
    complianceSource = "document_review_status";
    if (d === "approved" || d === "complete") complianceValue = "ready";
    else if (d === "rejected" || d === "needs_reupload")
      complianceValue = "incomplete";
    else complianceValue = "unknown";
  }

  const compliance: DriverAxisStatus<DriverComplianceStatus> = {
    axis: "compliance",
    value: complianceValue,
    sourceField: complianceSource,
    confidence: complianceValue === "unknown" ? "unknown" : "medium",
    unknownBehavior:
      "Safe summary only — never expose URLs / ID numbers / images",
  };

  // Phase 3.7 compatibility — approval mirrors registration; presence mirrors online bool.
  const approval: DriverAxisStatus = {
    axis: "registration",
    value: reg.status === "unknown" ? null : reg.status,
    sourceField: registration.sourceField,
    confidence: registration.confidence,
    unknownBehavior: "Never treat account activation as approval",
  };
  const presence: DriverAxisStatus<boolean | null> = {
    axis: "online",
    value:
      onlineValue === "online"
        ? true
        : onlineValue === "offline"
          ? false
          : null,
    sourceField: onlineSource,
    confidence: online.confidence,
    unknownBehavior: "Offline GPS freshness must not imply Online",
  };
  const document: DriverAxisStatus = {
    axis: "compliance",
    value: complianceValue === "unknown" ? null : complianceValue,
    sourceField: complianceSource,
    confidence: compliance.confidence,
    unknownBehavior: "null — document review is independent axis",
  };

  return {
    registration,
    account,
    online,
    availability,
    tripState,
    compliance,
    approval,
    presence,
    document,
    accountBool: actev,
    warnings,
    evidence: {
      actev_mndob: actev,
      ngl,
      is_online: isOnline,
      mndon_newacc: asBool(fields.mndon_newacc),
      operational_status: ops,
      registration_documents_status:   docsRaw ?? null,
    },
  };
}
