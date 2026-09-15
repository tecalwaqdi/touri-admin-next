/**
 * Phase 4A-5 — map Legacy user/{id} (ismndob) → CanonicalDriverReadModel.
 *
 * Geography: Rev_dolh → countries; mndob_vill → villages (product city).
 * Never invent country/city from GPS (loceshn*) or phone.
 * No order ActiveOrder N+1 — tripState from user-doc flags only.
 */

import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import {
  resolveCityId,
  type CityAliasEntry,
} from "@/domain/geography/CityAliasResolver";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";
import type {
  CanonicalDriverReadModel,
  DriverMappingStatus,
  Provenanced,
} from "@/domain/canonical/CanonicalReadModels";
import { mapDriverCanonicalStatuses } from "@/domain/driver/DriverCanonicalStatuses";
import { buildDriverComplianceSafeSummary } from "@/domain/driver/DriverComplianceSummary";
import { buildDriverVehicleSafeSummary } from "@/domain/driver/DriverVehicleSafeSummary";
import { summarizeDriverFinancialPresence } from "@/domain/driver/DriverFinancialFieldNotes";
import { isTestOrNoncanonicalDriver } from "@/domain/driver/DriverDuplicateIdentityAudit";
import {
  classifyDriverMembership,
  hasConflictingDriverRegistration,
} from "@/domain/driver/DriverRoleClassification";
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

export type MapCanonicalDriverInput = {
  documentId: string;
  data: Record<string, unknown>;
  aliases?: CityAliasEntry[];
};

export type MapCanonicalDriverResult = {
  model: CanonicalDriverReadModel;
  mappingWarnings: MappingWarning[];
  mappingConfidence: MappingConfidence;
};

export function mapCanonicalDriverFromLegacyDoc(
  input: MapCanonicalDriverInput,
): MapCanonicalDriverResult {
  const docId = input.documentId?.trim() ?? "";
  const data = input.data ?? {};
  const warnings: MappingWarning[] = [];
  const incompleteReasons: string[] = [];

  if (!docId) {
    incompleteReasons.push("missing_document_id");
  }

  const membership = classifyDriverMembership(data);
  if (!membership.isDriverCandidate) {
    incompleteReasons.push("not_driver_discriminator");
  }
  if (membership.discriminatorField === "ismndom") {
    warnings.push({
      code: "driver_discriminator_ismndom",
      field: "ismndom",
      message:
        "Driver matched via ismndom typo alias — primary Admin list uses ismndob==true",
      severity: "warning",
    });
  }
  if (membership.isKnownAdministrativeIdentity) {
    warnings.push({
      code: "driver_role_contamination",
      field: membership.roleEvidenceKind,
      message: `Administrative identity ${membership.authoritativeRole} excluded from Driver domain`,
      severity: "info",
    });
  }
  if (hasConflictingDriverRegistration(data)) {
    incompleteReasons.push("conflicting_registration");
    warnings.push({
      code: "driver_conflicting_registration",
      field: "registration_status",
      message: "registration_status and submission_status disagree",
      severity: "warning",
    });
  }

  const axes = mapDriverCanonicalStatuses({
    registration_status: str(data.registration_status),
    submission_status: str(data.submission_status),
    actev_mndob: typeof data.actev_mndob === "boolean" ? data.actev_mndob : null,
    account_status: str(data.account_status),
    is_online: typeof data.is_online === "boolean" ? data.is_online : null,
    ngl: data.ngl,
    operational_status: str(data.operational_status),
    on_trip: typeof data.on_trip === "boolean" ? data.on_trip : null,
    mndon_newacc:
      typeof data.mndon_newacc === "boolean" ? data.mndon_newacc : null,
    document_review_status: str(data.document_review_status),
    registration_documents_status: str(data.registration_documents_status),
  });
  for (const w of axes.warnings) {
    warnings.push({
      code: "driver_status_axis_warning",
      field: "status",
      message: w,
      severity: "warning",
    });
  }

  // Identity: sourceDocumentId vs authUid
  const uidField = str(data.uid);
  const authUid: string | null = uidField;
  let authUidKnowledge: CanonicalDriverReadModel["authUidKnowledge"] = "missing";
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
  } else {
    authUidKnowledge = "missing";
  }

  // Geography — reuse 4A-1/4A-2; preserve source paths
  const rawCountryId = extractLegacyDocRefId(data.Rev_dolh);
  const sourceCountryPath = refPath(data.Rev_dolh);
  let countryId: string | null = null;
  let countryConfidence: MappingConfidence = "unknown";
  if (!rawCountryId) {
    incompleteReasons.push("countryId_missing");
  } else {
    const resolved = resolveCanonicalCountryId(rawCountryId);
    if (resolved.status === "mapped" && resolved.canonicalCountryId) {
      countryId = resolved.canonicalCountryId;
      countryConfidence = resolved.confidence;
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
  if (!rawCityId) {
    incompleteReasons.push("cityId_missing");
  } else {
    const cityResolved = resolveCityId(rawCityId, input.aliases ?? []);
    if (cityResolved.status === "mapped" && cityResolved.cityId) {
      cityId = cityResolved.cityId;
      cityConfidence = cityResolved.confidence ?? "medium";
    } else {
      cityId = rawCityId;
      cityConfidence = "low";
    }
  }

  // Never invent from GPS / phone
  if (!rawCountryId && (data.loceshnMndobNow != null || data.loceshnMn != null)) {
    warnings.push({
      code: "geo_not_inferred_from_gps",
      field: "Rev_dolh",
      message: "GPS present but country not invented",
      severity: "info",
    });
  }

  const vehicle = buildDriverVehicleSafeSummary(data);
  const compliance = buildDriverComplianceSafeSummary(data);
  const financial = summarizeDriverFinancialPresence(data);

  const displayName = str(data.display_name ?? data.displayName);

  let mappingStatus: DriverMappingStatus = "validMapped";
  // Classification order: non-candidate → admin contamination → test →
  // missing proven driver evidence → geography (operational Drivers only).
  if (!docId) {
    mappingStatus = "malformed";
  } else if (!membership.isDriverCandidate) {
    mappingStatus = "unknownDiscriminator";
  } else if (membership.isKnownAdministrativeIdentity) {
    mappingStatus = "excludedNonDriver";
  } else if (
    isTestOrNoncanonicalDriver({
      documentId: docId,
      data,
      countryId: rawCountryId,
    })
  ) {
    mappingStatus = "testOrNoncanonical";
  } else if (!membership.hasProvenDriverRoleEvidence) {
    // ismndob alone is insufficient — not operational Driver domain.
    mappingStatus = "malformed";
    incompleteReasons.push("missing_proven_driver_role_evidence");
  } else if (incompleteReasons.includes("conflicting_registration")) {
    mappingStatus = "malformed";
  } else if (!rawCountryId || incompleteReasons.includes("countryId_unmapped")) {
    mappingStatus = "unmappedCountry";
  } else if (!rawCityId) {
    mappingStatus = "unmappedCity";
  } else {
    mappingStatus = "validMapped";
  }

  const onlineBool =
    axes.online.value === "online"
      ? true
      : axes.online.value === "offline"
        ? false
        : null;
  const availableBool =
    axes.availability.value === "available"
      ? true
      : axes.availability.value === "unknown"
        ? null
        : false;
  const onTripBool =
    axes.tripState.value === "busy"
      ? true
      : axes.tripState.value === "idle"
        ? false
        : null;

  const mappingConfidence: MappingConfidence =
    mappingStatus === "validMapped" && incompleteReasons.length === 0
      ? "high"
      : mappingStatus === "validMapped"
        ? "medium"
        : "low";

  const model: CanonicalDriverReadModel = {
    id: docId,
    canonicalDriverId: docId,
    sourceDocumentId: docId,
    authUid,
    authUidKnowledge,
    legacyCollection: "user",
    source: "legacy_user_driver",
    isDriver: membership.isOperationalDriver,
    isDriverCandidate: membership.isDriverCandidate,
    isOperationalDriver: membership.isOperationalDriver,
    discriminatorField: membership.discriminatorField,
    authoritativeRole: membership.authoritativeRole,
    roleEvidenceKind: membership.isKnownAdministrativeIdentity
      ? membership.roleEvidenceKind
      : membership.hasProvenDriverRoleEvidence
        ? membership.driverEvidenceKind
        : membership.roleEvidenceKind,
    displayName: proven(displayName, {
      collection: "user",
      documentId: docId,
      field: "display_name",
      sourceValue: data.display_name ?? null,
    }),
    registrationAxis: proven(axes.registration.value, {
      collection: "user",
      documentId: docId,
      field: axes.registration.sourceField,
      sourceValue: axes.registration.value,
      confidence: axes.registration.confidence,
    }),
    registrationStatus: axes.registration.value,
    accountEnabled: axes.account.value,
    accountActive: proven(axes.accountBool, {
      collection: "user",
      documentId: docId,
      field: axes.account.sourceField,
      sourceValue: axes.accountBool,
      confidence: axes.account.confidence,
    }),
    onlineStatus: axes.online.value,
    online: proven(onlineBool, {
      collection: "user",
      documentId: docId,
      field: axes.online.sourceField,
      sourceValue: axes.online.value,
      confidence: axes.online.confidence,
    }),
    availabilityStatus: axes.availability.value,
    available: proven(availableBool, {
      collection: "user",
      documentId: docId,
      field: axes.availability.sourceField,
      sourceValue: axes.availability.value,
      confidence: axes.availability.confidence,
    }),
    tripState: axes.tripState.value,
    onTrip: proven(onTripBool, {
      collection: "user",
      documentId: docId,
      field: axes.tripState.sourceField,
      sourceValue: axes.tripState.value,
      confidence: axes.tripState.confidence,
    }),
    complianceStatus: axes.compliance.value,
    countryId: proven(countryId, {
      collection: "user",
      documentId: docId,
      field: "Rev_dolh",
      sourceValue: sourceCountryPath,
      confidence: countryConfidence,
      warnings: rawCountryId
        ? []
        : ["Driver missing Rev_dolh — not inventing from GPS/phone"],
    }),
    countrySourcePath: sourceCountryPath,
    cityId: proven(cityId, {
      collection: "user",
      documentId: docId,
      field: "mndob_vill",
      sourceValue: sourceCityPath,
      confidence: cityConfidence,
    }),
    citySourcePath: sourceCityPath,
    vehicle: {
      typeCarId: vehicle.typeCarId,
      typeCarSourcePath: vehicle.typeCarSourcePath,
      name: vehicle.name,
      model: vehicle.model,
      plateMasked: vehicle.plateMasked,
      platePresent: vehicle.platePresent,
      normalizedPlateExposed: false,
      normalizedPlatePresent: vehicle.normalizedPlatePresent,
      classificationText: vehicle.classificationText,
      year: vehicle.year,
      color: vehicle.color,
      registrationLinkageId: vehicle.registrationLinkageId,
      vehicleReviewStatus: vehicle.vehicleReviewStatus,
      incomplete: vehicle.incomplete,
    },
    compliance: {
      overall: compliance.overall,
      registrationDocumentsStatus: compliance.registrationDocumentsStatus,
      documentReviewStatus: compliance.documentReviewStatus,
      rejectionReasonPresent: compliance.rejectionReasonPresent,
      needsChangesReasonPresent: compliance.needsChangesReasonPresent,
      slots: compliance.slots.map((s) => ({
        slot: s.slot,
        presence: s.presence,
        evidenceFields: s.evidenceFields,
        reviewStatus: s.reviewStatus,
        expiryUtc: s.expiryUtc,
        expired: s.expired,
        uploadedMetadataPresent: s.uploadedMetadataPresent,
        rejectionReasonPresent: s.rejectionReasonPresent,
      })),
      hasKnownExpiry: compliance.hasKnownExpiry,
      expiredSlotCount: compliance.expiredSlotCount,
    },
    financial: financial,
    createdAtUtc: iso(data.created_time),
    mappingStatus,
    incompleteReasons,
    mappingConfidence,
    mappingVersion: LEGACY_MAPPING_VERSION,
    statusWarnings: axes.warnings,
  };

  return { model, mappingWarnings: warnings, mappingConfidence };
}
