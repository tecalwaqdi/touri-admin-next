/**
 * Phase 4A-7 — safe live-window customer mapping diagnostics.
 * Never includes raw phone, email, address, FCM, device, bank, password, or URLs.
 */

import type {
  CanonicalCustomerReadModel,
  CustomerMappingStatus,
} from "@/domain/canonical/CanonicalReadModels";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { isTestOrNoncanonicalCustomer } from "@/domain/customer/CustomerDuplicateIdentityAudit";
import type {
  AuthoritativeCustomerRole,
  CustomerRoleEvidenceKind,
} from "@/domain/customer/CustomerRoleClassification";

export type CustomerTestClassification =
  | "operational"
  | "testOrNoncanonical"
  | "excludedNonCustomer"
  | "excludedUnknownIdentity";

export type CustomerCountryMappingDiag =
  | "mapped"
  | "unmapped"
  | "missing"
  | "not_represented"
  | "testOrNoncanonical"
  | "excludedNonCustomer"
  | "excludedUnknownIdentity"
  | "malformed"
  | "not_applicable";

export type CustomerMappingDiagnostic = {
  sourceDocumentId: string;
  customerCandidate: boolean;
  hasPositiveCustomerEvidence: boolean;
  authoritativeRole: AuthoritativeCustomerRole | string;
  roleEvidenceKind: CustomerRoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  sourceCountryReferenceId: string | null;
  accountState: string;
  mappingStatus: CustomerMappingStatus;
  testClassification: CustomerTestClassification;
  countryMapping: CustomerCountryMappingDiag;
  geographyRepresentation: string;
};

export type CustomerLiveClosingStats = {
  unmappedCountry: number;
  unknownDiscriminator: number;
  malformed: number;
  exactDocumentIdDuplicates: number;
  unexpectedCollections: number;
  productionWrites: number;
  excludedNonCustomer: number;
  excludedNonCustomerWithoutEvidence: number;
  /** Allowed partition bucket — not a closing NO-GO by itself. */
  excludedUnknownIdentity?: number;
};

export function customerLiveClosingGatesPass(
  stats: CustomerLiveClosingStats,
): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.unknownDiscriminator === 0 &&
    stats.malformed === 0 &&
    stats.exactDocumentIdDuplicates === 0 &&
    stats.unexpectedCollections === 0 &&
    stats.productionWrites === 0 &&
    stats.excludedNonCustomerWithoutEvidence === 0
  );
}

function refIdFromPathOrValue(
  pathOrId: string | null | undefined,
): string | null {
  if (pathOrId == null || !String(pathOrId).trim()) return null;
  const extracted = extractLegacyDocRefId(pathOrId);
  if (extracted) return extracted;
  const trimmed = String(pathOrId).trim();
  return trimmed.length ? trimmed : null;
}

export function assessCustomerCountryMapping(input: {
  sourceCountryReferenceId: string | null;
  mappingStatus: CustomerMappingStatus;
  testClassification: CustomerTestClassification;
  geographyRepresentation: string;
}): CustomerCountryMappingDiag {
  if (input.mappingStatus === "excludedNonCustomer") {
    return "excludedNonCustomer";
  }
  if (input.mappingStatus === "excludedUnknownIdentity") {
    return "excludedUnknownIdentity";
  }
  if (input.mappingStatus === "malformed") {
    return "malformed";
  }
  if (input.testClassification === "testOrNoncanonical") {
    return "testOrNoncanonical";
  }
  if (
    input.mappingStatus === "geographyNotRepresented" ||
    input.geographyRepresentation === "not_represented"
  ) {
    return "not_represented";
  }
  if (!input.sourceCountryReferenceId) {
    return "missing";
  }
  if (
    input.mappingStatus === "unmappedCountry" ||
    resolveCanonicalCountryId(input.sourceCountryReferenceId).status !==
      "mapped"
  ) {
    return "unmapped";
  }
  return "mapped";
}

export function buildCustomerMappingDiagnostic(input: {
  sourceDocumentId: string;
  customerCandidate: boolean;
  hasPositiveCustomerEvidence: boolean;
  authoritativeRole: AuthoritativeCustomerRole | string;
  roleEvidenceKind: CustomerRoleEvidenceKind | string;
  sourceCountryReferencePath: string | null;
  accountState: string;
  mappingStatus: CustomerMappingStatus;
  testClassification: CustomerTestClassification;
  geographyRepresentation: string;
}): CustomerMappingDiagnostic {
  const sourceCountryReferenceId = refIdFromPathOrValue(
    input.sourceCountryReferencePath,
  );
  return {
    sourceDocumentId: input.sourceDocumentId,
    customerCandidate: input.customerCandidate,
    hasPositiveCustomerEvidence: input.hasPositiveCustomerEvidence,
    authoritativeRole: input.authoritativeRole,
    roleEvidenceKind: input.roleEvidenceKind,
    sourceCountryReferencePath: input.sourceCountryReferencePath,
    sourceCountryReferenceId,
    accountState: input.accountState,
    mappingStatus: input.mappingStatus,
    testClassification: input.testClassification,
    geographyRepresentation: input.geographyRepresentation,
    countryMapping: assessCustomerCountryMapping({
      sourceCountryReferenceId,
      mappingStatus: input.mappingStatus,
      testClassification: input.testClassification,
      geographyRepresentation: input.geographyRepresentation,
    }),
  };
}

export function diagnosticFromCanonicalCustomer(
  model: CanonicalCustomerReadModel,
): CustomerMappingDiagnostic {
  const testClassification: CustomerTestClassification =
    model.mappingStatus === "testOrNoncanonical"
      ? "testOrNoncanonical"
      : model.mappingStatus === "excludedNonCustomer"
        ? "excludedNonCustomer"
        : model.mappingStatus === "excludedUnknownIdentity"
          ? "excludedUnknownIdentity"
          : "operational";
  return buildCustomerMappingDiagnostic({
    sourceDocumentId: model.sourceDocumentId,
    customerCandidate: model.isCustomerCandidate,
    hasPositiveCustomerEvidence: model.hasPositiveCustomerEvidence,
    authoritativeRole: model.authoritativeRole,
    roleEvidenceKind: model.roleEvidenceKind,
    sourceCountryReferencePath: model.countrySourcePath,
    accountState: model.accountState,
    mappingStatus: model.mappingStatus,
    testClassification,
    geographyRepresentation: model.geographyRepresentation,
  });
}

export function selectCustomerDiagnosticsForLiveSummary(
  models: CanonicalCustomerReadModel[],
): CustomerMappingDiagnostic[] {
  const interesting = new Set<CustomerMappingStatus>([
    "unmappedCountry",
    "unmappedCity",
    "geographyNotRepresented",
    "malformed",
    "unknownDiscriminator",
    "testOrNoncanonical",
    "excludedNonCustomer",
    "excludedUnknownIdentity",
  ]);
  return models
    .filter((m) => interesting.has(m.mappingStatus))
    .map(diagnosticFromCanonicalCustomer);
}

export function classifyCustomerTestFromSource(input: {
  documentId: string;
  data: Record<string, unknown>;
  countryId?: string | null;
}): Exclude<
  CustomerTestClassification,
  "excludedNonCustomer" | "excludedUnknownIdentity"
> {
  return isTestOrNoncanonicalCustomer(input)
    ? "testOrNoncanonical"
    : "operational";
}

export function customerLiveReportHasSensitiveLeak(
  serialized: string,
): boolean {
  return (
    /firebasestorage\.googleapis\.com/i.test(serialized) ||
    /Bearer\s+\S+/i.test(serialized) ||
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(serialized) ||
    /BEGIN (RSA )?PRIVATE KEY/i.test(serialized) ||
    /\+966\d{8,}/.test(serialized) ||
    /phone_number/i.test(serialized) ||
    /fcm_token/i.test(serialized) ||
    /password/i.test(serialized) ||
    /iban/i.test(serialized) ||
    /adresslist/i.test(serialized)
  );
}

export function formatCustomerMappingNoGoMessage(
  diagnostics: CustomerMappingDiagnostic[],
): string {
  const parts = diagnostics
    .filter((d) =>
      [
        "unmappedCountry",
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
      return `${d.sourceDocumentId} status=${d.mappingStatus} role=${d.authoritativeRole} country=${country} countryMapping=${d.countryMapping} account=${d.accountState} test=${d.testClassification}`;
    });
  return `NO-GO: customer mapping gate failed — ${parts.join("; ") || "blocking mapping stats"}`;
}

/** True when exclusion carries authoritative Firestore role evidence. */
export function excludedNonCustomerHasAuthoritativeEvidence(
  d: Pick<
    CustomerMappingDiagnostic,
    "mappingStatus" | "roleEvidenceKind" | "authoritativeRole"
  >,
): boolean {
  if (d.mappingStatus !== "excludedNonCustomer") return false;
  if (d.roleEvidenceKind === "none") return false;
  return [
    "super_admin",
    "finance",
    "partner",
    "transport",
    "country_admin",
    "tour_guide",
    "driver",
    "agent",
  ].includes(String(d.authoritativeRole));
}
