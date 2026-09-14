/**
 * Phase 3.6 — DiscountTreatmentPolicy (FC-02).
 * Status unresolved; productionApproved=false.
 * Discount must NOT be auto-treated as driver-net reduction unless policy says so.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import { createDraftFinancialPolicy } from "@/domain/canonical/FinancialPolicy";

export type DiscountTreatmentStatus =
  | "unresolved"
  | "reduces_customer_only"
  | "reduces_driver_net"
  | "shared_allocation";

export type DiscountTreatmentPolicy = FinancialPolicy & {
  kind: "discount_treatment";
  treatmentStatus: DiscountTreatmentStatus;
  /** When unresolved, mapper must keep conflict visible as warning. */
  autoApplyToDriverNet: false;
};

export const DISCOUNT_TREATMENT_POLICY_UNRESOLVED: DiscountTreatmentPolicy = {
  ...createDraftFinancialPolicy({
    policyId: "DISCOUNT_TREATMENT_POLICY",
    version: "0.1.0-unresolved",
    notes:
      "FC-02: Observed Legacy CF writes driver net from base−app−vat (discount does not reduce total_mndob). Future unified formula UNRESOLVED — productionApproved=false.",
  }),
  kind: "discount_treatment",
  treatmentStatus: "unresolved",
  autoApplyToDriverNet: false,
  productionApproved: false,
  status: "draft",
};

/**
 * Historical display rule: never auto-reduce driver net by discount
 * unless an approved policy explicitly allows it.
 */
export function mayReduceDriverNetByDiscount(
  policy: DiscountTreatmentPolicy = DISCOUNT_TREATMENT_POLICY_UNRESOLVED,
): boolean {
  if (!policy.productionApproved || policy.status !== "approved") {
    return false;
  }
  return policy.treatmentStatus === "reduces_driver_net" && policy.autoApplyToDriverNet;
}
