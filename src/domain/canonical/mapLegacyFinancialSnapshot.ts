/**
 * Phase 3.6 — map Legacy Financial Snapshot → Canonical Financial Trip Read Model.
 * Historical read rules (CRITICAL):
 * - platform commission amount from persisted total_app (never recalc %)
 * - driver net from total_mndob; derived only with provenance
 * - agent: snapshot or unknown_historical (never current country agent)
 * - VAT amount from total_vat; rate null if not proven
 * - chargeback: not_represented, amount null (NEVER 0)
 * Incomplete ≠ zero. NOT a Ledger. Observed Legacy ≠ Future Policy.
 *
 * Synthetic Phase 2 finance (FinancialCalculationService) is SEPARATE —
 * that path uses SyntheticFinancialPolicy for new synthetic trips only.
 */

import {
  CANONICAL_MAPPING_VERSION,
  assertIncompleteNotZero,
  nullWithProvenance,
  provenValue,
  type FinancialAvailabilityStatus,
  type FinancialConceptClass,
} from "@/domain/canonical/FieldProvenance";
import type {
  AgentAttributionStatus,
  CanonicalFinancialTripReadModel,
  CanonicalMoneyField,
  UnmappedStatus,
} from "@/domain/canonical/CanonicalReadModels";
import { historicalChargebackNotRepresented } from "@/domain/canonical/ChargebackPolicy";
import {
  DISCOUNT_TREATMENT_POLICY_UNRESOLVED,
  mayReduceDriverNetByDiscount,
} from "@/domain/canonical/DiscountTreatmentPolicy";
import { evaluateTripFinancialSafety } from "@/domain/canonical/FinancialFieldSafety";
import { NO_HISTORICAL_RECALCULATION_RULE } from "@/domain/canonical/CanonicalFinancialSourcePriorityPolicy";

export type LegacyFinancialSnapshotFixture = {
  orderId: string;
  currency?: string | null;
  total?: number | null;
  total_mndob2?: number | null;
  total_app?: number | null;
  total_vat?: number | null;
  total_mndob?: number | null;
  ksm?: number | null;
  PaymentMethod?: string | null;
  ALLNOW?: boolean | null;
  payment_status?: string | null;
  agent_amount?: number | null;
  agent_amount_minor?: number | null;
  agent_rate?: number | null;
  /** Historical agent id snapshot on order (FIN-9) — never invent from current agent. */
  agent_id?: string | null;
  agentIdSnapshot?: string | null;
  /** Optional derived driver net when total_mndob missing (proven Legacy formula only). */
  allowDerivedDriverNet?: boolean;
  derivedDriverNetMajor?: number | null;
  /** Observed quote inputs (synthetic) for differential tests */
  observed?: {
    baseFareHalalas?: number;
    appFeeHalalas?: number;
    vatHalalas?: number;
    discountHalalas?: number;
    amountHalalas?: number;
    platformFeePercentHardcoded?: number;
    vatPercent?: number;
    isvat?: boolean;
    agentTotalPercent?: number;
  };
};

const V = CANONICAL_MAPPING_VERSION;

function moneyMajor(
  value: number | null | undefined,
  field: string,
  collection: string,
  docId: string,
  classification: FinancialConceptClass,
  availability: FinancialAvailabilityStatus,
  warnings: string[] = [],
  currency: string | null = null,
  extras?: {
    derivedFrom?: string[];
    formulaId?: string | null;
    mappingConfidence?: "high" | "medium" | "low" | "unknown" | "unproven";
  },
): CanonicalMoneyField {
  if (value == null || !Number.isFinite(value)) {
    const status: FinancialAvailabilityStatus =
      availability === "not_represented" || availability === "unknown"
        ? availability
        : availability === "conflicting"
          ? "conflicting"
          : "missing";
    const n = nullWithProvenance(`missing_or_nonfinite:${field}`, {
      sourceSystem: "legacy",
      sourceCollection: collection,
      sourceDocumentId: docId,
      sourceField: field,
      mappingConfidence: extras?.mappingConfidence ?? "unknown",
      availabilityStatus: status,
      warnings,
      derivedFrom: extras?.derivedFrom,
      formulaId: extras?.formulaId,
    });
    assertIncompleteNotZero(field, n.value, status);
    return {
      ...n,
      unit: "unknown",
      currencyCode: currency,
      classification,
      availabilityStatus: status,
    };
  }

  // Never treat conflicting / not_represented as a numeric available value of 0 invented.
  if (
    availability === "not_represented" ||
    availability === "conflicting" ||
    availability === "unknown"
  ) {
    const n = nullWithProvenance(`${availability}:${field}`, {
      sourceSystem: "legacy",
      sourceCollection: collection,
      sourceDocumentId: docId,
      sourceField: field,
      mappingConfidence: "unproven",
      availabilityStatus: availability,
      warnings,
    });
    assertIncompleteNotZero(field, n.value, availability);
    return {
      ...n,
      unit: "unknown",
      currencyCode: currency,
      classification,
      availabilityStatus: availability,
    };
  }

  const conf =
    extras?.mappingConfidence ??
    (availability === "derived" ? "medium" : "high");
  const p = provenValue(value, {
    sourceSystem: "legacy",
    sourceCollection: collection,
    sourceDocumentId: docId,
    sourceField: field,
    sourceValue: value,
    mappingConfidence: conf,
    warnings,
    availabilityStatus: availability,
    derivedFrom: extras?.derivedFrom,
    formulaId: extras?.formulaId,
  });
  return {
    ...p,
    unit: "major",
    currencyCode: currency,
    classification,
    availabilityStatus: availability,
  };
}

/**
 * Observed Legacy Behavior (CF verifiedBookingAmount) — for differential tests only.
 * NOT Admin Next production policy. Default 15 here documents Observed Legacy CF hardcode —
 * FinancialCalculationService / FinancialPolicyProvider must NOT hardcode 0.15/15 for Admin Next.
 */
export function observedLegacyQuoteMajors(input: {
  baseFareHalalas: number;
  platformFeePercent?: number;
  vatPercent?: number;
  applyVat?: boolean;
  discountHalalas?: number;
}): {
  total_mndob2: number;
  total_app: number;
  total_vat: number;
  total: number;
  total_mndob: number;
  appFeeHalalas: number;
  vatHalalas: number;
  amountHalalas: number;
} {
  const percentOf = (amount: number, percent: number) => {
    const safe = Number(percent);
    if (!Number.isFinite(safe) || safe <= 0) return 0;
    return Math.round((amount * safe) / 100);
  };
  const base = input.baseFareHalalas;
  // Observed Legacy CF default — intentionally named; not FinancialPolicyProvider.
  const OBSERVED_LEGACY_CF_PLATFORM_PERCENT_DEFAULT = 15;
  const app = percentOf(
    base,
    input.platformFeePercent ?? OBSERVED_LEGACY_CF_PLATFORM_PERCENT_DEFAULT,
  );
  const vat =
    input.applyVat === true ? percentOf(base, input.vatPercent ?? 0) : 0;
  const discount = input.discountHalalas ?? 0;
  const amount = base - discount;
  return {
    total_mndob2: base / 100,
    total_app: app / 100,
    total_vat: vat / 100,
    total: amount / 100,
    total_mndob: (base - app - vat) / 100,
    appFeeHalalas: app,
    vatHalalas: vat,
    amountHalalas: amount,
  };
}

export function mapLegacyFinancialSnapshotToCanonical(
  snap: LegacyFinancialSnapshotFixture,
): CanonicalFinancialTripReadModel {
  const docId = snap.orderId;
  const collection = "order";
  const currency =
    snap.currency && String(snap.currency).trim()
      ? String(snap.currency).trim().toUpperCase()
      : null;

  const incompleteReasons: string[] = [];
  const warnings: string[] = [
    "Observed Legacy Behavior only — not Admin Next production financial policy",
    "CanonicalFinancialTripReadModel is NOT a Ledger",
    NO_HISTORICAL_RECALCULATION_RULE,
    "Synthetic Phase 2 FinancialCalculationService is separate from Canonical historical read rules",
  ];

  if (!currency) {
    incompleteReasons.push("currency_missing");
  }

  const channelRaw = (() => {
    const pm = (snap.PaymentMethod || "").toString().toLowerCase();
    if (snap.ALLNOW === true || pm.includes("online") || pm.includes("card")) {
      return "online" as const;
    }
    if (pm.includes("cash") || snap.payment_status?.includes("cash")) {
      return "cash" as const;
    }
    if (!pm && snap.payment_status == null && snap.ALLNOW == null) {
      return "unmapped" as UnmappedStatus;
    }
    return "unknown" as const;
  })();

  const conceptClasses: Record<string, FinancialConceptClass> = {
    baseFare: "A_authoritative_persisted",
    grossFare: "A_authoritative_persisted",
    finalCustomerPrice: "A_authoritative_persisted",
    finalCustomerAmount: "A_authoritative_persisted",
    discount: snap.ksm != null ? "A_authoritative_persisted" : "D_missing",
    vatAmount: "A_authoritative_persisted",
    vatRatePercent: "E_unknown",
    platformCommissionAmount: "A_authoritative_persisted",
    // FC-01: rate is Future Policy Decision; READ uses amount only — rate stays null/unknown
    platformCommissionRatePercent: "E_unknown",
    agentCommissionAmount:
      snap.agent_amount != null || snap.agent_amount_minor != null
        ? "A_authoritative_persisted"
        : "D_missing",
    agentCommissionRate:
      snap.agent_rate != null ? "A_authoritative_persisted" : "D_missing",
    driverGross: "A_authoritative_persisted",
    driverNet: "A_authoritative_persisted",
    driverDeductions: "B_reliable_derived",
    cashCollected: "B_reliable_derived",
    onlineCollected: "B_reliable_derived",
    gatewayFee: "D_missing",
    refundAmount: "E_unknown",
    adjustmentAmount: "E_unknown",
    chargebackAmount: "E_unknown",
  };

  // Historical platform commission RATE: null unless snapshotted/proven on order.
  // Do NOT use observed CF 15 as canonical historical rate (FC-01 closed for READ amount).
  const platformRate = nullWithProvenance(
    "platform_rate_not_persisted_on_order_FC01_future_policy_open",
    {
      sourceSystem: "legacy",
      sourceCollection: collection,
      sourceDocumentId: docId,
      sourceField: null,
      mappingConfidence: "unproven",
      availabilityStatus: "unknown",
      warnings: [
        "FC-01 CLOSED for READ mapping of amount (use total_app); rate remains Future Policy Decision",
        "Do not hardcode 0.15/15 into Canonical historical rate",
      ],
    },
  );

  // Historical VAT rate: null if not historically proven on order.
  const vatRate = nullWithProvenance("vat_rate_not_on_order", {
    sourceSystem: "legacy",
    sourceCollection: collection,
    sourceDocumentId: docId,
    sourceField: "total_vat",
    mappingConfidence: "unproven",
    availabilityStatus: "unknown",
    warnings: [
      "Do NOT recompute VAT with current country VAT for historical trips",
      "vatRateAtTrip=null unless snapshotted",
    ],
  });

  const agentAmountMajor =
    snap.agent_amount != null
      ? snap.agent_amount
      : snap.agent_amount_minor != null
        ? snap.agent_amount_minor / 100
        : null;

  // Rate-only ≠ invent amount as high confidence
  if (
    agentAmountMajor == null &&
    snap.agent_rate != null &&
    Number.isFinite(snap.agent_rate)
  ) {
    warnings.push(
      "agent_rate present without agent_amount — amount stays null (do not invent)",
    );
    incompleteReasons.push("agent_amount_missing_rate_only");
  }

  const deductions =
    snap.total_app != null &&
    Number.isFinite(snap.total_app) &&
    snap.total_vat != null &&
    Number.isFinite(snap.total_vat)
      ? snap.total_app + snap.total_vat
      : null;

  const paid = (snap.payment_status || "").toLowerCase();
  const cashCollected =
    channelRaw === "cash" && (paid === "cash_collected" || paid === "paid")
      ? snap.total
      : null;
  const onlineCollected =
    channelRaw === "online" && (paid === "paid" || paid === "captured")
      ? snap.total
      : null;

  if (snap.total_app == null || !Number.isFinite(snap.total_app)) {
    incompleteReasons.push("platform_commission_amount_missing");
    conceptClasses.platformCommissionAmount = "D_missing";
  }

  let driverNetValue: number | null =
    snap.total_mndob != null && Number.isFinite(snap.total_mndob)
      ? snap.total_mndob
      : null;
  let driverNetAvailability: FinancialAvailabilityStatus = "available";
  let driverNetDerivedOnly = false;
  let driverNetExtras:
    | {
        derivedFrom?: string[];
        formulaId?: string | null;
        mappingConfidence?: "high" | "medium" | "low" | "unknown" | "unproven";
      }
    | undefined;

  if (driverNetValue == null) {
    if (
      snap.allowDerivedDriverNet === true &&
      snap.derivedDriverNetMajor != null &&
      Number.isFinite(snap.derivedDriverNetMajor)
    ) {
      driverNetValue = snap.derivedDriverNetMajor;
      driverNetAvailability = "derived";
      driverNetDerivedOnly = true;
      conceptClasses.driverNet = "B_reliable_derived";
      driverNetExtras = {
        derivedFrom: ["total_mndob2", "total_app", "total_vat"],
        formulaId: "legacy_cf_base_minus_app_minus_vat",
        mappingConfidence: "medium",
      };
      warnings.push(
        "Driver net DERIVED — not settlement-eligible without explicit policy",
      );
      incompleteReasons.push("driver_net_derived_not_settlement_eligible");
    } else {
      incompleteReasons.push("driver_net_missing");
      conceptClasses.driverNet = "D_missing";
      driverNetAvailability = "missing";
    }
  }

  // FC-02: discount must NOT auto-reduce driver net unless approved policy says so
  if (
    snap.ksm != null &&
    snap.ksm > 0 &&
    !mayReduceDriverNetByDiscount(DISCOUNT_TREATMENT_POLICY_UNRESOLVED)
  ) {
    warnings.push(
      "FC-02 DiscountTreatmentPolicy unresolved — discount NOT applied as driver-net reduction; conflict kept visible",
    );
  }

  if (conceptClasses.gatewayFee === "D_missing") {
    incompleteReasons.push("gateway_fee_not_represented");
  }

  const chargeback = historicalChargebackNotRepresented();
  warnings.push(chargeback.notes);

  // Agent attribution: never use currently active country agent
  const snapshotAgentId =
    snap.agentIdSnapshot ?? snap.agent_id ?? null;
  let agentAttributionStatus: AgentAttributionStatus;
  let agentIdField: CanonicalFinancialTripReadModel["agentId"];

  if (snapshotAgentId && String(snapshotAgentId).trim()) {
    agentAttributionStatus = "snapshot";
    agentIdField = {
      ...provenValue(String(snapshotAgentId).trim(), {
        sourceSystem: "legacy",
        sourceCollection: collection,
        sourceDocumentId: docId,
        sourceField: "agent_id|agentIdSnapshot",
        mappingConfidence: "high",
        availabilityStatus: "available",
        warnings: ["Historical agent from order snapshot"],
      }),
      availabilityStatus: "available",
    };
  } else {
    agentAttributionStatus = "unknown_historical";
    agentIdField = {
      ...nullWithProvenance("unknown_historical_agent_attribution_FC05", {
        sourceSystem: "legacy",
        sourceCollection: collection,
        sourceDocumentId: docId,
        sourceField: "agent_id",
        mappingConfidence: "unknown",
        availabilityStatus: "unknown",
        warnings: [
          "Never attribute historical obligation to currently active country agent",
          "Blocks agent settlement/attribution; trip display OK",
        ],
      }),
      availabilityStatus: "unknown",
    };
    incompleteReasons.push("agent_attribution_unknown_historical");
  }

  const baseFare = moneyMajor(
    snap.total_mndob2,
    "total_mndob2",
    collection,
    docId,
    conceptClasses.baseFare,
    snap.total_mndob2 != null && Number.isFinite(snap.total_mndob2)
      ? "available"
      : "missing",
    ["Gross base fare — V1 name deliveryFees is misleading"],
    currency,
  );

  const finalCustomer = moneyMajor(
    snap.total,
    "total",
    collection,
    docId,
    conceptClasses.finalCustomerPrice,
    snap.total != null && Number.isFinite(snap.total) ? "available" : "missing",
    [],
    currency,
  );

  const platformCommissionAmount = moneyMajor(
    snap.total_app,
    "total_app",
    collection,
    docId,
    conceptClasses.platformCommissionAmount,
    snap.total_app != null && Number.isFinite(snap.total_app)
      ? "available"
      : "missing",
    [
      "Historical platformCommissionAmount = persisted total_app (do NOT recalculate with current %)",
      "FC-01 CLOSED for READ amount mapping; rate Future Policy open",
    ],
    currency,
  );

  const vatAmount = moneyMajor(
    snap.total_vat,
    "total_vat",
    collection,
    docId,
    conceptClasses.vatAmount,
    snap.total_vat != null && Number.isFinite(snap.total_vat)
      ? "available"
      : "missing",
    ["Historical VAT: read stored amount; do NOT recompute with current country VAT"],
    currency,
  );

  const driverNet = moneyMajor(
    driverNetValue,
    driverNetAvailability === "derived"
      ? "derived:total_mndob"
      : "total_mndob",
    collection,
    docId,
    conceptClasses.driverNet,
    driverNetAvailability,
    [
      "V1 property repCommission ≡ driver net (misleading name)",
      "CF write: base - app - vat (not customer total)",
      ...(driverNetDerivedOnly
        ? ["derived NOT settlement-eligible without explicit policy"]
        : []),
    ],
    currency,
    driverNetExtras,
  );

  const chargebackAmount = moneyMajor(
    null,
    "chargeback",
    collection,
    docId,
    "E_unknown",
    "not_represented",
    [chargeback.notes, "FC-07 CLOSED for READ — never invent chargebacks=0"],
    currency,
  );

  const safety = evaluateTripFinancialSafety({
    fields: [
      {
        name: "grossFare",
        availability: baseFare.availabilityStatus,
        value: baseFare.value,
        criticalForSettlement: true,
      },
      {
        name: "finalCustomerAmount",
        availability: finalCustomer.availabilityStatus,
        value: finalCustomer.value,
        criticalForSettlement: true,
      },
      {
        name: "platformCommissionAmount",
        availability: platformCommissionAmount.availabilityStatus,
        value: platformCommissionAmount.value,
        criticalForSettlement: true,
      },
      {
        name: "driverNet",
        availability: driverNet.availabilityStatus,
        value: driverNet.value,
        criticalForSettlement: true,
      },
      {
        name: "vatAmount",
        availability: vatAmount.availabilityStatus,
        value: vatAmount.value,
        criticalForSettlement: false,
      },
      {
        name: "vatRate",
        availability: "unknown",
        value: null,
        criticalForSettlement: false,
      },
      {
        name: "chargebackAmount",
        availability: "not_represented",
        value: null,
        criticalForSettlement: false,
      },
      {
        name: "agentAttribution",
        availability:
          agentAttributionStatus === "unknown_historical"
            ? "unknown"
            : "available",
        value: null,
        criticalForSettlement: agentAttributionStatus === "unknown_historical",
      },
    ],
    agentAttributionStatus,
    discountTreatmentUnresolved:
      DISCOUNT_TREATMENT_POLICY_UNRESOLVED.treatmentStatus === "unresolved",
    currencyPresent: Boolean(currency),
    hasConflictingCommissionRate: true, // rate unknown / future policy
    driverNetDerivedOnly,
  });

  warnings.push(...safety.displayWarnings);

  return {
    tripId: docId,
    legacyCollection: "order",
    legacyDocumentId: docId,
    currencyCode: currency
      ? {
          ...provenValue(currency, {
            sourceSystem: "legacy",
            sourceCollection: collection,
            sourceDocumentId: docId,
            sourceField: "currency",
            mappingConfidence: "medium",
            availabilityStatus: "available",
          }),
          availabilityStatus: "available" as const,
        }
      : {
          ...nullWithProvenance("currency_missing", {
            sourceSystem: "legacy",
            sourceCollection: collection,
            sourceDocumentId: docId,
            sourceField: "currency",
            availabilityStatus: "missing",
          }),
          availabilityStatus: "missing" as const,
        },
    baseFare,
    grossFare: baseFare,
    finalCustomerPrice: finalCustomer,
    finalCustomerAmount: finalCustomer,
    discount: moneyMajor(
      snap.ksm,
      "ksm",
      collection,
      docId,
      conceptClasses.discount,
      snap.ksm != null && Number.isFinite(snap.ksm) ? "available" : "missing",
      [],
      currency,
    ),
    vatRatePercent: {
      ...vatRate,
      classification: conceptClasses.vatRatePercent,
      availabilityStatus: "unknown",
    },
    vatRateAtTrip: {
      ...vatRate,
      classification: conceptClasses.vatRatePercent,
      availabilityStatus: "unknown",
    },
    vatAmount,
    platformCommissionRatePercent: {
      ...platformRate,
      classification: conceptClasses.platformCommissionRatePercent,
      availabilityStatus: "unknown",
    },
    platformCommissionAmount,
    agentCommissionAmount: moneyMajor(
      agentAmountMajor,
      snap.agent_amount != null ? "agent_amount" : "agent_amount_minor",
      collection,
      docId,
      conceptClasses.agentCommissionAmount,
      agentAmountMajor != null ? "available" : "missing",
      ["Share of platform fee — Agent_total%; not additive to customer total"],
      currency,
    ),
    agentCommissionRatePercent:
      snap.agent_rate != null && Number.isFinite(snap.agent_rate)
        ? {
            ...provenValue(snap.agent_rate, {
              sourceSystem: "legacy",
              sourceCollection: collection,
              sourceDocumentId: docId,
              sourceField: "agent_rate",
              mappingConfidence: "medium",
              availabilityStatus: "available",
              warnings: ["Rate snapshot only — does not invent amount"],
            }),
            classification: conceptClasses.agentCommissionRate,
            availabilityStatus: "available" as const,
          }
        : {
            ...nullWithProvenance("agent_rate_missing", {
              sourceSystem: "legacy",
              sourceCollection: collection,
              sourceDocumentId: docId,
              sourceField: "agent_rate",
              availabilityStatus: "missing",
            }),
            classification: conceptClasses.agentCommissionRate,
            availabilityStatus: "missing" as const,
          },
    driverGross: moneyMajor(
      snap.total_mndob2,
      "total_mndob2",
      collection,
      docId,
      conceptClasses.driverGross,
      snap.total_mndob2 != null && Number.isFinite(snap.total_mndob2)
        ? "available"
        : "missing",
      [],
      currency,
    ),
    driverDeductions: moneyMajor(
      deductions,
      "total_app+total_vat",
      collection,
      docId,
      conceptClasses.driverDeductions,
      deductions != null ? "derived" : "missing",
      ["Derived: platform + VAT (Observed)"],
      currency,
      {
        derivedFrom: ["total_app", "total_vat"],
        formulaId: "legacy_app_plus_vat",
        mappingConfidence: "medium",
      },
    ),
    driverNet,
    cashCollected: moneyMajor(
      cashCollected ?? null,
      "total|payment_status",
      collection,
      docId,
      conceptClasses.cashCollected,
      cashCollected != null ? "derived" : "missing",
      cashCollected == null
        ? ["Cash collected only when payment_status proves collection"]
        : [],
      currency,
    ),
    onlineCollected: moneyMajor(
      onlineCollected ?? null,
      "total|payment_status",
      collection,
      docId,
      conceptClasses.onlineCollected,
      onlineCollected != null ? "derived" : "missing",
      [],
      currency,
    ),
    gatewayFee: moneyMajor(
      null,
      "gateway_fee",
      collection,
      docId,
      "D_missing",
      "missing",
      ["gateway_fee_NOT_FOUND_in_legacy_order_pipeline"],
      currency,
    ),
    refundAmount: moneyMajor(
      null,
      "refund_amount",
      collection,
      docId,
      "E_unknown",
      "unknown",
      ["refund_amount_not_on_order_snapshot"],
      currency,
    ),
    adjustmentAmount: moneyMajor(
      null,
      "adjustment_amount",
      collection,
      docId,
      "E_unknown",
      "unknown",
      ["adjustment_lives_in_finance_controls_not_order"],
      currency,
    ),
    chargebackAmount,
    chargebackStatus: chargeback.status,
    agentId: agentIdField,
    agentAttributionStatus,
    agentIdSnapshot: snapshotAgentId ? String(snapshotAgentId).trim() : null,
    agentCommissionRateSnapshot:
      snap.agent_rate != null && Number.isFinite(snap.agent_rate)
        ? snap.agent_rate
        : null,
    agentCommissionAmountSnapshot: agentAmountMajor,
    agentPolicyVersion: null,
    paymentChannel: {
      value: channelRaw === "unmapped" ? "unmapped" : channelRaw,
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: collection,
        sourceDocumentId: docId,
        sourceField: "PaymentMethod|ALLNOW|payment_status",
        sourceValue: snap.PaymentMethod ?? snap.ALLNOW ?? snap.payment_status,
        mappingConfidence: channelRaw === "unmapped" ? "unknown" : "medium",
        mappingVersion: V,
        warnings:
          channelRaw === "unmapped"
            ? ["Unknown payment channel → unmapped (never guess nearest)"]
            : [],
        availabilityStatus:
          channelRaw === "unmapped" ? "unknown" : "available",
      },
      availabilityStatus: channelRaw === "unmapped" ? "unknown" : "available",
    },
    observedFormulas: [
      "OBSERVED LEGACY ONLY: appFeeHalalas = percentOf(baseFareHalalas, 15) // CF hardcoded — NOT Admin Next policy",
      "OBSERVED LEGACY ONLY: vatHalalas = country.isvat ? percentOf(baseFareHalalas, country.vat) : 0",
      "OBSERVED LEGACY ONLY: total_mndob = (base - app - vat)/100",
      "OBSERVED LEGACY ONLY: total = (base - discount)/100",
      "OBSERVED LEGACY ONLY: agent_amount_minor = round(platformFeeMinor * Agent_total / 100)",
      "CANONICAL HISTORICAL READ: platformCommissionAmount = order.total_app (no recalc)",
      "CANONICAL HISTORICAL READ: vatAmount = order.total_vat (no recalc)",
      "CANONICAL HISTORICAL READ: chargebackAmount = null + not_represented",
    ],
    conceptClasses,
    incompleteReasons,
    warnings,
    safety,
    isSafeForDisplay: safety.isSafeForDisplay,
    isSafeForSettlement: safety.isSafeForSettlement,
    isSafeForAccounting: safety.isSafeForAccounting,
    mappingConfidence: incompleteReasons.length ? "medium" : "high",
    mappingVersion: V,
    isLedger: false,
  };
}

/** Source priority for Production Read — Evidence-based policy statement only. */
export const LEGACY_FINANCIAL_SOURCE_PRIORITY = [
  {
    priority: 1,
    source: "order persisted majors (total, total_mndob2, total_app, total_vat, total_mndob)",
    class: "A_authoritative_persisted" as FinancialConceptClass,
    note: "Written by CF bookingFinancialMajorsFromQuote / payment-api build-order",
  },
  {
    priority: 2,
    source: "order agent_* FIN-9 snapshot fields",
    class: "A_authoritative_persisted" as FinancialConceptClass,
    note: "Newer orders only; historical often missing",
  },
  {
    priority: 3,
    source: "financial_accounting_v2 analyzeOrder derived driverNet",
    class: "B_reliable_derived" as FinancialConceptClass,
    note: "Use only when stored total_mndob missing; prefer DERIVED_FROM_GROSS_BASE when ksm>0; not settlement-eligible by default",
  },
  {
    priority: 4,
    source: "V1 FinancialEngine aliases (repCommission/deliveryFees)",
    class: "C_conflicting" as FinancialConceptClass,
    note: "Misleading names — never map by property name alone",
  },
  {
    priority: 5,
    source: "app_commission_percent on user/countries",
    class: "C_conflicting" as FinancialConceptClass,
    note: "CF hardcodes 15%; field authority UNRESOLVED — Future Policy; Canonical historical rate stays null",
  },
  {
    priority: 6,
    source: "Admin Next SyntheticFinancialPolicy",
    class: "E_unknown" as FinancialConceptClass,
    note: "Synthetic only; productionApproved=false — never as Production SoT; separate from Canonical historical read",
  },
] as const;
