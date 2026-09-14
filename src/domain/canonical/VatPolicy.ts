/**
 * Phase 3.6 — Future VatPolicy types.
 * productionApproved=false until Owner/Accountant approval.
 * Historical VAT: read stored total_vat; do NOT recompute with current country VAT.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import { createDraftFinancialPolicy } from "@/domain/canonical/FinancialPolicy";

export type VatCalculationMode = "percent_of_base" | "percent_of_total" | "unknown";
export type VatTaxBaseDefinition = "base_fare" | "final_customer" | "unresolved";
export type VatInclusiveOrExclusive = "inclusive" | "exclusive" | "unresolved";
export type VatRoundingMode = "half_up_minor" | "bankers" | "unresolved";

export type VatPolicy = FinancialPolicy & {
  kind: "vat";
  rateBps: number | null;
  calculationMode: VatCalculationMode;
  taxBaseDefinition: VatTaxBaseDefinition;
  inclusiveOrExclusive: VatInclusiveOrExclusive;
  roundingMode: VatRoundingMode;
};

export const FUTURE_VAT_POLICY_DRAFT: VatPolicy = {
  ...createDraftFinancialPolicy({
    policyId: "FUTURE_VAT_POLICY",
    version: "0.1.0-draft",
    notes:
      "Future VAT policy shell — not approved. Historical trips use persisted total_vat only.",
  }),
  kind: "vat",
  rateBps: null,
  calculationMode: "unknown",
  taxBaseDefinition: "unresolved",
  inclusiveOrExclusive: "unresolved",
  roundingMode: "unresolved",
  productionApproved: false,
  status: "draft",
};
