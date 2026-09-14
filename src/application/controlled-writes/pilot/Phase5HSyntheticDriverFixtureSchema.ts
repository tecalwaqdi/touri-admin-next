/**
 * Phase 5H — exact typed fixture schema for dedicated synthetic Production Driver.
 * PREPARATION ONLY. Uses ONLY proven Legacy Driver registration/mapping fields.
 * Does NOT create the document. Compatible with Phase 5F/5G Pilot eligibility.
 */

import { classifyDriverMembership } from "@/domain/driver/DriverRoleClassification";
import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { resolveCityId } from "@/domain/geography/CityAliasResolver";
import { classifyProvenSyntheticDriver } from "@/application/controlled-writes/pilot/Phase5FProvenSyntheticClassification";
import { evaluateSyntheticPilotTargetEligibility } from "@/application/controlled-writes/pilot/Phase5FSyntheticTargetEligibility";
import { buildPhase5GInventoryRecord } from "@/application/controlled-writes/pilot/Phase5GInventoryRecord";
import {
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";

/** Closed canonical geography — countryMapping=mapped, cityMapping=mapped. */
export const PHASE_5H_FIXTURE_COUNTRY_ID = "saudi_arabia" as const;
export const PHASE_5H_FIXTURE_CITY_ID = "city_sa_riyadh" as const;
export const PHASE_5H_FIXTURE_COUNTRY_PATH =
  `countries/${PHASE_5H_FIXTURE_COUNTRY_ID}` as const;
export const PHASE_5H_FIXTURE_CITY_PATH =
  `villages/${PHASE_5H_FIXTURE_CITY_ID}` as const;

/**
 * Exact typed create payload — NOT Record<string, unknown>.
 * Path refs stored as Legacy path strings (Functions hydrateCreate converts
 * path strings with "/" to DocumentReference when using createPanelUser;
 * Admin Next fixture plan stores path-shaped refs as { path, id } snapshots
 * matching proven 4A-5 / 5F / 5G read shapes).
 */
export type Phase5HSyntheticDriverFixtureDoc = {
  readonly ismndob: true;
  readonly registration_status: "pending_review";
  readonly actev_mndob: false;
  readonly is_test: true;
  readonly functional_test: true;
  readonly qa_fixture: true;
  /** Explicit idle — absent busy flags → tripState=unknown (5G fail-closed). */
  readonly on_trip: false;
  readonly mndon_newacc: false;
  readonly is_online: false;
  readonly Rev_dolh: {
    readonly path: typeof PHASE_5H_FIXTURE_COUNTRY_PATH;
    readonly id: typeof PHASE_5H_FIXTURE_COUNTRY_ID;
  };
  readonly mndob_vill: {
    readonly path: typeof PHASE_5H_FIXTURE_CITY_PATH;
    readonly id: typeof PHASE_5H_FIXTURE_CITY_ID;
  };
};

/** Forbidden fields — must not appear on fixture create allowlist. */
export const PHASE_5H_FIXTURE_FORBIDDEN_FIELDS = [
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
  "uid", // omit — Auth UID alignment would imply Auth dependency
  "photo_url",
  "ID_image",
  "license_image",
  "car_image",
  "fcm_token",
] as const;

export type Phase5HFixtureForbiddenField =
  (typeof PHASE_5H_FIXTURE_FORBIDDEN_FIELDS)[number];

/**
 * Exact fixture document — operator create target (future; NOT written in 5H).
 * No real PII. No Storage uploads. No Auth / wallet / trip / finance fields.
 */
export const PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC: Phase5HSyntheticDriverFixtureDoc =
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
      path: PHASE_5H_FIXTURE_COUNTRY_PATH,
      id: PHASE_5H_FIXTURE_COUNTRY_ID,
    },
    mndob_vill: {
      path: PHASE_5H_FIXTURE_CITY_PATH,
      id: PHASE_5H_FIXTURE_CITY_ID,
    },
  };

export type Phase5HGeographyChoice = {
  countryId: typeof PHASE_5H_FIXTURE_COUNTRY_ID;
  cityId: typeof PHASE_5H_FIXTURE_CITY_ID;
  countryMapping: "mapped";
  cityMapping: "mapped";
  countryPath: typeof PHASE_5H_FIXTURE_COUNTRY_PATH;
  cityPath: typeof PHASE_5H_FIXTURE_CITY_PATH;
};

export function resolvePhase5HFixtureGeography(): Phase5HGeographyChoice {
  const country = resolveCanonicalCountryId(PHASE_5H_FIXTURE_COUNTRY_ID);
  const city = resolveCityId(PHASE_5H_FIXTURE_CITY_ID);
  if (country.status !== "mapped" || country.canonicalCountryId == null) {
    throw new Error("PHASE_5H country must resolve mapped");
  }
  if (city.status !== "mapped" || city.cityId == null) {
    throw new Error("PHASE_5H city must resolve mapped");
  }
  return {
    countryId: PHASE_5H_FIXTURE_COUNTRY_ID,
    cityId: PHASE_5H_FIXTURE_CITY_ID,
    countryMapping: "mapped",
    cityMapping: "mapped",
    countryPath: PHASE_5H_FIXTURE_COUNTRY_PATH,
    cityPath: PHASE_5H_FIXTURE_CITY_PATH,
  };
}

/** Unavoidable synthetic placeholders — none required beyond boolean/geo markers. */
export const PHASE_5H_PII_POLICY = {
  realPiiAllowed: false,
  storageUploads: "forbidden" as const,
  unavoidableSyntheticPlaceholders: [] as const,
  notes:
    "No display_name / email / phone / national ID / bank / images. " +
    "Synthetic markers are booleans + document id prefix only. " +
    "needs_changes Pilot does not require Storage documents.",
} as const;

export type Phase5HFixturePilotCompatibility = {
  synthetic: true;
  operationalDriver: true;
  pending_review: true;
  safePilotEligible: true;
  plannedAction: "needs_changes";
  phase5FEligible: true;
  phase5GSafePilotEligible: true;
};

/**
 * Assert future Pilot compatibility (5F eligibility + 5G inventory SAFE path).
 * Runs offline against the typed fixture doc — no Production I/O.
 */
export function assertPhase5HFixturePilotCompatibility(
  documentId: string = PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  data: Phase5HSyntheticDriverFixtureDoc = PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
): Phase5HFixturePilotCompatibility {
  const asRecord = data as unknown as Record<string, unknown>;
  const membership = classifyDriverMembership(asRecord);
  if (!membership.isOperationalDriver) {
    throw new Error("Fixture must classify as operational Driver");
  }

  const proven = classifyProvenSyntheticDriver({ documentId, data: asRecord });
  if (!proven.ok) {
    throw new Error("Fixture must classify as proven synthetic");
  }
  if (
    !isTestOrNoncanonicalDriver({
      documentId,
      data: asRecord,
      countryId: PHASE_5H_FIXTURE_COUNTRY_ID,
    })
  ) {
    throw new Error("Fixture must pass isTestOrNoncanonicalDriver");
  }

  const eligibility = evaluateSyntheticPilotTargetEligibility({
    documentId,
    data: asRecord,
  });
  if (!eligibility.eligible) {
    throw new Error(
      `Fixture not 5F eligible: ${eligibility.denials.join(",")}`,
    );
  }

  const inventory = buildPhase5GInventoryRecord({
    documentId,
    data: asRecord,
  });
  if (!inventory || !inventory.safePilotEligible) {
    throw new Error("Fixture not 5G safePilotEligible");
  }
  if (inventory.registrationStatus !== "pending_review") {
    throw new Error("Fixture registration must be pending_review");
  }

  return {
    synthetic: true,
    operationalDriver: true,
    pending_review: true,
    safePilotEligible: true,
    plannedAction: "needs_changes",
    phase5FEligible: true,
    phase5GSafePilotEligible: true,
  };
}
