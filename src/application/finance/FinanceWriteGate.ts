/**
 * Finance write gate — Production denied unless FINANCE_WRITE_ENABLED ∧ GLOBAL ∧ PRODUCTION.
 * Offline Fake / test may allow in-memory mutations only.
 * Posted ledger immutability remains enforced by Settlement V2 domain.
 */

export type FinanceWriteEnvironment = "production" | "offline_fake" | "test";

export type FinanceWriteGateDecision = {
  allowed: boolean;
  reason: string;
  productionWrites: 0 | 1;
  FINANCE_WRITE_ENABLED: boolean;
};

export class FinanceWriteGate {
  constructor(
    private readonly env: FinanceWriteEnvironment,
    private readonly financeWriteEnabledFlag: boolean = false,
    private readonly globalEnabled: boolean = false,
    private readonly productionWriteEnabled: boolean = false,
  ) {}

  assertWritable(operation: string): FinanceWriteGateDecision {
    if (this.env === "production") {
      const armed =
        this.financeWriteEnabledFlag &&
        this.globalEnabled &&
        this.productionWriteEnabled;
      if (!armed) {
        return {
          allowed: false,
          reason: `production_finance_write_denied:${operation}`,
          productionWrites: 0,
          FINANCE_WRITE_ENABLED: this.financeWriteEnabledFlag,
        };
      }
      return {
        allowed: true,
        reason: `production_finance_write_armed:${operation}`,
        productionWrites: 1,
        FINANCE_WRITE_ENABLED: true,
      };
    }
    // Offline Fake / test: in-memory only.
    return {
      allowed: true,
      reason: `offline_fake_allowed:${operation}`,
      productionWrites: 0,
      FINANCE_WRITE_ENABLED: this.financeWriteEnabledFlag,
    };
  }

  requireWritable(operation: string): void {
    const d = this.assertWritable(operation);
    if (!d.allowed) {
      throw new Error(d.reason);
    }
  }

  isProductionDenied(): boolean {
    if (this.env !== "production") return false;
    return !(
      this.financeWriteEnabledFlag &&
      this.globalEnabled &&
      this.productionWriteEnabled
    );
  }

  get FINANCE_WRITE_ENABLED(): boolean {
    return this.financeWriteEnabledFlag;
  }
}

export function createProductionFinanceWriteGate(flags?: {
  FINANCE_WRITE_ENABLED?: boolean;
  GLOBAL_PRODUCTION_WRITE_ENABLED?: boolean;
  PRODUCTION_WRITE_ENABLED?: boolean;
}): FinanceWriteGate {
  return new FinanceWriteGate(
    "production",
    flags?.FINANCE_WRITE_ENABLED === true,
    flags?.GLOBAL_PRODUCTION_WRITE_ENABLED === true,
    flags?.PRODUCTION_WRITE_ENABLED === true,
  );
}

export function createOfflineFakeFinanceWriteGate(): FinanceWriteGate {
  return new FinanceWriteGate("offline_fake", false);
}
