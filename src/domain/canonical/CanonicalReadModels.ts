/**
 * Phase 3.5/3.6 Canonical Read Models — TypeScript interfaces.
 * These are NOT a Ledger and NOT production-approved business policy.
 * Phase 3.6 adds availability, safety flags, chargeback, agent attribution.
 */

import type {
  FieldProvenance,
  FinancialAvailabilityStatus,
  FinancialConceptClass,
  MappingConfidence,
} from "@/domain/canonical/FieldProvenance";
import type { TripFinancialSafety } from "@/domain/canonical/FinancialFieldSafety";
import type { ChargebackStatus } from "@/domain/canonical/ChargebackPolicy";

export type UnmappedStatus = "unmapped";

export type Provenanced<T> = {
  value: T | null;
  provenance: FieldProvenance;
  classification?: FinancialConceptClass;
  availabilityStatus?: FinancialAvailabilityStatus;
};

/**
 * Phase 4A-4 — Canonical Trip Read Model (Legacy Firestore `order`).
 * Safe IDs only for customer/driver. Financial fields are persisted historical
 * candidates (NOT accounting / settlement approval).
 */
export type CanonicalTripReadModel = {
  id: string;
  /** Same as Firestore document id — no silent merge. */
  canonicalTripId: string;
  sourceDocumentId: string;
  legacyCollection: "order";
  /** @deprecated use sourceDocumentId */
  legacyDocumentId?: string;
  source: "legacy_order";
  status: Provenanced<string | UnmappedStatus>;
  lifecycleStatus: string;
  lifecycleStatusSource: string;
  isSafeForOperationalAction: boolean;
  isTerminal: boolean;
  lifecycleEvidenceFlags: string[];
  paymentStatus: Provenanced<string | UnmappedStatus>;
  paymentMethod: Provenanced<string | UnmappedStatus>;
  /** Safe string id only — never PII. null when missing. */
  customerId: string | null;
  customerIdKnowledge: "known" | "missing" | "unknown";
  customerSourcePath: string | null;
  driverId: string | null;
  driverIdKnowledge: "known" | "missing" | "unknown";
  driverSourcePath: string | null;
  agentId: Provenanced<string>;
  countryId: Provenanced<string>;
  cityId: Provenanced<string>;
  sourceCountryDocumentId: string;
  canonicalCountryId: string;
  sourceCountryPath: string | null;
  sourceCityDocumentId: string;
  sourceCityPath: string | null;
  pickupLandmarkId: string | null;
  pickupLandmarkKnowledge: "known" | "missing" | "unknown";
  sourcePickupLandmarkPath: string | null;
  destinationLandmarkId: string | null;
  destinationLandmarkKnowledge: "known" | "missing" | "unknown";
  sourceDestinationLandmarkPath: string | null;
  currencyCode: Provenanced<string>;
  createdAtUtc: Provenanced<string>;
  startedAtUtc: Provenanced<string>;
  completedAtUtc: Provenanced<string>;
  activeOrderFlag: boolean | null;
  iDorder: string | null;
  financialSafeRead: {
    totalApp: CanonicalMoneyField;
    totalAppKnowledge: string;
    totalVat: CanonicalMoneyField;
    totalVatKnowledge: string;
    totalMndob: CanonicalMoneyField;
    totalMndobKnowledge: string;
    totalMndob2: CanonicalMoneyField;
    totalMndob2Knowledge: string;
    vatRatePercent: number | null;
    vatRateKnowledge: string;
    platformCommissionRatePercent: number | null;
    platformCommissionRateKnowledge: string;
    isAccountingApproved: false;
    isSettlementSafe: false;
  };
  cancellation: {
    isCancelled: boolean;
    actor: string;
    actorKnowledge: string;
    reason: string | null;
    reasonKnowledge: string;
    cancelledAtUtc: string | null;
    evidenceFields: string[];
  };
  mappingStatus: string;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
};

/**
 * Phase 4A-5 — Canonical Driver Read Model (Legacy Firestore `user` + ismndob).
 * Six orthogonal status axes. No full PII by default (phone/email/docs redacted).
 * Financial fields classified DOCUMENT_ONLY — not authoritative.
 */
export type DriverMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "unmappedCity"
  | "malformed"
  | "testOrNoncanonical"
  | "excludedNonDriver"
  | "unknownDiscriminator";

export type CanonicalDriverReadModel = {
  id: string;
  canonicalDriverId: string;
  /** Firestore user/{id} document id. */
  sourceDocumentId: string;
  /**
   * Auth UID from `uid` field when present.
   * May differ from sourceDocumentId (mismatch recorded in authUidKnowledge).
   * Auth UID is identity only — never authoritative for Driver vs admin role.
   */
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  legacyCollection: "user";
  source: "legacy_user_driver";
  /** Driver persona discriminator evidence (candidate gate). */
  isDriver: boolean;
  /** True when ismndob/ismndom candidate — not yet operational Driver. */
  isDriverCandidate: boolean;
  /** True when candidate && !admin && proven driver-role evidence. */
  isOperationalDriver: boolean;
  discriminatorField: "ismndob" | "ismndom" | "unknown";
  /**
   * Authoritative Legacy role from Firestore user doc fields
   * (pre_reset_inventory / panel_claims equivalent — not Auth claims alone).
   */
  authoritativeRole:
    | "SUPERADMIN"
    | "FINANCE"
    | "COUNTRY_ADMIN"
    | "PARTNER"
    | "TRANSPORT_MANAGER"
    | "DRIVER"
    | "NONE";
  roleEvidenceKind: string;
  /** Safe display name — not phone/email/ID. */
  displayName: Provenanced<string>;
  /** @deprecated use registrationStatus — kept for Phase 3.x callers */
  registrationAxis: Provenanced<string>;
  registrationStatus: string;
  accountEnabled: "enabled" | "disabled" | "unknown";
  accountActive: Provenanced<boolean>;
  onlineStatus: "online" | "offline" | "unknown";
  online: Provenanced<boolean>;
  /** Legacy-derived availability (account + online + trip). */
  availabilityStatus: "available" | "busy" | "unavailable" | "unknown";
  available: Provenanced<boolean>;
  tripState: "idle" | "busy" | "unknown";
  onTrip: Provenanced<boolean>;
  complianceStatus: "ready" | "incomplete" | "expired" | "unknown";
  countryId: Provenanced<string>;
  countrySourcePath: string | null;
  cityId: Provenanced<string>;
  citySourcePath: string | null;
  vehicle: {
    typeCarId: string | null;
    typeCarSourcePath: string | null;
    name: string | null;
    model: string | null;
    plateMasked: string | null;
    platePresent: boolean;
    normalizedPlateExposed: false;
    incomplete: boolean;
  };
  compliance: {
    overall: "ready" | "incomplete" | "expired" | "unknown";
    slots: Array<{
      slot: string;
      presence: "present" | "missing" | "unknown";
      evidenceFields: string[];
    }>;
    hasKnownExpiry: boolean;
    expiredSlotCount: number;
  };
  financial: {
    fieldsPresent: string[];
    fieldsMissing: string[];
    isAccountingApproved: false;
    isSettlementSafe: false;
    isAuthoritative: false;
  };
  createdAtUtc: string | null;
  mappingStatus: DriverMappingStatus;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  statusWarnings: string[];
};

export type CustomerMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "unmappedCity"
  | "geographyNotRepresented"
  | "malformed"
  | "unknownDiscriminator"
  | "testOrNoncanonical"
  | "excludedNonCustomer"
  /** Shared-user row: not Driver/Agent/Admin/Panel and no positive CUSTOMER evidence. */
  | "excludedUnknownIdentity";

/**
 * Phase 4A-7 — Canonical Customer read model (Legacy user/{id}).
 * Candidate = exclusionary Admin filter; operational = candidate + positive evidence.
 * PII: masked contact hints only. Auth emailVerified / enabled never queried.
 * Financial: DOCUMENT_ONLY activity counts. No Finance / Settlement.
 */
export type CanonicalCustomerReadModel = {
  id: string;
  canonicalCustomerId: string;
  /** Firestore user/{id} document id. */
  sourceDocumentId: string;
  /**
   * Auth UID from `uid` field when present.
   * May differ from sourceDocumentId (mismatch recorded in authUidKnowledge).
   * Auth UID is identity only — never authoritative for Customer vs admin role.
   */
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  legacyCollection: "user";
  source: "legacy_user_customer";
  /** True when operational Customer membership passes. */
  isCustomer: Provenanced<boolean>;
  /** Exclusionary Admin filter only — not Customer proof. */
  isCustomerCandidate: boolean;
  /** Proven Legacy CUSTOMER evidence (signup / inventory residual). */
  hasPositiveCustomerEvidence: boolean;
  isOperationalCustomer: boolean;
  discriminatorKind: "exclusionary_non_driver_non_agent" | "unknown";
  authoritativeRole:
    | "customer"
    | "driver"
    | "agent"
    | "super_admin"
    | "finance"
    | "partner"
    | "transport"
    | "country_admin"
    | "tour_guide"
    | "unknown";
  roleEvidenceKind: string;
  /** Safe display name — not phone/email. */
  displayName: Provenanced<string>;
  /**
   * Always a masked hint (***1234) when present — never raw phone.
   * Kept for Phase 3.7 callers; prefer phoneHint.
   */
  phone: Provenanced<string>;
  /**
   * Always a masked hint (os***@example.com) when present — never raw email.
   * Kept for Phase 3.7 callers; prefer emailHint.
   */
  email: Provenanced<string>;
  phoneHint: Provenanced<string>;
  emailHint: Provenanced<string>;
  /** Auth emailVerified is SoT — never inferred from Firestore in 4A-7. */
  verification: Provenanced<string>;
  /** Account flag actev_user — orthogonal to Auth enabled. */
  accountState: "enabled" | "disabled" | "unknown";
  /** Auth enabled is never inferred (Auth Admin not queried). */
  authEnabledKnowledge: "not_queried";
  /** Firebase Auth emailVerified never queried in 4A-7. */
  authEmailVerifiedKnowledge: "not_queried";
  /** Derived from actev_user for Phase 3.7 compat (null when unknown). */
  blocked: Provenanced<boolean>;
  countryId: Provenanced<string>;
  /** Preserved Rev_dolh path — never invent from phone / name / language. */
  countrySourcePath: string | null;
  cityId: Provenanced<string>;
  /** Preserved mndob_vill path only — never city_display text. */
  citySourcePath: string | null;
  /**
   * Signup often omits Rev_dolh — optional geography → not_represented when
   * operational customer has no country/city DocumentReference.
   */
  geographyRepresentation:
    | "mapped"
    | "partial"
    | "not_represented"
    | "unmapped"
    | "not_applicable";
  /** User-doc lock only — no order N+1. */
  tripLockHint: "none" | "lockPresent";
  financial: {
    fieldsPresent: string[];
    fieldsMissing: string[];
    bookingsCountKnown: boolean;
    bookingsCount: number | null;
    isAccountingApproved: false;
    isSettlementSafe: false;
    isAuthoritative: false;
  };
  createdAtUtc: Provenanced<string>;
  lastActivityAtUtc: Provenanced<string>;
  mappingStatus: CustomerMappingStatus;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  statusWarnings: string[];
};

export type AgentMappingStatus =
  | "validMapped"
  | "unmappedCountry"
  | "malformed"
  | "unknownDiscriminator"
  | "testOrNoncanonical"
  | "excludedNonAgent";

/**
 * Phase 4A-6 — Canonical Agent read model (Legacy user/{id} where Isagent).
 * PII blocked. Financial rates DOCUMENT_ONLY. No create/activate/reassign.
 */
export type CanonicalAgentReadModel = {
  id: string;
  canonicalAgentId: string;
  /** Firestore user/{id} document id. */
  sourceDocumentId: string;
  /**
   * Auth UID from `uid` field when present.
   * May differ from sourceDocumentId (mismatch recorded in authUidKnowledge).
   * Auth UID is identity only — never authoritative for Agent vs admin role.
   */
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  legacyCollection: "user";
  source: "legacy_user_agent";
  /** True when operational Agent membership passes. */
  isAgent: Provenanced<boolean>;
  isAgentCandidate: boolean;
  isOperationalAgent: boolean;
  discriminatorField: "Isagent" | "isagent" | "unknown";
  authoritativeRole:
    | "agent"
    | "country_admin"
    | "super_admin"
    | "finance"
    | "partner"
    | "transport"
    | "unknown";
  roleEvidenceKind: string;
  /** True when isAdminRule=2 coexists — panel country_admin persona, not contamination. */
  hasCountryAdminPanelRule: boolean;
  /** Safe display name — not phone/email. */
  displayName: Provenanced<string>;
  /** Account flag actev_user — orthogonal to Auth enabled. */
  accountState: "enabled" | "disabled" | "unknown";
  /** Operational active from agent_active.js semantics. */
  operationalActiveState:
    | "active"
    | "inactive"
    | "window_future"
    | "window_expired"
    | "unknown";
  isOperationallyActive: boolean;
  /** Auth enabled is never inferred in 4A-6 (Auth Admin not queried). */
  authEnabledKnowledge: "not_queried";
  countryId: Provenanced<string>;
  /** Preserved Rev_dloh_agent path — never invent from dolh_agent name / GPS / phone. */
  countrySourcePath: string | null;
  /**
   * Predicted lock doc id = countries/{id} → agent_country_assignment/{countryDocId}.
   * Lock document itself is NOT fetched in list (no N+1).
   */
  assignmentLockDocId: Provenanced<string>;
  /** DOCUMENT_ONLY commercial rates — not settlement-safe. */
  agentTotalPercent: Provenanced<number>;
  appCommissionPercentStored: Provenanced<number>;
  vatPercentStored: Provenanced<number>;
  financial: {
    fieldsPresent: string[];
    fieldsMissing: string[];
    isAccountingApproved: false;
    isSettlementSafe: false;
    isAuthoritative: false;
    cashCardModelNote: "cash_agent_commission_on_fee__card_company_collects_fee_share";
  };
  activeFromUtc: string | null;
  activeToUtc: string | null;
  createdAtUtc: string | null;
  mappingStatus: AgentMappingStatus;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  statusWarnings: string[];
};

export type CanonicalMoneyField = Provenanced<number> & {
  /** Minor units when known; major when only majors persist. */
  unit: "minor" | "major" | "unknown";
  currencyCode: string | null;
  availabilityStatus: FinancialAvailabilityStatus;
};

export type AgentAttributionStatus =
  | "snapshot"
  | "present"
  | "unknown_historical";

export type CanonicalFinancialTripReadModel = {
  tripId: string;
  legacyCollection: "order";
  legacyDocumentId: string;
  currencyCode: Provenanced<string>;
  /** Alias-friendly: grossFare ≡ baseFare from total_mndob2 */
  baseFare: CanonicalMoneyField;
  grossFare: CanonicalMoneyField;
  finalCustomerPrice: CanonicalMoneyField;
  finalCustomerAmount: CanonicalMoneyField;
  discount: CanonicalMoneyField;
  vatRatePercent: Provenanced<number>;
  /** Historical VAT rate at trip — null if not proven */
  vatRateAtTrip: Provenanced<number>;
  vatAmount: CanonicalMoneyField;
  platformCommissionRatePercent: Provenanced<number>;
  platformCommissionAmount: CanonicalMoneyField;
  agentCommissionAmount: CanonicalMoneyField;
  agentCommissionRatePercent: Provenanced<number>;
  driverGross: CanonicalMoneyField;
  driverDeductions: CanonicalMoneyField;
  driverNet: CanonicalMoneyField;
  cashCollected: CanonicalMoneyField;
  onlineCollected: CanonicalMoneyField;
  gatewayFee: CanonicalMoneyField;
  refundAmount: CanonicalMoneyField;
  adjustmentAmount: CanonicalMoneyField;
  chargebackAmount: CanonicalMoneyField;
  chargebackStatus: ChargebackStatus;
  /** Never assign currently active country agent when historical snapshot missing. */
  agentId: Provenanced<string>;
  agentAttributionStatus: AgentAttributionStatus;
  /** Future design fields (null until Production write path exists). */
  agentIdSnapshot: string | null;
  agentCommissionRateSnapshot: number | null;
  agentCommissionAmountSnapshot: number | null;
  agentPolicyVersion: string | null;
  paymentChannel: Provenanced<"cash" | "online" | "unknown" | UnmappedStatus>;
  /** Observed Legacy Behavior only — not Admin Next policy. */
  observedFormulas: string[];
  conceptClasses: Record<string, FinancialConceptClass>;
  incompleteReasons: string[];
  warnings: string[];
  safety: TripFinancialSafety;
  isSafeForDisplay: boolean;
  isSafeForSettlement: boolean;
  isSafeForAccounting: boolean;
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  /** Explicit: this is a read projection, not a ledger. */
  isLedger: false;
};

export type CanonicalSettlementReadModel = {
  id: string;
  legacyCollection: "financial_settlements" | "synthetic" | "unknown";
  partyType: Provenanced<"driver" | "agent" | "company" | UnmappedStatus>;
  partyId: Provenanced<string>;
  periodFromUtc: Provenanced<string>;
  periodToUtc: Provenanced<string>;
  currencyCode: Provenanced<string>;
  status: Provenanced<string | UnmappedStatus>;
  direction: Provenanced<string | UnmappedStatus>;
  amountMinor: Provenanced<number>;
  previousBalanceMinor: Provenanced<number>;
  outstandingMinor: Provenanced<number>;
  creatorUserId: Provenanced<string>;
  approverUserId: Provenanced<string>;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  isLedger: false;
};

export type CanonicalCountryReadModel = {
  id: string;
  legacyCollection: "countries";
  name: Provenanced<string>;
  currencyCode: Provenanced<string>;
  isVat: Provenanced<boolean>;
  vatPercent: Provenanced<number>;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
};

export type CanonicalCityReadModel = {
  id: string;
  legacyCollection: "cities" | "unknown";
  name: Provenanced<string>;
  countryId: Provenanced<string>;
  aliasKeys: string[];
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
};
