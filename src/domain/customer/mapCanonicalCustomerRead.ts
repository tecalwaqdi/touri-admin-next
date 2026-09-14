/**
 * Phase 4A-7 — map Legacy user/{id} → CanonicalCustomerReadModel.
 *
 * Membership:
 *   isCustomerCandidate = !ismndob/!ismndom/!Isagent (exclusionary — NOT Customer proof)
 *   hasPositiveCustomerEvidence = signup / inventory CUSTOMER residual fields
 *   isOperationalCustomer = candidate && positive && !knownOtherRole
 *   no positive + no known other role → excludedUnknownIdentity (not geography)
 *
 * Geography ONLY after operational membership proven.
 * Rev_dolh → countries; mndob_vill → villages ONLY when DocumentReference.
 * Never invent country/city from phone, language, GPS, email, currency, name, city_display text.
 * Optional geography (signup often omits Rev_dolh) → geographyNotRepresented.
 * No order N+1 — tripLockHint from user-doc active_order_id only.
 * PII: masked hints only; provenance never stores raw phone/email.
 */

import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import {
  resolveCityId,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  CanonicalCustomerReadModel,
  CustomerMappingStatus,
  Provenanced,
} from "@/domain/canonical/CanonicalReadModels";
import {
  mapCustomerAccountState,
  mapCustomerTripLockHint,
} from "@/domain/customer/CustomerAccountSemantics";
import { summarizeCustomerFinancialPresence } from "@/domain/customer/CustomerFinancialFieldNotes";
import { isTestOrNoncanonicalCustomer } from "@/domain/customer/CustomerDuplicateIdentityAudit";
import { classifyCustomerMembership } from "@/domain/customer/CustomerRoleClassification";
import {
  extractCustomerEmailRaw,
  extractCustomerPhoneRaw,
  maskCustomerEmailHint,
  maskCustomerPhoneHint,
} from "@/domain/customer/CustomerContactHints";
import { LEGACY_MAPPING_VERSION } from "@/domain/production-read/constants";
import type { MappingWarning } from "@/infrastructure/production/contracts/LegacyMappers";

function proven<T>(
  value: T | null,
  source: {
    collection: string;
    documentId: string;
    field: string | null;
    sourceValue: unknown;
    confidence?: MappingConfidence;
    warnings?: string[];
  },
): Provenanced<T> {
  return {
    value,
    provenance: {
      sourceSystem: "legacy",
      sourceCollection: source.collection,
      sourceDocumentId: source.documentId,
      sourceField: source.field,
      sourceValue: source.sourceValue as T | null,
      mappingConfidence:
        source.confidence ?? (value == null ? "unknown" : "medium"),
      mappingVersion: LEGACY_MAPPING_VERSION,
      warnings: source.warnings ?? [],
      availabilityStatus: value == null ? "missing" : "available",
    },
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function refPath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object" && value && "path" in value) {
    const p = (value as { path?: unknown }).path;
    return typeof p === "string" && p.trim() ? p.trim() : null;
  }
  return null;
}

function iso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (
    typeof v === "object" &&
    v &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export type MapCanonicalCustomerInput = {
  documentId: string;
  data: Record<string, unknown>;
  aliases?: CityAliasEntry[];
};

export type MapCanonicalCustomerResult = {
  model: CanonicalCustomerReadModel;
  mappingWarnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
};

export function mapCanonicalCustomerFromLegacyDoc(
  input: MapCanonicalCustomerInput,
): MapCanonicalCustomerResult {
  const docId = input.documentId?.trim() ?? "";
  const data = input.data ?? {};
  const warnings: MappingWarning[] = [];
  const incompleteReasons: string[] = [];

  if (!docId) {
    incompleteReasons.push("missing_document_id");
  }

  const membership = classifyCustomerMembership(data);
  if (!membership.isCustomerCandidate) {
    incompleteReasons.push("not_customer_discriminator");
  }
  if (membership.isContaminatingNonCustomerIdentity) {
    warnings.push({
      code: "customer_role_contamination",
      field: membership.roleEvidenceKind,
      message: `Non-customer identity ${membership.authoritativeRole} excluded from Customer domain`,
      severity: "info",
    });
  }
  if (membership.isDriverPersona || membership.isAgentPersona) {
    warnings.push({
      code: "customer_persona_excluded",
      field: membership.roleEvidenceKind,
      message: `${membership.authoritativeRole} persona on shared user collection — excludedNonCustomer`,
      severity: "info",
    });
  }

  // Identity: sourceDocumentId vs authUid
  const uidField = str(data.uid);
  const authUid: string | null = uidField;
  let authUidKnowledge: CanonicalCustomerReadModel["authUidKnowledge"] =
    "missing";
  if (uidField) {
    if (uidField === docId) {
      authUidKnowledge = "known";
    } else {
      authUidKnowledge = "mismatch";
      warnings.push({
        code: "auth_uid_mismatch",
        field: "uid",
        message: "uid field differs from Firestore document id",
        severity: "warning",
      });
    }
  } else if (Object.prototype.hasOwnProperty.call(data, "uid")) {
    authUidKnowledge = "unknown";
  }

  const accountState = mapCustomerAccountState(data);
  const tripLockHint = mapCustomerTripLockHint(data);
  const financial = summarizeCustomerFinancialPresence(data);

  // Geography — Rev_dolh ONLY for country; mndob_vill DocumentReference ONLY for city.
  // Never invent from city_display / SuggestedPlaceCity / phone / email / language / GPS.
  const rawCountryId = extractLegacyDocRefId(data.Rev_dolh);
  const sourceCountryPath = refPath(data.Rev_dolh);
  let countryId: string | null = null;
  let countryConfidence: MappingConfidence = "unknown";
  let countryMapped = false;
  if (rawCountryId) {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    if (resolved.status === "mapped" && resolved.canonicalCountryId) {
      countryId = resolved.canonicalCountryId;
      countryConfidence = resolved.confidence;
      countryMapped = true;
    } else {
      incompleteReasons.push("countryId_unmapped");
      countryId = rawCountryId;
      countryConfidence = "low";
    }
  }

  const rawCityId = extractLegacyDocRefId(data.mndob_vill);
  const sourceCityPath = refPath(data.mndob_vill);
  let cityId: string | null = null;
  let cityConfidence: MappingConfidence = "unknown";
  let cityMapped = false;
  if (rawCityId) {
    const cityResolved = resolveCityId(rawCityId, input.aliases ?? []);
    if (cityResolved.status === "mapped" && cityResolved.cityId) {
      cityId = cityResolved.cityId;
      cityConfidence = "high";
      cityMapped = true;
    } else {
      incompleteReasons.push("cityId_unmapped");
      cityId = rawCityId;
      cityConfidence = "low";
    }
  }

  // Text city fields are display-only in Admin — never canonical geography.
  if (
    !rawCityId &&
    (str(data.city_display) ||
      str(data.SuggestedPlaceCity) ||
      str(data.city) ||
      str(data.mndob_vill_text) ||
      str(data.vill_text))
  ) {
    warnings.push({
      code: "city_text_not_canonical",
      field: "city_display",
      message:
        "Display city text present but ignored — canonical city requires mndob_vill DocumentReference",
      severity: "info",
    });
  }

  // Geography sequencing: only after operational Customer membership is proven.
  // Missing Rev_dolh on unknown identity must NOT become unmappedCountry.
  let geographyRepresentation: CanonicalCustomerReadModel["geographyRepresentation"] =
    "not_applicable";
  if (!membership.isOperationalCustomer) {
    geographyRepresentation = "not_applicable";
  } else if (!rawCountryId && !rawCityId) {
    // Customer signup often omits Rev_dolh — proven optional by create flows.
    geographyRepresentation = "not_represented";
    incompleteReasons.push("geography_not_represented");
  } else if (rawCountryId && !countryMapped) {
    geographyRepresentation = "unmapped";
  } else if (countryMapped && rawCityId && !cityMapped) {
    geographyRepresentation = "partial";
  } else if (countryMapped && !rawCityId) {
    geographyRepresentation = "partial";
  } else if (countryMapped) {
    geographyRepresentation = "mapped";
  }

  const displayName =
    str(data.display_name) ?? str(data.displayName) ?? str(data.name);

  // Masked contact hints only — never put raw in provenance.sourceValue
  const phoneHint = maskCustomerPhoneHint(extractCustomerPhoneRaw(data));
  const emailHint = maskCustomerEmailHint(extractCustomerEmailRaw(data));

  const isTest = isTestOrNoncanonicalCustomer({
    documentId: docId,
    data,
    countryId,
  });

  let mappingStatus: CustomerMappingStatus = "validMapped";
  if (!docId) {
    mappingStatus = "malformed";
  } else if (
    !membership.isCustomerCandidate ||
    membership.isContaminatingNonCustomerIdentity
  ) {
    mappingStatus = "excludedNonCustomer";
  } else if (isTest) {
    mappingStatus = "testOrNoncanonical";
  } else if (!membership.hasPositiveCustomerEvidence) {
    // Exclusionary candidate without positive CUSTOMER evidence — not Customer,
    // not malformed geography. Shared-user unknown identity.
    mappingStatus = "excludedUnknownIdentity";
    incompleteReasons.push("no_positive_customer_evidence");
  } else if (rawCountryId && !countryMapped) {
    // Proven operational Customer with invalid required country ref.
    mappingStatus = "unmappedCountry";
  } else if (rawCityId && countryMapped && !cityMapped) {
    mappingStatus = "unmappedCity";
  } else if (!rawCountryId && !rawCityId) {
    mappingStatus = "geographyNotRepresented";
  } else {
    mappingStatus = "validMapped";
  }

  let mappingConfidence: MappingConfidence = "medium";
  if (mappingStatus === "malformed") {
    mappingConfidence = "low";
  } else if (
    mappingStatus === "excludedNonCustomer" ||
    mappingStatus === "excludedUnknownIdentity"
  ) {
    mappingConfidence = "high";
  } else if (mappingStatus === "validMapped" && countryMapped) {
    mappingConfidence = "high";
  } else if (mappingStatus === "geographyNotRepresented") {
    mappingConfidence = "medium";
  } else if (
    mappingStatus === "unmappedCountry" ||
    mappingStatus === "unmappedCity"
  ) {
    mappingConfidence = "low";
  }

  const model: CanonicalCustomerReadModel = {
    id: docId,
    canonicalCustomerId: docId,
    sourceDocumentId: docId,
    authUid,
    authUidKnowledge,
    legacyCollection: "user",
    source: "legacy_user_customer",
    isCustomer: proven(membership.isOperationalCustomer, {
      collection: "user",
      documentId: docId,
      field: "positive_customer_membership",
      sourceValue: membership.isOperationalCustomer,
      confidence: mappingConfidence,
    }),
    isCustomerCandidate: membership.isCustomerCandidate,
    hasPositiveCustomerEvidence: membership.hasPositiveCustomerEvidence,
    isOperationalCustomer: membership.isOperationalCustomer,
    discriminatorKind: membership.discriminatorKind,
    authoritativeRole: membership.authoritativeRole,
    roleEvidenceKind: membership.roleEvidenceKind,
    displayName: proven(displayName, {
      collection: "user",
      documentId: docId,
      field: "display_name",
      sourceValue: displayName,
    }),
    /** Always masked hint — alias kept for Phase 3.7 callers. */
    phone: proven(phoneHint, {
      collection: "user",
      documentId: docId,
      field: "phone_number",
      sourceValue: phoneHint,
      warnings: phoneHint ? ["pii_redacted_hint"] : [],
    }),
    email: proven(emailHint, {
      collection: "user",
      documentId: docId,
      field: "email",
      sourceValue: emailHint,
      warnings: emailHint ? ["pii_redacted_hint"] : [],
    }),
    phoneHint: proven(phoneHint, {
      collection: "user",
      documentId: docId,
      field: "phone_number",
      sourceValue: phoneHint,
    }),
    emailHint: proven(emailHint, {
      collection: "user",
      documentId: docId,
      field: "email",
      sourceValue: emailHint,
    }),
    verification: proven<string>(null, {
      collection: "user",
      documentId: docId,
      field: null,
      sourceValue: null,
      warnings: ["auth_email_verified_not_queried"],
    }),
    accountState,
    authEnabledKnowledge: "not_queried",
    authEmailVerifiedKnowledge: "not_queried",
    blocked: proven(
      accountState === "disabled"
        ? true
        : accountState === "enabled"
          ? false
          : null,
      {
        collection: "user",
        documentId: docId,
        field: "actev_user",
        sourceValue:
          accountState === "unknown" ? null : accountState === "disabled",
      },
    ),
    countryId: proven(countryId, {
      collection: "user",
      documentId: docId,
      field: "Rev_dolh",
      sourceValue: countryId,
      confidence: countryConfidence,
    }),
    countrySourcePath: sourceCountryPath,
    cityId: proven(cityId, {
      collection: "user",
      documentId: docId,
      field: "mndob_vill",
      sourceValue: cityId,
      confidence: cityConfidence,
    }),
    citySourcePath: sourceCityPath,
    geographyRepresentation,
    tripLockHint,
    financial: {
      fieldsPresent: financial.fieldsPresent,
      fieldsMissing: financial.fieldsMissing,
      bookingsCountKnown: financial.bookingsCountKnown,
      bookingsCount: financial.bookingsCount,
      isAccountingApproved: false,
      isSettlementSafe: false,
      isAuthoritative: false,
    },
    createdAtUtc: proven(
      iso(data.created_time ?? data.created_at ?? data.createdAt),
      {
        collection: "user",
        documentId: docId,
        field: "created_time",
        sourceValue: iso(data.created_time ?? data.created_at ?? data.createdAt),
      },
    ),
    lastActivityAtUtc: proven(
      iso(
        data.last_login_at ??
          data.lastLoginAt ??
          data.last_activity_at ??
          data.lastActivityAtUtc,
      ),
      {
        collection: "user",
        documentId: docId,
        field: "last_login_at",
        sourceValue: iso(
          data.last_login_at ?? data.lastLoginAt ?? data.last_activity_at,
        ),
      },
    ),
    mappingStatus,
    incompleteReasons,
    mappingConfidence,
    mappingVersion: LEGACY_MAPPING_VERSION,
    statusWarnings: warnings.map((w) => w.code),
  };

  return {
    model,
    mappingWarnings: warnings,
    mappingConfidence,
  };
}
