/**
 * FR1 — exact typed synthetic completed-trip order schema for Finance pilot.
 * Uses ONLY Legacy order majors / mapping fields required by FR1 candidate discovery.
 * PREPARATION ONLY — does not create Production documents.
 */

import { classifyFinanceFr1Trip } from "@/application/finance/pilot/FinanceFr1PilotCandidate";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { PHASE_5H_FIXTURE_COUNTRY_ID } from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureSchema";

export const FINANCE_FR1_FIXTURE_COUNTRY_ID = PHASE_5H_FIXTURE_COUNTRY_ID;
export const FINANCE_FR1_FIXTURE_COUNTRY_PATH =
  `countries/${FINANCE_FR1_FIXTURE_COUNTRY_ID}` as const;

/**
 * Optional synthetic driver string ref only — NOT a DocumentReference,
 * NOT an Auth UID create, NOT a user/{uid} mutation.
 * Phase 5H dedicated driver was never provisioned; string is marker-only.
 */
export const FINANCE_FR1_FIXTURE_SYNTHETIC_DRIVER_ID =
  "test_adminnext_finance_fr1_driver_ref_001" as const;

/**
 * Exact legacy-shaped order payload (majors in SAR major units).
 * Minor-unit expectations for FR1 calc: gross 10000, commission 1500,
 * driver net 8500, eligible 10000, VAT persisted 0 (VatPolicy not approved —
 * historical amount only; do not invent rate).
 */
export type FinanceFr1SyntheticCompletedOrderDoc = {
  readonly synthetic: true;
  readonly financePilot: true;
  readonly is_test: true;
  readonly admin_next_finance_fixture: true;
  readonly fixture_tag: "finance_fr1_synthetic_completed_v1";
  readonly notes: "SYNTHETIC finance FR1 pilot fixture — not a real trip";

  readonly status_code: "completed";
  readonly halh_order: "Completed";
  readonly finished: true;

  readonly currency: "SAR";
  readonly country_id: typeof FINANCE_FR1_FIXTURE_COUNTRY_ID;
  readonly Rev_dolh: {
    readonly path: typeof FINANCE_FR1_FIXTURE_COUNTRY_PATH;
    readonly id: typeof FINANCE_FR1_FIXTURE_COUNTRY_ID;
  };

  /** Gross fare major (100 SAR → 10000 minor). */
  readonly total_mndob2: 100;
  /** Customer payable / eligible major (no discount represented). */
  readonly total: 100;
  /** Platform commission historical amount (15 SAR → 1500 minor = FC-01 15%). */
  readonly total_app: 15;
  /**
   * Persisted VAT amount only (FP-09). VatPolicy draft/unapproved —
   * do not invent country VAT rate; fixture uses authoritative 0.
   */
  readonly total_vat: 0;
  /** Driver net major (85 SAR → 8500 minor). */
  readonly total_mndob: 85;

  readonly PaymentMethod: "Cash";
  readonly payment_method: "cash";
  readonly payment_status: "cash_collected";

  /** String-only synthetic driver marker — no user doc write. */
  readonly driver_id: typeof FINANCE_FR1_FIXTURE_SYNTHETIC_DRIVER_ID;

  /**
   * Pre-seed FIN-9 skip gates so IF an order create were ever attempted,
   * syncAgentSnapshotOnOrderCreate would no-op (agent_snapshot_at present).
   * Agent remains unknown_historical for FR1 (no invented attribution).
   */
  readonly agent_snapshot_at: "2026-09-13T00:00:00.000Z";
  readonly agent_snapshot_version: "FIN-9";
  readonly agent_attribution_status: "none";

  /** Explicit non-PII customer label for synthetic classifier safety. */
  readonly naim_user_text: "SYNTHETIC_FINANCE_FR1_FIXTURE";
  readonly IDorder: "SYN-FR1-001";
};

export const FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC: FinanceFr1SyntheticCompletedOrderDoc =
  {
    synthetic: true,
    financePilot: true,
    is_test: true,
    admin_next_finance_fixture: true,
    fixture_tag: "finance_fr1_synthetic_completed_v1",
    notes: "SYNTHETIC finance FR1 pilot fixture — not a real trip",

    status_code: "completed",
    halh_order: "Completed",
    finished: true,

    currency: "SAR",
    country_id: FINANCE_FR1_FIXTURE_COUNTRY_ID,
    Rev_dolh: {
      path: FINANCE_FR1_FIXTURE_COUNTRY_PATH,
      id: FINANCE_FR1_FIXTURE_COUNTRY_ID,
    },

    total_mndob2: 100,
    total: 100,
    total_app: 15,
    total_vat: 0,
    total_mndob: 85,

    PaymentMethod: "Cash",
    payment_method: "cash",
    payment_status: "cash_collected",

    driver_id: FINANCE_FR1_FIXTURE_SYNTHETIC_DRIVER_ID,

    agent_snapshot_at: "2026-09-13T00:00:00.000Z",
    agent_snapshot_version: "FIN-9",
    agent_attribution_status: "none",

    naim_user_text: "SYNTHETIC_FINANCE_FR1_FIXTURE",
    IDorder: "SYN-FR1-001",
  };

/** Forbidden on fixture — real PII, settlement, wallet, Auth, overwrite targets. */
export const FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_FIELDS = [
  "phone_number",
  "phone_n",
  "email",
  "display_name",
  "fcm_token",
  "fcm_tokens",
  "uid",
  "mndob_user", // DocumentReference would imply real user path coupling
  "agent_id", // do not invent agent attribution
  "agent_amount",
  "agent_amount_minor",
  "agent_rate",
  "ksm", // discount not represented — omit rather than invent 0 as funding
  "discount",
  "discount_amount",
  "settlement_id",
  "financial_settlement_id",
  "wallet_adjusted",
  "production_financial",
  "real_trip",
] as const;

export type FinanceFr1SyntheticFixtureRegistryDoc = {
  readonly schemaVersion: "finance_fr1_synthetic_order_fixture_v1";
  readonly synthetic: true;
  readonly financePilot: true;
  readonly targetCollectionIfMaterialized: "order";
  readonly orderId: typeof FINANCE_FR1_SYNTHETIC_ORDER_ID;
  readonly orderMaterialization: "forbidden_while_ORDER_TRIGGER_INSPECTION_NO_GO";
  readonly settlementV2: false;
  readonly orderPayload: FinanceFr1SyntheticCompletedOrderDoc;
};

export const FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC: FinanceFr1SyntheticFixtureRegistryDoc =
  {
    schemaVersion: "finance_fr1_synthetic_order_fixture_v1",
    synthetic: true,
    financePilot: true,
    targetCollectionIfMaterialized: "order",
    orderId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    orderMaterialization: "forbidden_while_ORDER_TRIGGER_INSPECTION_NO_GO",
    settlementV2: false,
    orderPayload: FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
  };

export type FinanceFr1SyntheticFixtureEligibility = {
  synthetic: true;
  classification: "synthetic_test";
  lifecycleCompleted: true;
  currency: "SAR";
  country: typeof FINANCE_FR1_FIXTURE_COUNTRY_ID;
  paymentMethod: "cash";
  grossFareMinor: "10000";
  commissionAmountPersistedMinor: "1500";
  driverNetMinor: "8500";
  eligibleRevenueMinor: "10000";
  vatAmountMinor: "0";
  agentAttributionStatus: "unknown_historical";
  discountNotRepresented: true;
  reconciliationStatus: "preconditions_ok";
};

/**
 * Offline eligibility / schema assertion against FR1 classifier + calculator.
 */
export function assertFinanceFr1SyntheticFixtureEligibility(
  documentId: string = FINANCE_FR1_SYNTHETIC_ORDER_ID,
  data: FinanceFr1SyntheticCompletedOrderDoc = FINANCE_FR1_SYNTHETIC_COMPLETED_ORDER_DOC,
): FinanceFr1SyntheticFixtureEligibility {
  const order = {
    documentId,
    data: data as unknown as Record<string, unknown>,
  };
  const classification = classifyFinanceFr1Trip(order);
  if (classification !== "synthetic_test") {
    throw new Error(`Fixture must classify synthetic_test, got ${classification}`);
  }

  for (const field of FINANCE_FR1_SYNTHETIC_FIXTURE_FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      throw new Error(`Forbidden field present on fixture: ${field}`);
    }
  }

  const snap = calculateFinanceFr1PilotSnapshot({
    order,
    actorUserId: "finance_fr1_fixture_prep_actor",
    discountFundingOwner: "company",
    asOfUtc: "2026-09-13T21:00:00.000Z",
  });

  if (!snap.lifecycleCompleted) throw new Error("Fixture must be completed");
  if (snap.currency !== "SAR") throw new Error("Fixture currency must be SAR");
  if (snap.paymentMethod !== "cash") throw new Error("Fixture must be cash");
  if (snap.grossFareMinor !== "10000") throw new Error("gross must be 10000 minor");
  if (snap.commissionAmountPersistedMinor !== "1500") {
    throw new Error("commission persisted must be 1500 minor");
  }
  if (snap.commissionAmountFromApprovedRateMinor !== "1500") {
    throw new Error("FC-01 15% diagnostic must be 1500 minor");
  }
  if (snap.driverNetMinor !== "8500") throw new Error("driver net must be 8500 minor");
  if (snap.eligibleRevenueMinor !== "10000") {
    throw new Error("eligible must be 10000 minor");
  }
  if (snap.vatAmountMinor !== "0") throw new Error("vat persisted must be 0");
  if (snap.discountMinor != null) {
    throw new Error("discount must not be represented");
  }
  if (snap.agentAttributionStatus !== "unknown_historical") {
    throw new Error("agent must be unknown_historical (not invented)");
  }
  if (snap.reconciliationStatus !== "preconditions_ok") {
    throw new Error(
      `reconciliation blocked: ${snap.reconciliationBlockers.join(",")}`,
    );
  }

  return {
    synthetic: true,
    classification: "synthetic_test",
    lifecycleCompleted: true,
    currency: "SAR",
    country: FINANCE_FR1_FIXTURE_COUNTRY_ID,
    paymentMethod: "cash",
    grossFareMinor: "10000",
    commissionAmountPersistedMinor: "1500",
    driverNetMinor: "8500",
    eligibleRevenueMinor: "10000",
    vatAmountMinor: "0",
    agentAttributionStatus: "unknown_historical",
    discountNotRepresented: true,
    reconciliationStatus: "preconditions_ok",
  };
}
