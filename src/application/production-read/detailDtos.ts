/**
 * PC-2 — explicit Production detail DTOs (never raw Firestore).
 * Missing ≠ 0; Unknown ≠ empty; Unavailable ≠ not found.
 */

import type { AdminDataSourceLabelView } from "@/domain/production-read/SourceLabel";
import type { RecordClass } from "@/domain/production-read/RecordClassification";
import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";

export type DetailAvailability =
  | "available"
  | "missing"
  | "unknown"
  | "unavailable"
  | "bounded_sample";

export type DetailDataQualityWarning = {
  code: string;
  messageEn: string;
  messageAr: string;
};

export type DetailMoneyField = {
  amount: number | null;
  unit: "minor" | "major" | "unknown";
  currencyCode: string | null;
  availability: DetailAvailability;
};

export type DetailMeta = {
  sourceLabel: AdminDataSourceLabelView;
  availability: DetailAvailability;
  dataQualityWarnings: DetailDataQualityWarning[];
  recordClass: RecordClass;
  synthetic: false;
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  readMode: "shadow";
  transport: "wif_native";
  piiRedacted: boolean;
};

export type TripDetailDto = DetailMeta & {
  kind: "trip";
  id: string;
  canonicalTripId: string;
  status: string | null;
  lifecycleStatus: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  currencyCode: string | null;
  countryId: string | null;
  canonicalCountryId: string | null;
  cityId: string | null;
  customerId: string | null;
  driverId: string | null;
  agentId: string | null;
  pickupLandmarkId: string | null;
  destinationLandmarkId: string | null;
  createdAtUtc: string | null;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  scheduledAtUtc: null;
  cancellation: {
    isCancelled: boolean;
    reason: string | null;
    actor: string | null;
    cancelledAtUtc: string | null;
  };
  financial: {
    grossFare: DetailMoneyField;
    vatAmount: DetailMoneyField;
    platformCommissionRatePercent: number | null;
    isAccountingApproved: false;
    isSettlementSafe: false;
  };
  mappingStatus: string | null;
  incompleteReasons: string[];
};

export type DriverDocumentSlotDto = {
  slot: string;
  presence: "present" | "missing" | "unknown";
  evidenceFields: string[];
};

export type DriverDetailDto = DetailMeta & {
  kind: "driver";
  id: string;
  canonicalDriverId: string;
  displayName: string | null;
  /** Masked / redacted — never raw unless contract allows (shadow: always masked). */
  email: string | null;
  phone: string | null;
  countryId: string | null;
  cityId: string | null;
  regionId: null;
  registrationStatus: string | null;
  approvalStatus: string | null;
  availabilityStatus: string | null;
  onlineStatus: string | null;
  accountState: string | null;
  tripState: string | null;
  onTrip: boolean | null;
  createdAtUtc: string | null;
  updatedAtUtc: null;
  vehicle: {
    typeCarId: string | null;
    name: string | null;
    model: string | null;
    plateMasked: string | null;
    year: null;
    color: null;
    incomplete: boolean;
  };
  documents: {
    overall: string | null;
    slots: DriverDocumentSlotDto[];
    hasKnownExpiry: boolean;
    expiredSlotCount: number;
  };
  financial: {
    isAuthoritative: false;
    isSettlementSafe: false;
    fieldsPresent: string[];
    summary: null;
  };
  mappingStatus: string | null;
  incompleteReasons: string[];
  statusWarnings: string[];
};

export type CustomerDetailDto = DetailMeta & {
  kind: "customer";
  id: string;
  canonicalCustomerId: string;
  displayName: string | null;
  emailHint: string | null;
  phoneHint: string | null;
  countryId: string | null;
  cityId: string | null;
  accountState: string | null;
  createdAtUtc: string | null;
  lastActivityAtUtc: string | null;
  geographyRepresentation: string | null;
  tripLockHint: string | null;
  tripSummary: {
    bookingsCount: number | null;
    bookingsCountAvailability: DetailAvailability;
    completedTrips: null;
    cancelledTrips: null;
  };
  deletionRetention: {
    deletionRequestState: null;
    anonymizedOrDeleted: null;
    financialRetentionMarker: null;
    availability: "unavailable";
  };
  mappingStatus: string | null;
  incompleteReasons: string[];
  statusWarnings: string[];
};

export type AgentFinanceSummaryDto = {
  availability: DetailAvailability;
  collectedCash: ReportMoney | null;
  outstanding: ReportMoney | null;
  /** FR7 paid / settled amounts when linkable. */
  paid: ReportMoney | null;
  currencyCode: string | null;
  attributionStatus: string | null;
};

export type AgentDetailDto = DetailMeta & {
  kind: "agent";
  id: string;
  canonicalAgentId: string;
  displayName: string | null;
  email: null;
  phone: null;
  countryId: string | null;
  canonicalCountryId: string | null;
  countryBucket: string | null;
  status: "active" | "inactive" | "unknown";
  operationalActiveState: string | null;
  accountState: string | null;
  createdAtUtc: string | null;
  updatedAtUtc: null;
  activeFromUtc: string | null;
  activeToUtc: string | null;
  countryInvariant: "pass" | "fail_multiple_active" | "no_active_agent" | "unknown";
  activePeerAgentIds: string[];
  relatedReadsBounded: true;
  relatedReadLimit: number;
  finance: AgentFinanceSummaryDto;
  settlements: Array<{
    id: string;
    status: string;
    countryId: string | null;
  }>;
  mappingStatus: string | null;
  incompleteReasons: string[];
  statusWarnings: string[];
};

export class ProductionDetailNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = "ProductionDetailNotFoundError";
  }
}
