/**
 * PC-3 — explicit Production list read models (never raw Firestore).
 * Missing ≠ 0; Unknown ≠ false; Unavailable ≠ empty.
 * Detail DTOs remain in detailDtos.ts (PC-2).
 */

export type ListMetricAccuracy = "exact" | "bounded_sample" | "unavailable";

export type ListFieldAvailability =
  | "available"
  | "missing"
  | "unknown"
  | "unavailable";

/** Aggregate-like numeric field with honest accuracy/availability. */
export type AggregateMetric = {
  value: number | null;
  accuracy: ListMetricAccuracy;
  availability: ListFieldAvailability;
};

export type ListDataQualityWarning = {
  code: string;
  messageEn: string;
  messageAr: string;
};

export type ListMoneyField = {
  amount: number | null;
  unit: "minor" | "major" | "unknown";
  currencyCode: string | null;
  availability: ListFieldAvailability;
};

export type PartyAssignmentState =
  | "assigned"
  | "never_assigned"
  | "broken_reference";

export type TripListItem = {
  kind: "trip_list";
  id: string;
  status: string | null;
  customerId: string | null;
  /** Safe display reference — never invent a name. */
  customerDisplayRef: string | null;
  /** Resolved display name when enrichment succeeded; otherwise null. */
  customerDisplayName: string | null;
  customerIdKnowledge: "known" | "missing" | "unknown";
  driverId: string | null;
  driverDisplayRef: string | null;
  driverDisplayName: string | null;
  driverIdKnowledge: "known" | "missing" | "unknown";
  driverAssignment: PartyAssignmentState;
  agentId: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  cityId: string | null;
  pickupLandmarkId: string | null;
  pickupLandmarkName: string | null;
  pickupLandmarkKnowledge: "known" | "missing" | "unknown";
  destinationLandmarkId: string | null;
  destinationLandmarkName: string | null;
  destinationLandmarkKnowledge: "known" | "missing" | "unknown";
  createdAtUtc: string | null;
  /** Not persisted on canonical trip — always null. */
  scheduledAtUtc: null;
  paymentMethod: string | null;
  currencyCode: string | null;
  grossFare: ListMoneyField;
  cancellation: {
    isCancelled: boolean;
    reason: string | null;
  };
  dataQualityWarnings: ListDataQualityWarning[];
};

export type DriverListItem = {
  kind: "driver_list";
  id: string;
  displayName: string | null;
  phoneHint: string | null;
  emailHint: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  cityId: string | null;
  registrationStatus: string | null;
  approvalStatus: string | null;
  availabilityStatus: string | null;
  onlineStatus: string | null;
  accountState: string | null;
  vehicleSummary: string | null;
  documentCompleteness: string | null;
  tripCount: AggregateMetric;
  createdAtUtc: string | null;
  dataQualityWarnings: ListDataQualityWarning[];
};

export type CustomerListItem = {
  kind: "customer_list";
  id: string;
  displayName: string | null;
  phoneHint: string | null;
  emailHint: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  cityId: string | null;
  accountState: string | null;
  createdAtUtc: string | null;
  /** Trip activity — never fabricated zero. */
  tripCount: AggregateMetric;
  deletionRetentionAvailability: "unavailable";
  dataQualityWarnings: ListDataQualityWarning[];
};

export type AgentListItem = {
  kind: "agent_list";
  id: string;
  displayName: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  countryDisplayName: string | null;
  status: "active" | "inactive" | "unknown";
  operationalActiveState: string | null;
  currencyHint: string | null;
  /** Never fabricated — unavailable until efficient aggregate exists. */
  driversCount: AggregateMetric;
  tripsCount: AggregateMetric;
  settlementOutstanding: {
    availability: ListFieldAvailability;
    amount: null;
  };
  dataQualityWarnings: ListDataQualityWarning[];
};

export function unavailableMetric(): AggregateMetric {
  return {
    value: null,
    accuracy: "unavailable",
    availability: "unavailable",
  };
}

export function exactMetric(value: number): AggregateMetric {
  return {
    value,
    accuracy: "exact",
    availability: "available",
  };
}

export function missingMetric(): AggregateMetric {
  return {
    value: null,
    accuracy: "unavailable",
    availability: "missing",
  };
}
