/**
 * Finance write gate — Production always denied in this preparation.
 * Offline Fake env may allow in-memory mutations only when explicitly marked.
 */

export type FinanceWriteEnvironment = "production" | "offline_fake" | "test";

export type FinanceWriteGateDecision = {
  allowed: boolean;
  reason: string;
  productionWrites: 0;
  FINANCE_WRITE_ENABLED: false;
};

export class FinanceWriteGate {
  constructor(
    private readonly env: FinanceWriteEnvironment,
    private readonly financeWriteEnabledFlag: boolean = false,
  ) {}

  /** Hard lock: Production never allows Finance writes. */
  assertWritable(operation: string): FinanceWriteGateDecision {
    if (this.financeWriteEnabledFlag) {
      throw new Error(
        "FINANCE_WRITE_ENABLED must remain false — refuse enabling",
      );
    }
    if (this.env === "production") {
      return {
        allowed: false,
        reason: `production_finance_write_denied:${operation}`,
        productionWrites: 0,
        FINANCE_WRITE_ENABLED: false,
      };
    }
    // Offline Fake / test: in-memory only, still flag=false.
    return {
      allowed: true,
      reason: `offline_fake_allowed:${operation}`,
      productionWrites: 0,
      FINANCE_WRITE_ENABLED: false,
    };
  }

  requireWritable(operation: string): void {
    const d = this.assertWritable(operation);
    if (!d.allowed) {
      throw new Error(d.reason);
    }
  }

  isProductionDenied(): boolean {
    return this.env === "production" || this.financeWriteEnabledFlag === true
      ? this.env === "production"
      : false;
  }

  get FINANCE_WRITE_ENABLED(): false {
    return false;
  }
}

export function createProductionFinanceWriteGate(): FinanceWriteGate {
  return new FinanceWriteGate("production", false);
}

export function createOfflineFakeFinanceWriteGate(): FinanceWriteGate {
  return new FinanceWriteGate("offline_fake", false);
}
