/**
 * Phase 3.6 — Field classification for Phase 4 prep.
 * READ_SAFE | READ_WITH_WARNING | DO_NOT_EXPOSE_YET
 * Sensitivity: public_admin | operational_sensitive | financial_sensitive | identity_sensitive
 */

export type ReadExposureClass =
  | "READ_SAFE"
  | "READ_WITH_WARNING"
  | "DO_NOT_EXPOSE_YET";

export type FieldSensitivity =
  | "public_admin"
  | "operational_sensitive"
  | "financial_sensitive"
  | "identity_sensitive";

export type CanonicalFieldClassification = {
  canonicalField: string;
  exposure: ReadExposureClass;
  sensitivity: FieldSensitivity;
  notes: string;
};

export const CANONICAL_FIELD_CLASSIFICATIONS: CanonicalFieldClassification[] = [
  {
    canonicalField: "grossFare",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "Persisted total_mndob2 / base when present",
  },
  {
    canonicalField: "finalCustomerAmount",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "Persisted order.total",
  },
  {
    canonicalField: "vatAmount",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "Persisted total_vat; rate may be missing",
  },
  {
    canonicalField: "vatRate",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "Not on order — null unless historically proven",
  },
  {
    canonicalField: "platformCommissionAmount",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "Persisted total_app — high confidence amount",
  },
  {
    canonicalField: "platformCommissionRate",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "FC-01 rate unresolved for future; historical rate null",
  },
  {
    canonicalField: "agentCommissionAmount",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "FIN-9 snapshot when present; else missing",
  },
  {
    canonicalField: "agentCommissionRate",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "Rate-only ≠ invent amount",
  },
  {
    canonicalField: "driverGross",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "total_mndob2",
  },
  {
    canonicalField: "driverDeductions",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "Derived app+vat when both present",
  },
  {
    canonicalField: "driverNet",
    exposure: "READ_SAFE",
    sensitivity: "financial_sensitive",
    notes: "total_mndob when present; derived not settlement-eligible by default",
  },
  {
    canonicalField: "cashCollected",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "Only when payment_status proves collection",
  },
  {
    canonicalField: "onlineCollected",
    exposure: "READ_WITH_WARNING",
    sensitivity: "financial_sensitive",
    notes: "Only when payment_status proves capture/paid",
  },
  {
    canonicalField: "refundAmount",
    exposure: "DO_NOT_EXPOSE_YET",
    sensitivity: "financial_sensitive",
    notes: "Not on order snapshot reliably",
  },
  {
    canonicalField: "chargebackAmount",
    exposure: "DO_NOT_EXPOSE_YET",
    sensitivity: "financial_sensitive",
    notes: "not_represented — never expose as 0",
  },
  {
    canonicalField: "gatewayFee",
    exposure: "DO_NOT_EXPOSE_YET",
    sensitivity: "financial_sensitive",
    notes: "NOT FOUND on trip pipeline",
  },
  {
    canonicalField: "adjustmentAmount",
    exposure: "DO_NOT_EXPOSE_YET",
    sensitivity: "financial_sensitive",
    notes: "Lives in finance_controls, not order",
  },
  {
    canonicalField: "agentId",
    exposure: "READ_WITH_WARNING",
    sensitivity: "identity_sensitive",
    notes: "unknown_historical when snapshot missing — never current agent",
  },
  {
    canonicalField: "customerId",
    exposure: "READ_SAFE",
    sensitivity: "identity_sensitive",
    notes: "Operational identity",
  },
  {
    canonicalField: "tripStatus",
    exposure: "READ_SAFE",
    sensitivity: "operational_sensitive",
    notes: "Unknown → unmapped",
  },
];

export function classificationFor(
  field: string,
): CanonicalFieldClassification | undefined {
  return CANONICAL_FIELD_CLASSIFICATIONS.find((c) => c.canonicalField === field);
}
