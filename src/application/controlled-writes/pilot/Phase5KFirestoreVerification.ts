/**
 * Phase 5K — Firestore user/{uid} field verification (read-only).
 */

import {
  PHASE_5I_FIXTURE_CITY_PATH,
  PHASE_5I_FIXTURE_COUNTRY_PATH,
  PHASE_5I_FIXTURE_FORBIDDEN_FIELDS,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";

export type Phase5KFirestoreVerificationResult = {
  readonly firestoreFixtureFound: boolean;
  readonly expectedFieldsMatch: boolean;
  readonly geographyMatch: boolean;
  readonly countryMapped: boolean;
  readonly cityMapped: boolean;
  readonly noPii: boolean;
  readonly noRoleContamination: boolean;
  readonly denials: readonly string[];
};

function refPath(v: unknown): string | null {
  if (v && typeof v === "object" && "path" in v) {
    const p = (v as { path?: unknown }).path;
    return typeof p === "string" ? p : null;
  }
  return null;
}

export function verifyPhase5KFirestoreFixture(
  data: Record<string, unknown> | null,
): Phase5KFirestoreVerificationResult {
  if (!data) {
    return {
      firestoreFixtureFound: false,
      expectedFieldsMatch: false,
      geographyMatch: false,
      countryMapped: false,
      cityMapped: false,
      noPii: false,
      noRoleContamination: false,
      denials: ["FIRESTORE_FIXTURE_NOT_FOUND"],
    };
  }

  const denials: string[] = [];
  const expectedBools: Array<[string, boolean]> = [
    ["ismndob", true],
    ["actev_mndob", false],
    ["is_test", true],
    ["functional_test", true],
    ["qa_fixture", true],
    ["on_trip", false],
    ["mndon_newacc", false],
    ["is_online", false],
  ];
  for (const [k, expected] of expectedBools) {
    if (data[k] !== expected) denials.push(`FIELD_MISMATCH:${k}`);
  }
  if (data.registration_status !== "pending_review") {
    denials.push("FIELD_MISMATCH:registration_status");
  }

  const countryPath = refPath(data.Rev_dolh);
  const cityPath = refPath(data.mndob_vill);
  const countryMapped = countryPath === PHASE_5I_FIXTURE_COUNTRY_PATH;
  const cityMapped = cityPath === PHASE_5I_FIXTURE_CITY_PATH;
  if (!countryMapped) denials.push("COUNTRY_NOT_MAPPED");
  if (!cityMapped) denials.push("CITY_NOT_MAPPED");

  const piiHits = PHASE_5I_FIXTURE_FORBIDDEN_FIELDS.filter((f) => {
    if (
      f === "Isagent" ||
      f === "isagent" ||
      f === "IsAdmin" ||
      f === "isAdmin" ||
      f === "isAdminRule" ||
      f === "IsAdminRule" ||
      f === "is_partner" ||
      f === "isPartner" ||
      f === "uid"
    ) {
      return false; // role checked separately; uid omitted by design
    }
    return (
      Object.prototype.hasOwnProperty.call(data, f) &&
      data[f] != null &&
      data[f] !== ""
    );
  });
  if (piiHits.length > 0) denials.push(`PII_PRESENT:${piiHits.join(",")}`);

  const roleFields = [
    "Isagent",
    "isagent",
    "IsAdmin",
    "isAdmin",
    "isAdminRule",
    "IsAdminRule",
    "is_partner",
    "isPartner",
  ] as const;
  const roleHits = roleFields.filter((f) => data[f] != null);
  if (roleHits.length > 0) {
    denials.push(`ROLE_CONTAMINATION:${roleHits.join(",")}`);
  }

  const expectedFieldsMatch = !denials.some((d) => d.startsWith("FIELD_MISMATCH"));
  return {
    firestoreFixtureFound: true,
    expectedFieldsMatch,
    geographyMatch: countryMapped && cityMapped,
    countryMapped,
    cityMapped,
    noPii: piiHits.length === 0,
    noRoleContamination: roleHits.length === 0,
    denials,
  };
}
