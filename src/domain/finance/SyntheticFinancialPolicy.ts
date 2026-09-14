/**
 * SYNTHETIC ONLY — not production-approved Touri Taxi financial rules.
 * Real VAT / commission / gateway / refund / FX decisions are deferred.
 */
export const SYNTHETIC_POLICY_ID = "SYNTHETIC_TEST_POLICY";
export const SYNTHETIC_POLICY_VERSION = "1.0.0-synthetic";

export type SyntheticFinancialPolicy = {
  policyId: typeof SYNTHETIC_POLICY_ID;
  version: typeof SYNTHETIC_POLICY_VERSION;
  environment: "development";
  productionApproved: false;
  /** Basis points — synthetic only (e.g. 1500 = 15%). */
  platformCommissionBps: number;
  agentCommissionBps: number;
  vatBps: number;
  gatewayFeeBps: number;
  notes: string;
  deferredDecisions: string[];
};

export const SYNTHETIC_TEST_POLICY: SyntheticFinancialPolicy = {
  policyId: SYNTHETIC_POLICY_ID,
  version: SYNTHETIC_POLICY_VERSION,
  environment: "development",
  productionApproved: false,
  platformCommissionBps: 1500,
  agentCommissionBps: 500,
  vatBps: 1500,
  gatewayFeeBps: 200,
  notes:
    "Synthetic development policy for Admin Next Phase 2. Not production-approved.",
  deferredDecisions: [
    "Real country VAT rates and inclusive/exclusive tax treatment",
    "Real platform vs agent commission schedules by country/city",
    "Payment gateway fee schedules and settlement timing",
    "Refund / chargeback allocation between platform, agent, driver",
    "FX conversion rules for multi-currency reporting",
    "Cash vs online settlement netting rules",
  ],
};

export class SyntheticFinancialPolicyProvider {
  getPolicy(): SyntheticFinancialPolicy {
    return { ...SYNTHETIC_TEST_POLICY, deferredDecisions: [...SYNTHETIC_TEST_POLICY.deferredDecisions] };
  }

  assertNonProduction(): void {
    if (SYNTHETIC_TEST_POLICY.productionApproved) {
      throw new Error("Synthetic policy must never be productionApproved");
    }
  }
}

export const syntheticFinancialPolicyProvider = new SyntheticFinancialPolicyProvider();
