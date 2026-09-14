/**
 * Phase 5E — Synthetic Production Driver requirements (PREPARATION ONLY).
 * Does NOT create or mutate Production records. Does NOT create Auth users.
 */

import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";

/** Expected Production project for future Pilot (same fingerprint as Phase 4A/4B). */
export const PHASE_5E_EXPECTED_PROJECT_ID =
  "tutorial-multi-language-70gx4j" as const;

/**
 * Deterministic synthetic document id strategy.
 * Must match `isTestOrNoncanonicalDriver` id prefixes: cp5_|test_|demo_|golden_|qa_
 * NOT created automatically in Phase 5E.
 */
export const PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY =
  "test_phase5e_driver_needs_changes_pilot_001" as const;

/**
 * Controlled Write path does not call Auth. Synthetic doc id is not a Firebase
 * Auth UID. No fake Auth user creation. Therefore Auth user existence is NOT
 * required for the Pilot mutation target itself.
 */
export const AUTH_REQUIRED_FOR_PILOT_TARGET = false as const;

export type SyntheticDriverSchemaRequirement = {
  /** Firestore collection — proven Legacy/4A-5. */
  collection: "user";
  /** Document id — must be synthetic marker id. */
  documentIdRule: "deterministic_test_prefix";
  /** Required membership fields (proven 4A-5). */
  requiredFields: readonly {
    field: string;
    value: unknown;
    purpose: string;
  }[];
  /** Explicitly forbidden on synthetic record. */
  forbidden: readonly string[];
  /** PII / finance / trip must stay absent or zero-impact. */
  isolation: {
    financeFields: "absent_or_untouched";
    tripBusyFlags: "false_or_absent_idle";
    authUserCreate: "forbidden";
    agentFlags: "absent_or_false";
    customerContamination: "forbidden";
  };
};

/**
 * Minimal schema from proven Legacy/4A fields only.
 * Operator creates manually later — Phase 5E does NOT create this record.
 */
export const SYNTHETIC_DRIVER_SCHEMA_REQUIREMENTS: SyntheticDriverSchemaRequirement =
  {
    collection: "user",
    documentIdRule: "deterministic_test_prefix",
    requiredFields: [
      {
        field: "ismndob",
        value: true,
        purpose: "Driver candidate discriminator (4A-5)",
      },
      {
        field: "registration_status",
        value: "pending_review",
        purpose: "Exact Pilot before state (5A/5D)",
      },
      {
        field: "actev_mndob",
        value: false,
        purpose: "Account not activated; pending_review + actev≠approved",
      },
      {
        field: "is_test",
        value: true,
        purpose: "Synthetic marker (isTestOrNoncanonicalDriver)",
      },
      {
        field: "functional_test",
        value: true,
        purpose: "Secondary synthetic marker",
      },
      {
        field: "Rev_dolh",
        value: "<mapped_canonical_country_doc_id>",
        purpose: "Mapped country — required for operational geography",
      },
      {
        field: "mndob_vill",
        value: "<mapped_canonical_village_doc_id>",
        purpose: "Mapped city/village — avoid unmappedCity",
      },
    ],
    forbidden: [
      "phone_number",
      "phone_n",
      "email",
      "ID_hoyh_MNDOB",
      "ipanBank",
      "bankIdAcc",
      "bankNaim",
      "Isagent",
      "IsAdmin",
      "isAdmin",
      "isAdminRule",
      "Outstandingonlinepayment",
      "total_mndob",
      "mndon_newacc",
    ],
    isolation: {
      financeFields: "absent_or_untouched",
      tripBusyFlags: "false_or_absent_idle",
      authUserCreate: "forbidden",
      agentFlags: "absent_or_false",
      customerContamination: "forbidden",
    },
  };

export type SyntheticMarkerCheck = {
  ok: boolean;
  code?: "PILOT_TARGET_NOT_SYNTHETIC";
  message: string;
  markersMatched: readonly string[];
};

/**
 * Synthetic marker strategy from existing `isTestOrNoncanonicalDriver` conventions.
 */
export function assertPilotTargetIsSynthetic(input: {
  driverId: string;
  data?: Record<string, unknown>;
  countryId?: string | null;
}): SyntheticMarkerCheck {
  const id = input.driverId.trim();
  if (!id) {
    return {
      ok: false,
      code: "PILOT_TARGET_NOT_SYNTHETIC",
      message: "PILOT_DRIVER_ID required",
      markersMatched: [],
    };
  }
  const data = input.data ?? { is_test: true };
  const matched: string[] = [];
  if (/^cp5_|^test_|^demo_|^golden_|^qa_/i.test(id)) {
    matched.push("documentId_prefix");
  }
  if (data.is_test === true || data.is_test === "true") matched.push("is_test");
  if (data.functional_test === true || data.functional_test === "true") {
    matched.push("functional_test");
  }
  if (data.demo === true || data.demo === "true") matched.push("demo");
  if (data.qa_fixture === true || data.qa_fixture === "true") {
    matched.push("qa_fixture");
  }

  const classified = isTestOrNoncanonicalDriver({
    documentId: id,
    data,
    countryId: input.countryId,
  });

  if (!classified) {
    return {
      ok: false,
      code: "PILOT_TARGET_NOT_SYNTHETIC",
      message: `Target ${id} is not synthetic per isTestOrNoncanonicalDriver`,
      markersMatched: matched,
    };
  }
  return {
    ok: true,
    message: "Target classified as testOrNoncanonical (synthetic)",
    markersMatched: matched,
  };
}

export type AuthPilotDependencyAssessment = {
  AUTH_REQUIRED_FOR_PILOT_TARGET: typeof AUTH_REQUIRED_FOR_PILOT_TARGET;
  createFakeAuthUser: "forbidden";
  uidFieldAlignment: "recommended_when_uid_present_equals_documentId";
  rationale: string;
};

export function assessAuthDependencyForPilot(): AuthPilotDependencyAssessment {
  return {
    AUTH_REQUIRED_FOR_PILOT_TARGET,
    createFakeAuthUser: "forbidden",
    uidFieldAlignment: "recommended_when_uid_present_equals_documentId",
    rationale:
      "Phase 5A Driver Controlled Write pipeline never calls Auth. Synthetic " +
      "document ids use test_/qa_ prefixes (not Firebase Auth UIDs). Creating a " +
      "fake Auth user is forbidden. If a uid field is present on the Firestore " +
      "doc, it SHOULD equal documentId to avoid authUidKnowledge=mismatch in " +
      "read metrics — but Auth user existence is not required for the Pilot " +
      "mutation itself.",
  };
}
