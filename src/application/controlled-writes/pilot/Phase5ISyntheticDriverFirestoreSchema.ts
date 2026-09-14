/**
 * Phase 5I — typed Firestore payload for Auth-safe synthetic Driver.
 * Document id = Auth-generated UID (resolved at provision time).
 * Synthetic classification via Firestore markers — NOT id prefix alone.
 * Reuses proven 5H geography + Pilot-compatible field set.
 */

import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { resolveCityId } from "@/domain/geography/CityAliasResolver";
import { classifyProvenSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { evaluateSyntheticPilotTargetEligibility } from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetEligibility";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";

/** Closed canonical geography — countryMapping=mapped, cityMapping=mapped. */
export const PHASE_5I_FIXTURE_COUNTRY_ID = "saudi_arabia" as const;
export const PHASE_5I_FIXTURE_CITY_ID = "city_sa_riyadh" as const;
export const PHASE_5I_FIXTURE_COUNTRY_PATH =
  `countries/${PHASE_5I_FIXTURE_COUNTRY_ID}` as const;
export const PHASE_5I_FIXTURE_CITY_PATH =
  `villages/${PHASE_5I_FIXTURE_CITY_ID}` as const;

/**
 * Exact typed create payload — NOT Record<string, unknown>.
 * Path refs as { path, id } matching proven 4A-5 / 5F / 5G / 5H read shapes.
 * Auth UID alignment: omit embedding uid field; doc id IS the Auth uid.
 */
export type Phase5ISyntheticDriverFirestoreDoc = {
  readonly ismndob: true;
  readonly registration_status: "pending_review";
  readonly actev_mndob: false;
  readonly is_test: true;
  readonly functional_test: true;
  readonly qa_fixture: true;
  readonly on_trip: false;
  readonly mndon_newacc: false;
  readonly is_online: false;
  readonly Rev_dolh: {
    readonly path: typeof PHASE_5I_FIXTURE_COUNTRY_PATH;
    readonly id: typeof PHASE_5I_FIXTURE_COUNTRY_ID;
  };
  readonly mndob_vill: {
    readonly path: typeof PHASE_5I_FIXTURE_CITY_PATH;
    readonly id: typeof PHASE_5I_FIXTURE_CITY_ID;
  };
};

export const PHASE_5I_FIXTURE_FORBIDDEN_FIELDS = [
  "phone_number",
  "phone_n",
  "email",
  "display_name",
  "ID_hoyh_MNDOB",
  "ipanBank",
  "bankIdAcc",
  "bankNaim",
  "banknaimAcc",
  "Outstandingonlinepayment",
  "total_mndob",
  "Isagent",
  "isagent",
  "IsAdmin",
  "isAdmin",
  "isAdminRule",
  "IsAdminRule",
  "is_partner",
  "isPartner",
  "uid",
  "photo_url",
  "ID_image",
  "license_image",
  "car_image",
  "fcm_token",
  "password",
] as const;

export const PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC: Phase5ISyntheticDriverFirestoreDoc =
  {
    ismndob: true,
    registration_status: "pending_review",
    actev_mndob: false,
    is_test: true,
    functional_test: true,
    qa_fixture: true,
    on_trip: false,
    mndon_newacc: false,
    is_online: false,
    Rev_dolh: {
      path: PHASE_5I_FIXTURE_COUNTRY_PATH,
      id: PHASE_5I_FIXTURE_COUNTRY_ID,
    },
    mndob_vill: {
      path: PHASE_5I_FIXTURE_CITY_PATH,
      id: PHASE_5I_FIXTURE_CITY_ID,
    },
  };

export type Phase5IGeographyChoice = {
  countryId: typeof PHASE_5I_FIXTURE_COUNTRY_ID;
  cityId: typeof PHASE_5I_FIXTURE_CITY_ID;
  countryMapping: "mapped";
  cityMapping: "mapped";
  countryPath: typeof PHASE_5I_FIXTURE_COUNTRY_PATH;
  cityPath: typeof PHASE_5I_FIXTURE_CITY_PATH;
};

export function resolvePhase5IFixtureGeography(): Phase5IGeographyChoice {
  const country = resolveCanonicalCountryId(PHASE_5I_FIXTURE_COUNTRY_ID);
  const city = resolveCityId(PHASE_5I_FIXTURE_CITY_ID);
  if (country.status !== "mapped" || country.canonicalCountryId == null) {
    throw new Error("PHASE_5I country must resolve mapped");
  }
  if (city.status !== "mapped" || city.cityId == null) {
    throw new Error("PHASE_5I city must resolve mapped");
  }
  return {
    countryId: PHASE_5I_FIXTURE_COUNTRY_ID,
    cityId: PHASE_5I_FIXTURE_CITY_ID,
    countryMapping: "mapped",
    cityMapping: "mapped",
    countryPath: PHASE_5I_FIXTURE_COUNTRY_PATH,
    cityPath: PHASE_5I_FIXTURE_CITY_PATH,
  };
}

export const PHASE_5I_PII_POLICY = {
  realPiiAllowed: false,
  storageUploads: "forbidden" as const,
  unavoidableSyntheticPlaceholders: [] as const,
  notes:
    "No display_name / email / phone / national ID / bank / images / password. " +
    "Synthetic markers are Firestore booleans. Auth UID is opaque Auth-generated.",
} as const;

export type Phase5IMembershipClassificationResult = {
  authoritativeRole: "DRIVER";
  /** Report alias — same as DRIVER. */
  authoritativeRoleReport: "driver";
  operationalDriver: true;
  synthetic: true;
  pending_review: true;
  safePilotEligible: true;
  plannedAction: "needs_changes";
};

/**
 * Role exclusion + membership: pure Driver, no Admin/Agent/Finance flags.
 * documentId may be Auth-shaped (no test_ prefix) — markers prove synthetic.
 */
export function assertPhase5IMembershipAndSynthetic(input: {
  documentId: string;
  data?: Phase5ISyntheticDriverFirestoreDoc;
}): Phase5IMembershipClassificationResult {
  const data = input.data ?? PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC;
  const asRecord = data as unknown as Record<string, unknown>;

  // Role exclusion — elevated identity fields must be absent.
  for (const f of [
    "IsAdmin",
    "isAdmin",
    "isAdminRule",
    "IsAdminRule",
    "Isagent",
    "isagent",
    "is_partner",
    "isPartner",
  ] as const) {
    if (asRecord[f] != null) {
      throw new Error(`Role exclusion failed: ${f} must be absent`);
    }
  }

  const membership = classifyDriverMembership(asRecord);
  if (!membership.isOperationalDriver) {
    throw new Error("Fixture must classify as operational Driver");
  }
  if (membership.authoritativeRole !== "DRIVER") {
    throw new Error(
      `authoritativeRole must be DRIVER, got ${membership.authoritativeRole}`,
    );
  }

  const proven = classifyProvenSyntheticDriver({
    documentId: input.documentId,
    data: asRecord,
  });
  if (!proven.ok) {
    throw new Error("Fixture must classify as proven synthetic via markers");
  }
  // Auth-generated UIDs lack test_ prefix — markers alone must suffice.
  const markerOnly = proven.markersMatched.filter(
    (m) => m !== "documentId_prefix",
  );
  if (markerOnly.length === 0) {
    throw new Error("Synthetic must not rely on id prefix alone");
  }

  if (
    !isTestOrNoncanonicalDriver({
      documentId: input.documentId,
      data: asRecord,
      countryId: PHASE_5I_FIXTURE_COUNTRY_ID,
    })
  ) {
    throw new Error("Fixture must pass isTestOrNoncanonicalDriver");
  }

  const eligibility = evaluateSyntheticPilotTargetEligibility({
    documentId: input.documentId,
    data: asRecord,
  });
  if (!eligibility.eligible) {
    throw new Error(
      `Fixture not 5F eligible: ${eligibility.denials.join(",")}`,
    );
  }

  const inventory = buildPhase5GInventoryRecord({
    documentId: input.documentId,
    data: asRecord,
  });
  if (!inventory || !inventory.safePilotEligible) {
    throw new Error("Fixture not 5G safePilotEligible");
  }
  if (inventory.registrationStatus !== "pending_review") {
    throw new Error("Fixture registration must be pending_review");
  }

  return {
    authoritativeRole: "DRIVER",
    authoritativeRoleReport: "driver",
    operationalDriver: true,
    synthetic: true,
    pending_review: true,
    safePilotEligible: true,
    plannedAction: "needs_changes",
  };
}

/** Representative Auth-shaped UID for offline classification (not a real user). */
export const PHASE_5I_OFFLINE_AUTH_SHAPED_UID_EXAMPLE =
  "a1b2c3d4e5f6g7h8i9j0k1l2m3n4" as const;
