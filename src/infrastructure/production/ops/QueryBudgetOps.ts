/**
 * Phase 4A-0 — query budget + retry policy for Production reads.
 */

import {
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_TRIP_LIST_WINDOW_DAYS,
  MAX_TRIP_LIST_WINDOW_DAYS,
} from "@/domain/production-read/constants";
import {
  DEFAULT_QUERY_BUDGET,
  type QueryBudget,
} from "@/infrastructure/production/contracts/QuerySafety";
import { PRODUCTION_READ_RETRY_POLICY } from "@/infrastructure/production/CircuitBreakerDesign";

export type ProductionReadOpsConfig = {
  budget: QueryBudget;
  timeoutMs: number;
  maxRetries: number;
};

export const DEFAULT_PRODUCTION_READ_OPS: ProductionReadOpsConfig = {
  budget: { ...DEFAULT_QUERY_BUDGET },
  timeoutMs: PRODUCTION_READ_RETRY_POLICY.timeoutMs,
  maxRetries: PRODUCTION_READ_RETRY_POLICY.maxRetries,
};

export function shouldRetryProductionRead(kind: string): boolean {
  if (
    (PRODUCTION_READ_RETRY_POLICY.neverRetryOn as readonly string[]).includes(
      kind,
    )
  ) {
    return false;
  }
  return (PRODUCTION_READ_RETRY_POLICY.retryOn as readonly string[]).includes(
    kind,
  );
}

export async function withProductionReadTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_PRODUCTION_READ_OPS.timeoutMs,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("PRODUCTION_READ_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function assertQueryBudgetPageSize(
  limit: number,
  budget: QueryBudget = DEFAULT_QUERY_BUDGET,
): void {
  if (limit > budget.maxPageSize || limit > DEFAULT_MAX_PAGE_SIZE) {
    throw new Error(
      `INVALID_QUERY_LIMIT: page size ${limit} exceeds budget ${budget.maxPageSize}`,
    );
  }
}

export {
  DEFAULT_TRIP_LIST_WINDOW_DAYS,
  MAX_TRIP_LIST_WINDOW_DAYS,
};
