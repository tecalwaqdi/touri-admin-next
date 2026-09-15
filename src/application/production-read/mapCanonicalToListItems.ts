/**
 * Map Production canonical read models → PC-3 list DTOs.
 * Safe IDs / masked fields only — no PII expansion; no fabricated zeros.
 */

import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalMoneyField,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import {
  buildGeographyCountryPresentation,
  diagnoseSuspiciousActiveAgent,
  isMalformedOrLegacyCountryId,
} from "@/domain/geography/GeographyPresentation";
import { currencyHintForCanonicalId } from "@/domain/geography/CountryOption";
import {
  resolveOperationalDisplayName,
  safePartyDisplayRef,
} from "@/domain/presentation/operationalDisplayName";
import {
  exactMetric,
  missingMetric,
  unavailableMetric,
  type AgentListItem,
  type CustomerListItem,
  type DriverListItem,
  type ListDataQualityWarning,
  type ListFieldAvailability,
  type ListMoneyField,
  type TripListItem,
} from "@/application/production-read/listDtos";

function moneyFromCanonical(
  field: CanonicalMoneyField | null | undefined,
): ListMoneyField {
  if (!field) {
    return {
      amount: null,
      unit: "unknown",
      currencyCode: null,
      availability: "unavailable",
    };
  }
  const amount = field.value;
  let availability: ListFieldAvailability = "unknown";
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

function canonicalCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return tryCanonicalCountryId(raw) ?? raw;
}

export function mapCanonicalTripToListItem(
  model: CanonicalTripReadModel,
): TripListItem {
  const countryRaw =
    model.canonicalCountryId ||
    model.countryId.value ||
    model.sourceCountryDocumentId ||
    null;
  const warnings: ListDataQualityWarning[] = [];
  if (!countryRaw || isMalformedOrLegacyCountryId(countryRaw)) {
    warnings.push({
      code: "missing_or_legacy_country",
      messageEn: "Missing or legacy country mapping",
      messageAr: "تعيين الدولة مفقود أو قديم",
    });
  }
  return {
    kind: "trip_list",
    id: model.id,
    status: model.lifecycleStatus || model.status.value || null,
    customerId: model.customerId,
    customerDisplayRef: safePartyDisplayRef(model.customerId),
    driverId: model.driverId,
    driverDisplayRef: safePartyDisplayRef(model.driverId),
    agentId: model.agentId.value,
    countryId: countryRaw,
    canonicalCountryId: canonicalCountry(countryRaw),
    cityId: model.cityId.value || model.sourceCityDocumentId || null,
    pickupLandmarkId: model.pickupLandmarkId,
    destinationLandmarkId: model.destinationLandmarkId,
    createdAtUtc: model.createdAtUtc.value,
    scheduledAtUtc: null,
    paymentMethod: model.paymentMethod.value,
    currencyCode: model.currencyCode.value,
    grossFare: moneyFromCanonical(model.financialSafeRead.totalApp),
    cancellation: {
      isCancelled: model.cancellation.isCancelled,
      reason: model.cancellation.reason,
    },
    dataQualityWarnings: warnings,
  };
}

export function mapCanonicalDriverToListItem(
  model: CanonicalDriverReadModel,
): DriverListItem {
  const countryRaw = model.countryId.value;
  const warnings: ListDataQualityWarning[] = [];
  if (!model.displayName.value) {
    warnings.push({
      code: "missing_display_name",
      messageEn: "Missing display name",
      messageAr: "اسم العرض مفقود",
    });
  }
  if (model.vehicle.incomplete) {
    warnings.push({
      code: "incomplete_vehicle",
      messageEn: "Incomplete vehicle data",
      messageAr: "بيانات المركبة غير مكتملة",
    });
  }
  if (model.compliance.overall === "incomplete") {
    warnings.push({
      code: "incomplete_documents",
      messageEn: "Incomplete documents",
      messageAr: "المستندات غير مكتملة",
    });
  }
  const vehicleParts = [
    model.vehicle.name,
    model.vehicle.model,
    model.vehicle.plateMasked,
  ].filter(Boolean);
  const registration = model.registrationStatus || null;
  const approvalStatus =
    registration === "approved"
      ? "approved"
      : registration === "rejected" || registration === "suspended"
        ? registration
        : registration
          ? "pending"
          : null;

  return {
    kind: "driver_list",
    id: model.id,
    displayName: resolveOperationalDisplayName({
      displayName: model.displayName.value,
      id: model.id,
    }),
    phoneHint: null,
    emailHint: null,
    countryId: countryRaw,
    canonicalCountryId: canonicalCountry(countryRaw),
    cityId: model.cityId.value,
    registrationStatus: registration,
    approvalStatus,
    availabilityStatus: model.availabilityStatus || null,
    onlineStatus: model.onlineStatus || null,
    accountState: model.accountEnabled || null,
    vehicleSummary: vehicleParts.length ? vehicleParts.join(" · ") : null,
    documentCompleteness: model.compliance.overall || null,
    tripCount: unavailableMetric(),
    createdAtUtc: model.createdAtUtc,
    dataQualityWarnings: warnings,
  };
}

export function mapCanonicalCustomerToListItem(
  model: CanonicalCustomerReadModel,
): CustomerListItem {
  const countryRaw = model.countryId?.value ?? null;
  const warnings: ListDataQualityWarning[] = [];
  if (!model.displayName.value) {
    warnings.push({
      code: "missing_display_name",
      messageEn: "Missing display name",
      messageAr: "اسم العرض مفقود",
    });
  }
  if (
    model.geographyRepresentation === "not_represented" ||
    model.geographyRepresentation === "unmapped"
  ) {
    warnings.push({
      code: "missing_canonical_country",
      messageEn: "Country geography not represented",
      messageAr: "الجغرافيا / الدولة غير ممثلة",
    });
  }

  let tripCount = unavailableMetric();
  if (model.financial.bookingsCountKnown) {
    if (model.financial.bookingsCount == null) {
      tripCount = missingMetric();
    } else {
      tripCount = exactMetric(model.financial.bookingsCount);
    }
  }

  return {
    kind: "customer_list",
    id: model.id,
    displayName: resolveOperationalDisplayName({
      displayName: model.displayName.value,
      emailHint: model.emailHint.value ?? model.email.value,
      phoneHint: model.phoneHint.value ?? model.phone.value,
      id: model.id,
    }),
    phoneHint: model.phoneHint.value ?? model.phone.value,
    emailHint: model.emailHint.value ?? model.email.value,
    countryId: countryRaw,
    canonicalCountryId: canonicalCountry(countryRaw),
    cityId: model.cityId?.value ?? null,
    accountState: model.accountState ?? null,
    createdAtUtc: model.createdAtUtc.value,
    tripCount,
    deletionRetentionAvailability: "unavailable",
    dataQualityWarnings: warnings,
  };
}

export function mapCanonicalAgentToListItem(
  model: CanonicalAgentReadModel,
): AgentListItem {
  const countryRaw = model.countryId.value;
  const presentation = buildGeographyCountryPresentation({
    countryId: countryRaw ?? "",
  });
  const warnings: ListDataQualityWarning[] = [...presentation.warnings];
  if (!model.displayName.value) {
    warnings.push({
      code: "missing_display_name",
      messageEn: "Missing display name",
      messageAr: "اسم العرض مفقود",
    });
  }
  const suspicious = diagnoseSuspiciousActiveAgent({
    agentName: model.displayName.value,
    authoritativeRole: model.authoritativeRole,
    isOperationalAgent: model.isOperationalAgent,
    mappingStatus: model.mappingStatus,
  });
  if (suspicious && model.isOperationallyActive) {
    warnings.push(suspicious);
  }

  const status: AgentListItem["status"] = model.isOperationallyActive
    ? "active"
    : model.operationalActiveState === "unknown"
      ? "unknown"
      : "inactive";

  const canonical =
    presentation.canonicalCountryId ?? canonicalCountry(countryRaw);

  return {
    kind: "agent_list",
    id: model.id,
    displayName: resolveOperationalDisplayName({
      displayName: model.displayName.value,
      id: model.id,
    }),
    countryId: countryRaw,
    canonicalCountryId: canonical,
    countryDisplayName: presentation.displayName,
    status,
    operationalActiveState: model.operationalActiveState,
    currencyHint: currencyHintForCanonicalId(canonical),
    // No efficient per-agent aggregate without N+1 — mark unavailable.
    driversCount: unavailableMetric(),
    tripsCount: unavailableMetric(),
    settlementOutstanding: {
      availability: "unavailable",
      amount: null,
    },
    dataQualityWarnings: warnings,
  };
}
