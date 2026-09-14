/**
 * Reconciliation variance taxonomy (D-10).
 * Read/compare only — never auto-fix Production.
 */

import type { ReconciliationDimension } from "@/domain/finance/v2/FinanceImplementationContracts";

export type VarianceSeverity = "info" | "warning" | "blocker";

export type Variance = {
  dimension: ReconciliationDimension;
  leftRef: string;
  rightRef: string;
  leftMinor: bigint | null;
  rightMinor: bigint | null;
  deltaMinor: bigint | null;
  severity: VarianceSeverity;
  reasonCode: string;
};

export function buildVariance(input: {
  dimension: ReconciliationDimension;
  leftRef: string;
  rightRef: string;
  leftMinor: bigint | null;
  rightMinor: bigint | null;
  severity: VarianceSeverity;
  reasonCode: string;
}): Variance {
  let deltaMinor: bigint | null = null;
  if (input.leftMinor != null && input.rightMinor != null) {
    deltaMinor = input.leftMinor - input.rightMinor;
  }
  return {
    dimension: input.dimension,
    leftRef: input.leftRef,
    rightRef: input.rightRef,
    leftMinor: input.leftMinor,
    rightMinor: input.rightMinor,
    deltaMinor,
    severity: input.severity,
    reasonCode: input.reasonCode,
  };
}

export function hasBlockerVariance(variances: Variance[]): boolean {
  return variances.some((v) => v.severity === "blocker");
}
