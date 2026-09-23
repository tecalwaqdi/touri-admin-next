/**
 * Map canonical Production read models → PC-2 detail DTOs.
 * Never fabricates amounts or PII; null/unavailable when missing.
 */

import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalMoneyField,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import {
  classifyProductionRecord,
} from "@/domain/production-read/RecordClassification";
import {
  resolveAdminDataSourceLabel,
  type AdminDataSourceLabelView,
} from "@/domain/production-read/SourceLabel";
import {
  buildGeographyCountryPresentation,
  diagnoseSuspiciousActiveAgent,
  geographyCountryBucketKey,
  isMalformedOrLegacyCountryId,
} from "@/domain/geography/GeographyPresentation";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { classifyTripFinanceDisplayFromSafeRead } from "@/domain/finance/TripFinanceDisplayState";
import type {
  CustomerDetailDto,
  DetailAvailability,
  DetailDataQualityWarning,
  DetailMeta,
  DetailMoneyField,
  DriverDetailDto,
  TripDetailDto,
} from "@/application/production-read/detailDtos";

function sourceMeta(documentId: string): AdminDataSourceLabelView {
  return resolveAdminDataSourceLabel({
    productionFirestore: true,
    documentIds: [documentId],
  });
}

function baseMeta(
  documentId: string,
  mappingStatus: string | null | undefined,
  warnings: DetailDataQualityWarning[],
  piiRedacted: boolean,
): DetailMeta {
  const classification = classifyProductionRecord({
    id: documentId,
    mappingStatus,
  });
  return {
    sourceLabel: sourceMeta(documentId),
    availability: "available",
    dataQualityWarnings: warnings,
    recordClass: classification.recordClass,
    synthetic: false,
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    readMode: "shadow",
    transport: "wif_native",
    piiRedacted,
  };
}

function moneyFromCanonical(
  field: CanonicalMoneyField | null | undefined,
): DetailMoneyField {
  if (!field) {
    return {
      amount: null,
      unit: "unknown",
      currencyCode: null,
      availability: "unavailable",
    };
  }
  const amount = field.value;
  let availability: DetailAvailability = "unknown";
  if (
    (field.availabilityStatus === "available" ||
      field.availabilityStatus === "derived") &&
    amount != null
  ) {
    availability = "available";
  } else if (
    field.availabilityStatus === "missing" ||
    field.availabilityStatus === "not_represented" ||
    amount == null
  ) {
    availability = "missing";
  }
  return {
    amount: amount ?? null,
    unit: field.unit ?? "unknown",
    currencyCode: field.currencyCode ?? null,
    availability,
  };
}

function pushWarning(
  out: DetailDataQualityWarning[],
  code: string,
  messageEn: string,
  messageAr: string,
): void {
  out.push({ code, messageEn, messageAr });
}

function tripPartyAssignment(
  knowledge: "known" | "missing" | "unknown",
  id: string | null,
): "assigned" | "never_assigned" | "broken_reference" {
  if (knowledge === "missing" || !id) return "never_assigned";
  if (knowledge === "unknown") return "broken_reference";
  return "assigned";
}

export function mapCanonicalTripToDetail(
  model: CanonicalTripReadModel,
): TripDetailDto {
  const warnings: DetailDataQualityWarning[] = [];
  const countryId =
    model.countryId.value ||
    model.canonicalCountryId ||
    model.sourceCountryDocumentId ||
    null;
  const canonicalCountryId =
    tryCanonicalCountryId(countryId) ??
    (model.canonicalCountryId ? model.canonicalCountryId : null);

  if (!countryId) {
    pushWarning(
      warnings,
      "missing_canonical_country",
      "Missing canonical country",
      "الدولة القانونية غير متوفرة",
    );
  } else if (isMalformedOrLegacyCountryId(countryId)) {
    pushWarning(
      warnings,
      "legacy_country_id",
      "Malformed or legacy country ID",
      "معرّف دولة تالف أو قديم",
    );
  }
  for (const reason of model.incompleteReasons ?? []) {
    pushWarning(warnings, "incomplete", reason, reason);
  }

  const commissionPercent =
    model.financialSafeRead.platformCommissionRatePercent;
  const commissionAvailability: DetailAvailability =
    commissionPercent == null
      ? model.financialSafeRead.platformCommissionRateKnowledge === "missing" ||
        model.financialSafeRead.platformCommissionRateKnowledge ===
          "not_represented"
        ? "unavailable"
        : "unavailable"
      : "available";

  const paymentChannelRaw = String(model.paymentMethod.value ?? "")
    .trim()
    .toLowerCase();
  const paymentChannel =
    paymentChannelRaw === "cash" || paymentChannelRaw === "card"
      ? paymentChannelRaw
      : ("unknown" as const);
  const financeDisplay = classifyTripFinanceDisplayFromSafeRead({
    lifecycleCompleted:
      model.lifecycleStatus === "completed" ||
      String(model.status.value ?? "").toLowerCase() === "completed",
    paymentChannel,
    paymentStatus: model.paymentStatus.value,
    financialSafeRead: {
      totalApp: model.financialSafeRead.totalApp,
      totalVat: model.financialSafeRead.totalVat,
      totalMndob: model.financialSafeRead.totalMndob,
      totalMndob2: model.financialSafeRead.totalMndob2,
    },
  });

  return {
    kind: "trip",
    ...baseMeta(model.id, model.mappingStatus, warnings, true),
    id: model.id,
    canonicalTripId: model.canonicalTripId,
    status: model.status.value,
    lifecycleStatus: model.lifecycleStatus ?? null,
    paymentMethod: model.paymentMethod.value,
    paymentStatus: model.paymentStatus.value,
    currencyCode: model.currencyCode.value,
    countryId,
    canonicalCountryId,
    cityId: model.cityId.value || model.sourceCityDocumentId || null,
    customerId: model.customerId,
    customerDisplayName: null,
    customerIdKnowledge: model.customerIdKnowledge,
    driverId: model.driverId,
    driverDisplayName: null,
    driverIdKnowledge: model.driverIdKnowledge,
    driverAssignment: tripPartyAssignment(
      model.driverIdKnowledge,
      model.driverId,
    ),
    agentId: model.agentId.value,
    agentDisplayName: null,
    pickupLandmarkId: model.pickupLandmarkId,
    pickupLandmarkName: null,
    pickupLandmarkKnowledge: model.pickupLandmarkKnowledge,
    destinationLandmarkId: model.destinationLandmarkId,
    destinationLandmarkName: null,
    destinationLandmarkKnowledge: model.destinationLandmarkKnowledge,
    createdAtUtc: model.createdAtUtc.value,
    startedAtUtc: model.startedAtUtc.value,
    completedAtUtc: model.completedAtUtc.value,
    scheduledAtUtc: null,
    cancellation: {
      isCancelled: model.cancellation.isCancelled,
      reason: model.cancellation.reason,
      actor: model.cancellation.actor || null,
      cancelledAtUtc: model.cancellation.cancelledAtUtc,
    },
    financial: {
      grossFare: moneyFromCanonical(model.financialSafeRead.totalApp),
      vatAmount: moneyFromCanonical(model.financialSafeRead.totalVat),
      platformCommissionRatePercent: commissionPercent,
      platformCommissionAvailability: commissionAvailability,
      isAccountingApproved: false,
      isSettlementSafe: false,
      financeDisplayState: financeDisplay.state,
      financeDisplayPresentationKey: financeDisplay.presentationKey,
      excludeFromCertifiedTotals: financeDisplay.excludeFromCertifiedTotals,
    },
    lifecycleEvents: [],
    mappingStatus: model.mappingStatus ?? null,
    incompleteReasons: [...(model.incompleteReasons ?? [])],
  };
}

export function mapCanonicalDriverToDetail(
  model: CanonicalDriverReadModel,
): DriverDetailDto {
  const warnings: DetailDataQualityWarning[] = [];
  const displayName = model.displayName.value;
  if (!displayName) {
    pushWarning(
      warnings,
      "missing_name",
      "Missing display name",
      "الاسم غير متوفر",
    );
  }
  if (!model.countryId.value) {
    pushWarning(
      warnings,
      "missing_canonical_country",
      "Missing canonical country",
      "الدولة القانونية غير متوفرة",
    );
  }
  if (model.vehicle.incomplete) {
    pushWarning(
      warnings,
      "incomplete_vehicle_metadata",
      "Incomplete vehicle metadata",
      "بيانات المركبة غير مكتملة",
    );
  }
  const missingDocs = model.compliance.slots.filter(
    (s) => s.presence === "missing",
  );
  if (missingDocs.length) {
    pushWarning(
      warnings,
      "missing_document_metadata",
      "Missing document metadata",
      "بيانات المستندات غير مكتملة",
    );
  }
  const registration = model.registrationStatus ?? null;
  // registration vs derived approval — warn when inconsistent signals
  if (
    registration === "approved" &&
    model.accountEnabled === "disabled"
  ) {
    pushWarning(
      warnings,
      "inconsistent_registration_approval",
      "Inconsistent registration / account state",
      "تعارض بين حالة التسجيل والحساب",
    );
  }
  for (const w of model.statusWarnings ?? []) {
    pushWarning(warnings, "status_warning", w, w);
  }
  for (const reason of model.incompleteReasons ?? []) {
    pushWarning(warnings, "incomplete", reason, reason);
  }

  const approvalStatus =
    registration === "approved"
      ? "approved"
      : registration === "rejected" || registration === "suspended"
        ? registration
        : registration === "needs_changes"
          ? "needs_changes"
          : registration === "draft"
            ? "draft"
            : registration === "pending_review"
              ? "pending"
              : null;

  return {
    kind: "driver",
    ...baseMeta(model.id, model.mappingStatus, warnings, true),
    id: model.id,
    canonicalDriverId: model.canonicalDriverId,
    displayName,
    email: model.emailHint.value,
    phone: model.phoneHint.value,
    countryId: model.countryId.value,
    cityId: model.cityId.value,
    regionId: null,
    regionAvailability: "not_represented",
    registrationStatus: registration,
    reviewVersion: model.reviewVersion,
    approvalStatus,
    availabilityStatus: model.availabilityStatus ?? null,
    onlineStatus: model.onlineStatus ?? null,
    accountState: model.accountEnabled ?? null,
    tripState: model.tripState ?? null,
    onTrip: model.onTrip.value,
    createdAtUtc: model.createdAtUtc,
    updatedAtUtc: null,
    vehicle: {
      typeCarId: model.vehicle.typeCarId,
      name: model.vehicle.name,
      model: model.vehicle.model,
      plateMasked: model.vehicle.plateMasked,
      year: model.vehicle.year,
      color: model.vehicle.color,
      classificationText: model.vehicle.classificationText,
      normalizedPlatePresent: model.vehicle.normalizedPlatePresent,
      registrationLinkageId: model.vehicle.registrationLinkageId,
      vehicleReviewStatus: model.vehicle.vehicleReviewStatus,
      incomplete: model.vehicle.incomplete,
    },
    documents: {
      overall: model.compliance.overall,
      documentReviewStatus: model.compliance.documentReviewStatus,
      rejectionReasonPresent: model.compliance.rejectionReasonPresent,
      needsChangesReasonPresent: model.compliance.needsChangesReasonPresent,
      rejectionReasonText: model.compliance.rejectionReasonText,
      needsChangesReasonText: model.compliance.needsChangesReasonText,
      slots: model.compliance.slots.map((s) => ({
        slot: s.slot,
        presence: s.presence,
        evidenceFields: [...s.evidenceFields],
        reviewStatus: s.reviewStatus,
        documentVersion: s.documentVersion ?? null,
        expiryUtc: s.expiryUtc,
        expired: s.expired,
        uploadedMetadataPresent: s.uploadedMetadataPresent,
        rejectionReasonPresent: s.rejectionReasonPresent,
      })),
      hasKnownExpiry: model.compliance.hasKnownExpiry,
      expiredSlotCount: model.compliance.expiredSlotCount,
    },
    financial: {
      isAuthoritative: false,
      isSettlementSafe: false,
      fieldsPresent: [...(model.financial.fieldsPresent ?? [])],
      summary: null,
    },
    tripSummary: null,
    mappingStatus: model.mappingStatus ?? null,
    incompleteReasons: [...(model.incompleteReasons ?? [])],
    statusWarnings: [...(model.statusWarnings ?? [])],
  };
}

export function mapCanonicalCustomerToDetail(
  model: CanonicalCustomerReadModel,
): CustomerDetailDto {
  const warnings: DetailDataQualityWarning[] = [];
  if (!model.displayName.value) {
    pushWarning(
      warnings,
      "missing_name",
      "Missing display name",
      "الاسم غير متوفر",
    );
  }
  if (!model.countryId.value) {
    pushWarning(
      warnings,
      "missing_canonical_country",
      "Missing canonical country",
      "الدولة القانونية غير متوفرة",
    );
  }
  for (const w of model.statusWarnings ?? []) {
    pushWarning(warnings, "status_warning", w, w);
  }
  for (const reason of model.incompleteReasons ?? []) {
    pushWarning(warnings, "incomplete", reason, reason);
  }

  const bookingsCount = model.financial.bookingsCount;
  const bookingsAvail: DetailAvailability = model.financial.bookingsCountKnown
    ? bookingsCount == null
      ? "missing"
      : "available"
    : "unavailable";

  return {
    kind: "customer",
    ...baseMeta(model.id, model.mappingStatus, warnings, true),
    id: model.id,
    canonicalCustomerId: model.canonicalCustomerId,
    displayName: model.displayName.value,
    emailHint: model.emailHint.value ?? model.email.value,
    phoneHint: model.phoneHint.value ?? model.phone.value,
    countryId: model.countryId.value,
    cityId: model.cityId.value,
    accountState: model.accountState ?? null,
    createdAtUtc: model.createdAtUtc.value,
    lastActivityAtUtc: model.lastActivityAtUtc.value,
    geographyRepresentation: model.geographyRepresentation ?? null,
    tripLockHint: model.tripLockHint ?? null,
    tripSummary: {
      bookingsCount: bookingsCount ?? null,
      bookingsCountAvailability: bookingsAvail,
      completedTrips: null,
      cancelledTrips: null,
    },
    deletionRetention: {
      deletionRequestState: null,
      anonymizedOrDeleted: null,
      financialRetentionMarker: null,
      availability: "unavailable",
    },
    mappingStatus: model.mappingStatus ?? null,
    incompleteReasons: [...(model.incompleteReasons ?? [])],
    statusWarnings: [...(model.statusWarnings ?? [])],
  };
}

export function buildAgentDetailWarnings(
  model: CanonicalAgentReadModel,
): DetailDataQualityWarning[] {
  const warnings: DetailDataQualityWarning[] = [];
  if (!model.displayName.value) {
    pushWarning(
      warnings,
      "missing_name",
      "Missing display name",
      "الاسم غير متوفر",
    );
  }
  const countryId = model.countryId.value;
  if (!countryId) {
    pushWarning(
      warnings,
      "missing_canonical_country",
      "Missing canonical country",
      "الدولة القانونية غير متوفرة",
    );
  } else {
    const presentation = buildGeographyCountryPresentation({ countryId });
    warnings.push(...presentation.warnings);
    const suspicious = diagnoseSuspiciousActiveAgent({
      agentName: model.displayName.value,
      authoritativeRole: model.authoritativeRole,
      isOperationalAgent: model.isOperationalAgent,
      mappingStatus: model.mappingStatus,
    });
    if (suspicious) warnings.push(suspicious);
  }
  for (const w of model.statusWarnings ?? []) {
    pushWarning(warnings, "status_warning", w, w);
  }
  for (const reason of model.incompleteReasons ?? []) {
    pushWarning(warnings, "incomplete", reason, reason);
  }
  return warnings;
}

export function agentCountryBucket(countryId: string | null | undefined): string | null {
  if (!countryId) return null;
  return geographyCountryBucketKey(countryId) || null;
}

export { baseMeta, moneyFromCanonical };
