/**
 * Reconciliation run artifact — offline first (Fake).
 */

import type { Variance } from "@/domain/reconciliation/Variance";

export type ReconciliationRunStatus = "created" | "completed" | "failed";

export type ReconciliationRun = {
  id: string;
  status: ReconciliationRunStatus;
  countryId: string;
  currency: string;
  periodFromUtc: string;
  periodToUtc: string;
  variances: Variance[];
  createdByUserId: string;
  idempotencyKey: string;
  correlationId: string;
  createdAtUtc: string;
  completedAtUtc: string | null;
  error?: string;
  /** Shadow compare only — no Production mutation. */
  shadowOnly: true;
  productionWrites: 0;
};

export function emptyReconciliationRun(partial: {
  id: string;
  countryId: string;
  currency: string;
  periodFromUtc: string;
  periodToUtc: string;
  createdByUserId: string;
  idempotencyKey: string;
  correlationId: string;
}): ReconciliationRun {
  return {
    ...partial,
    status: "created",
    variances: [],
    createdAtUtc: new Date().toISOString(),
    completedAtUtc: null,
    shadowOnly: true,
    productionWrites: 0,
  };
}
