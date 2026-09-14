import type { FinancialPolicyProvider, FinancialPolicyVersion } from "@/types/finance";

/** Interface-only placeholder — no calculation formulas. */
export class MockFinancialPolicyProvider implements FinancialPolicyProvider {
  async getActivePolicy(): Promise<FinancialPolicyVersion | null> {
    return null;
  }

  async listPolicies(): Promise<FinancialPolicyVersion[]> {
    return [];
  }
}
