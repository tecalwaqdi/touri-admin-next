/**
 * Phase 4A-5 — safe live-window driver mapping diagnostics.
 * Never includes phone, email, national ID, license, plate, URLs, bank, FCM,
 * raw docs, Auth tokens, or display names.
 */

import type {
  CanonicalDriverReadModel,
  DriverMappingStatus,
} from "@/domain/canonical/CanonicalReadModels";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";
import type {
  AuthoritativeLegacyRole,
  RoleEvidenceKind,
} from "@/domain/driver/DriverRoleClassification";

export type DriverTestClassification =
  | "operational"
  | "testOrNoncanonical"
  | "excludedNonDriver";

export type DriverCountryMappingDiag =
  | "mapped"
  | "unmapped"
  | "missing"
  | "testOrNoncanonical"
  | "excludedNonDriver"
  | "malformed"
  | "not_applicable";

export type DriverCityMappingDiag =
  | "present"
  | "missing"
  | "testOrNoncanonical"
  | "excludedNonDriver"
  | "unmapped"
  | "not_applicable";

/**
 * Safe per-driver diagnostic for live summary / offline root-cause.
 * Paths and document ids only — never PII.
 */
export type DriverMappingDiagnostic = {
  sourceDocumentId: string;
  driverCandidate: boolean;
  authoritativeRole: AuthoritativeLegacyRole | string;
  roleEvidenceKind: RoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  sourceCountryReferenceId: string | null;
  sourceCityReferencePath: string | null;
  sourceCityReferenceId: string | null;
  registrationStatus: string;
  mappingStatus: DriverMappingStatus;
  testClassification: DriverTestClassification;
  countryMapping: DriverCountryMappingDiag;
  cityMapping: DriverCityMappingDiag;
};

export type DriverLiveClosingStats = {
  unmappedCountry: number;
  unmappedCity: number;
  unknownDiscriminator: number;
  malformed: number;
  conflictingRegistration: number;
  activeOperationalDuplicates: number;
  exactDocumentIdDuplicates: number;
  unexpectedCollections: number;
  productionWrites: number;
  /** Exclusions with authoritative role evidence do not block close. */
  excludedNonDriver: number;
  excludedNonDriverWithoutEvidence: number;
};

/** Closing gates for Drivers live window — unmappedCountry must fail close. */
export function driverLiveClosingGatesPass(
  stats: DriverLiveClosingStats,
): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.unmappedCity === 0 &&
    stats.unknownDiscriminator === 0 &&
    stats.malformed === 0 &&
    stats.conflictingRegistration === 0 &&
    stats.activeOperationalDuplicates === 0 &&
    stats.exactDocumentIdDuplicates === 0 &&
    stats.unexpectedCollections === 0 &&
    stats.productionWrites === 0 &&
    stats.excludedNonDriverWithoutEvidence === 0
  );
}

function refIdFromPathOrValue(pathOrId: string | null | undefined): string | null {
  if (pathOrId == null || !String(pathOrId).trim()) return null;
  const extracted = extractLegacyDocRefId(pathOrId);
  if (extracted) return extracted;
  const trimmed = String(pathOrId).trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Independent country/city assessment — country failure must not hide city presence.
 * Geography is not_applicable for excludedNonDriver (admin contamination).
 */
export function assessDriverRelationMappings(input: {
  sourceCountryReferenceId: string | null;
  sourceCityReferenceId: string | null;
  mappingStatus: DriverMappingStatus;
  testClassification: DriverTestClassification;
}): {
  countryMapping: DriverCountryMappingDiag;
  cityMapping: DriverCityMappingDiag;
} {
  if (input.mappingStatus === "excludedNonDriver") {
    return {
      countryMapping: "excludedNonDriver",
      cityMapping: "excludedNonDriver",
    };
  }

  let countryMapping: DriverCountryMappingDiag;
  if (input.mappingStatus === "malformed") {
    countryMapping = "malformed";
  } else if (input.testClassification === "testOrNoncanonical") {
    countryMapping = "testOrNoncanonical";
  } else if (!input.sourceCountryReferenceId) {
    countryMapping = "missing";
  } else if (
    input.mappingStatus === "unmappedCountry" ||
    resolveCanonicalCountryId(input.sourceCountryReferenceId).status !== "mapped"
  ) {
    countryMapping = "unmapped";
  } else {
    countryMapping = "mapped";
  }

  let cityMapping: DriverCityMappingDiag;
  if (input.testClassification === "testOrNoncanonical") {
    cityMapping = "testOrNoncanonical";
  } else if (!input.sourceCityReferenceId) {
    cityMapping = "missing";
  } else if (input.mappingStatus === "unmappedCity") {
    cityMapping = "unmapped";
  } else {
    cityMapping = "present";
  }

  return { countryMapping, cityMapping };
}

export function buildDriverMappingDiagnostic(input: {
  sourceDocumentId: string;
  driverCandidate: boolean;
  authoritativeRole: AuthoritativeLegacyRole | string;
  roleEvidenceKind: RoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  sourceCityReferencePath: string | null;
  registrationStatus: string;
  mappingStatus: DriverMappingStatus;
  testClassification: DriverTestClassification;
}): DriverMappingDiagnostic {
  const sourceCountryReferenceId = refIdFromPathOrValue(
    input.sourceCountryReferencePath,
  );
  const sourceCityReferenceId = refIdFromPathOrValue(
    input.sourceCityReferencePath,
  );
  const relations = assessDriverRelationMappings({
    sourceCountryReferenceId,
    sourceCityReferenceId,
    mappingStatus: input.mappingStatus,
    testClassification: input.testClassification,
  });
  return {
    sourceDocumentId: input.sourceDocumentId,
    driverCandidate: input.driverCandidate,
    authoritativeRole: input.authoritativeRole,
    roleEvidenceKind: input.roleEvidenceKind,
    sourceCountryReferencePath: input.sourceCountryReferencePath,
    sourceCountryReferenceId,
    sourceCityReferencePath: input.sourceCityReferencePath,
    sourceCityReferenceId,
    registrationStatus: input.registrationStatus,
    mappingStatus: input.mappingStatus,
    testClassification: input.testClassification,
    countryMapping: relations.countryMapping,
    cityMapping: relations.cityMapping,
  };
}

/** Build safe diagnostic from canonical model (no PII fields copied). */
export function diagnosticFromCanonicalDriver(
  model: CanonicalDriverReadModel,
): DriverMappingDiagnostic {
  const testClassification: DriverTestClassification =
    model.mappingStatus === "testOrNoncanonical"
      ? "testOrNoncanonical"
      : model.mappingStatus === "excludedNonDriver"
        ? "excludedNonDriver"
        : "operational";
  return buildDriverMappingDiagnostic({
    sourceDocumentId: model.sourceDocumentId,
    driverCandidate: model.isDriverCandidate,
    authoritativeRole: model.authoritativeRole,
    roleEvidenceKind: model.roleEvidenceKind,
    sourceCountryReferencePath: model.countrySourcePath,
    sourceCityReferencePath: model.citySourcePath,
    registrationStatus: model.registrationStatus,
    mappingStatus: model.mappingStatus,
    testClassification,
  });
}

/**
 * Diagnostics to surface on live summary: blocking mapping + test/noncanonical
 * + role contamination (for independent verification). Never PII.
 */
export function selectDriverDiagnosticsForLiveSummary(
  models: CanonicalDriverReadModel[],
): DriverMappingDiagnostic[] {
  const interesting = new Set<DriverMappingStatus>([
    "unmappedCountry",
    "unmappedCity",
    "malformed",
    "unknownDiscriminator",
    "testOrNoncanonical",
    "excludedNonDriver",
  ]);
  return models
    .filter((m) => interesting.has(m.mappingStatus))
    .map(diagnosticFromCanonicalDriver);
}

/** Offline helper: classify test markers without inventing country. */
export function classifyDriverTestFromSource(input: {
  documentId: string;
  data: Record<string, unknown>;
  countryId?: string | null;
}): Exclude<DriverTestClassification, "excludedNonDriver"> {
  return isTestOrNoncanonicalDriver(input)
    ? "testOrNoncanonical"
    : "operational";
}

export function driverLiveReportHasSensitiveLeak(serialized: string): boolean {
  return (
    /firebasestorage\.googleapis\.com/i.test(serialized) ||
    /Bearer\s+\S+/i.test(serialized) ||
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(serialized) ||
    /BEGIN (RSA )?PRIVATE KEY/i.test(serialized) ||
    /\+966\d{8,}/.test(serialized) ||
    /phone_number/i.test(serialized) ||
    /ID_hoyh_MNDOB/i.test(serialized) ||
    /ipanBank/i.test(serialized) ||
    /number_lohh_car/i.test(serialized)
  );
}

export function formatDriverMappingNoGoMessage(
  diagnostics: DriverMappingDiagnostic[],
): string {
  const parts = diagnostics
    .filter((d) =>
      [
        "unmappedCountry",
        "unmappedCity",
        "malformed",
        "unknownDiscriminator",
      ].includes(d.mappingStatus),
    )
    .map((d) => {
      const country =
        d.sourceCountryReferencePath ??
        (d.sourceCountryReferenceId
          ? `countries/${d.sourceCountryReferenceId}`
          : "(missing Rev_dolh)");
      const city =
        d.sourceCityReferencePath ??
        (d.sourceCityReferenceId
          ? `villages/${d.sourceCityReferenceId}`
          : "(missing mndob_vill)");
      return `${d.sourceDocumentId} status=${d.mappingStatus} role=${d.authoritativeRole} country=${country} city=${city} countryMapping=${d.countryMapping} test=${d.testClassification}`;
    });
  return `NO-GO: driver mapping gate failed — ${parts.join("; ") || "blocking mapping stats"}`;
}

/** True when exclusion carries authoritative Firestore role evidence. */
export function excludedNonDriverHasAuthoritativeEvidence(
  d: Pick<DriverMappingDiagnostic, "mappingStatus" | "roleEvidenceKind" | "authoritativeRole">,
): boolean {
  if (d.mappingStatus !== "excludedNonDriver") return false;
  if (d.roleEvidenceKind === "none") return false;
  return [
    "SUPERADMIN",
    "FINANCE",
    "COUNTRY_ADMIN",
    "PARTNER",
    "TRANSPORT_MANAGER",
  ].includes(String(d.authoritativeRole));
}
