/**
 * Phase 3.6 — Chargeback domain types only.
 * Lifecycle NOT FOUND in Legacy → chargebackStatus=not_represented, amount=null (NEVER 0).
 * No real payment gateway integration. productionApproved=false.
 */

import type { FinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import { createDraftFinancialPolicy } from "@/domain/canonical/FinancialPolicy";
import type { FinancialAvailabilityStatus } from "@/domain/canonical/FieldProvenance";

export type ChargebackStatus =
  | "not_represented"
  | "unknown"
  | "open"
  | "won"
  | "lost"
  | "reversed";

export type ChargebackLifecycle = {
  status: ChargebackStatus;
  amount: number | null;
  availabilityStatus: FinancialAvailabilityStatus;
  gatewayReference: string | null;
  notes: string;
};

export type ChargebackPolicy = FinancialPolicy & {
  kind: "chargeback";
  /** No real gateway — placeholder only. */
  gatewayAdapterId: null;
};

export const FUTURE_CHARGEBACK_POLICY_DRAFT: ChargebackPolicy = {
  ...createDraftFinancialPolicy({
    policyId: "FUTURE_CHARGEBACK_POLICY",
    version: "0.1.0-draft",
    notes:
      "Chargeback lifecycle NOT FOUND in Legacy. Domain shell only; no gateway. Never report chargebacks=0.",
  }),
  kind: "chargeback",
  gatewayAdapterId: null,
  productionApproved: false,
  status: "draft",
};

/** Canonical historical rule when Legacy has no chargeback lifecycle. */
export function historicalChargebackNotRepresented(): ChargebackLifecycle {
  return {
    status: "not_represented",
    amount: null,
    availabilityStatus: "not_represented",
    gatewayReference: null,
    notes:
      "FC-07 CLOSED for READ: chargeback lifecycle NOT FOUND — amount must remain null (never 0).",
  };
}
