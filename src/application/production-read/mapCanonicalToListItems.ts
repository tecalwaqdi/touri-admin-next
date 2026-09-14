/**
 * Map Production canonical read models → Admin list UI shapes.
 * Safe IDs / masked fields only — no PII expansion.
 */

import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalAgentReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { Trip } from "@/types/trip";
import type { Driver } from "@/types/driver";
import type { Agent } from "@/types/agent";
import type { CanonicalTripStatus } from "@/types/trip";

export function mapCanonicalTripToListItem(model: CanonicalTripReadModel): Trip {
  const status = (model.lifecycleStatus ||
    model.status.value ||
    "requested") as CanonicalTripStatus;
  return {
    id: model.id,
    customerId: model.customerId ?? "",
    customerName: "—",
    driverId: model.driverId,
    driverName: null,
    agentId: model.agentId.value,
    countryId:
      model.canonicalCountryId ||
      model.countryId.value ||
      model.sourceCountryDocumentId ||
      "",
    cityId: model.cityId.value || model.sourceCityDocumentId || "",
    status,
    legacyStatus: model.lifecycleStatusSource || undefined,
    paymentMethod:
      (model.paymentMethod.value as Trip["paymentMethod"]) ?? "unknown",
    currencyCode: model.currencyCode.value ?? "",
    grossFare: null,
    cashCollected: null,
    onlineCollected: null,
    createdAtUtc: model.createdAtUtc.value ?? "",
    completedAtUtc: model.completedAtUtc.value,
  };
}

export function mapCanonicalDriverToListItem(
  model: CanonicalDriverReadModel,
): Driver {
  const availability: Driver["availabilityStatus"] =
    model.availabilityStatus === "available"
      ? "online"
      : model.availabilityStatus === "busy"
        ? "busy"
        : model.availabilityStatus === "unavailable"
          ? "unavailable"
          : "offline";
  const registration = (model.registrationStatus ||
    "pending_review") as Driver["registrationStatus"];
  return {
    id: model.id,
    name: model.displayName.value ?? model.id,
    phone: "—",
    email: "—",
    countryId: model.countryId.value ?? "",
    cityId: model.cityId.value ?? "",
    agentId: null,
    registrationStatus: registration,
    approvalStatus:
      registration === "approved"
        ? "approved"
        : registration === "rejected" || registration === "suspended"
          ? (registration as Driver["approvalStatus"])
          : "pending",
    availabilityStatus: availability,
    vehiclePlate: model.vehicle.plateMasked ?? "—",
    rating: null,
    tripCount: 0,
    createdAtUtc: "",
    lastSeenAtUtc: null,
  };
}

export function mapCanonicalAgentToListItem(
  model: CanonicalAgentReadModel,
): Agent {
  const status: Agent["status"] = model.isOperationallyActive
    ? "active"
    : model.operationalActiveState === "unknown"
      ? "inactive"
      : "inactive";
  return {
    id: model.id,
    name: model.displayName.value ?? model.id,
    countryId: model.countryId.value ?? "",
    status,
    commissionPlaceholder: "—",
    driversCount: 0,
    tripsCount: 0,
    activeFromUtc: model.activeFromUtc,
    activeToUtc: model.activeToUtc,
    createdAtUtc: model.createdAtUtc ?? "",
  };
}

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  countryId: string;
  cityId: string;
  status: string;
  createdAtUtc: string;
};

export function mapCanonicalCustomerToListItem(
  model: CanonicalCustomerReadModel,
): CustomerListItem {
  return {
    id: model.id,
    name: model.displayName.value ?? model.id,
    phone: model.phoneHint.value ?? model.phone.value ?? "—",
    email: model.emailHint.value ?? model.email.value ?? "—",
    countryId: model.countryId?.value ?? "",
    cityId: model.cityId?.value ?? "",
    status: model.accountState ?? "unknown",
    createdAtUtc: "",
  };
}
