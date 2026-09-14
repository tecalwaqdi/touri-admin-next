/**
 * Financial policy provider interface only — NO formulas in Phase 0/1.
 * Actual VAT/settlement calculation is deferred until policy is approved.
 */
export type FinancialPolicyVersion = {
  version: string;
  countryId: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "active" | "archived";
  platformCommissionRate?: number;
  agentCommissionRate?: number;
  vatRate?: number;
  notes: string;
};

export interface FinancialPolicyProvider {
  getActivePolicy(countryId: string, atUtc: string): Promise<FinancialPolicyVersion | null>;
  listPolicies(countryId?: string): Promise<FinancialPolicyVersion[]>;
}

export type FinanceSummaryPlaceholder = {
  cashCollected: number | null;
  onlineCollected: number | null;
  platformCommission: number | null;
  agentCommission: number | null;
  vatAmount: number | null;
  confidence: "high" | "derived" | "incomplete" | "disputed";
  unavailableReasons: string[];
};
