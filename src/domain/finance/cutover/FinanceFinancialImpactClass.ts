/**
 * Financial-impact classification for cutover resolution.
 * Presentation/reporting only — never mutates money.
 */

export const FINANCE_FINANCIAL_IMPACT_CLASSES = [
  "CARRY_FORWARD_RECEIVABLE",
  "CARRY_FORWARD_PAYABLE",
  "FULLY_SETTLED",
  "NO_FINANCIAL_IMPACT",
  "HISTORICAL_INCOMPLETE",
  "HISTORICAL_CONFLICT",
  "LEGACY_ORPHAN",
  "SYNTHETIC_QA_TEST",
  "HISTORICAL_REFERENCE_ONLY",
  "MALFORMED_BLOCKER",
] as const;

export type FinanceFinancialImpactClass =
  (typeof FINANCE_FINANCIAL_IMPACT_CLASSES)[number];

export type FinanceImpactRecordKind =
  | "order"
  | "snapshot"
  | "settlement"
  | "payment"
  | "adjustment"
  | "wallet"
  | "wallet_transaction"
  | "finance_audit"
  | "reconciliation"
  | "malformed";

export type FinanceImpactInventoryRow = {
  kind: FinanceImpactRecordKind;
  id: string;
  collection: string;
  class: FinanceFinancialImpactClass;
  reasons: string[];
  countryId: string | null;
  currency: string | null;
  partyType: "driver" | "agent" | "company" | null;
  partyId: string | null;
  amountMinor: string | null;
  carryForwardReceivableMinor: string | null;
  carryForwardPayableMinor: string | null;
  sourceReferences: string[];
  provenanceProvenSynthetic: boolean;
};
