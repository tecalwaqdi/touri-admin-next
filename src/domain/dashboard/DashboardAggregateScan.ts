/**
 * Safe capped multi-page scan for dashboard aggregates.
 * Never claims exact totals when the page budget is exhausted.
 */

import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import type { DashboardKpiMeta } from "@/domain/dashboard/KpiAccuracy";
import {
  exactKpiMeta,
  incompleteKpiMeta,
  unavailableKpiMeta,
} from "@/domain/dashboard/KpiAccuracy";

/** Max pages per collection per dashboard request (≤50 docs/page). */
export const DASHBOARD_AGGREGATE_MAX_PAGES = 20 as const;

export type DashboardAggregateScanResult = {
  /** Exact count when scan completed; null when truncated or unavailable. */
  value: number | null;
  truncated: boolean;
  pagesScanned: number;
  excludedQaCount: number;
  meta: DashboardKpiMeta;
};

export function aggregateScanMeta(input: {
  truncated: boolean;
  unavailable?: boolean;
}): DashboardKpiMeta {
  if (input.unavailable) return unavailableKpiMeta();
  if (input.truncated) {
    return incompleteKpiMeta({
      sampleLimit: WIF_NATIVE_MAX_READ_LIMIT * DASHBOARD_AGGREGATE_MAX_PAGES,
    });
  }
  return exactKpiMeta();
}

export function finalizeAggregateCount(input: {
  count: number;
  truncated: boolean;
  pagesScanned: number;
  excludedQaCount: number;
  unavailable?: boolean;
}): DashboardAggregateScanResult {
  if (input.unavailable) {
    return {
      value: null,
      truncated: false,
      pagesScanned: input.pagesScanned,
      excludedQaCount: input.excludedQaCount,
      meta: unavailableKpiMeta(),
    };
  }
  if (input.truncated) {
    return {
      value: null,
      truncated: true,
      pagesScanned: input.pagesScanned,
      excludedQaCount: input.excludedQaCount,
      meta: aggregateScanMeta({ truncated: true }),
    };
  }
  return {
    value: input.count,
    truncated: false,
    pagesScanned: input.pagesScanned,
    excludedQaCount: input.excludedQaCount,
    meta: exactKpiMeta(),
  };
}

export { WIF_NATIVE_MAX_READ_LIMIT as DASHBOARD_PAGE_SIZE };
