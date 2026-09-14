/**
 * Phase 4B — pagination consistency checks (cursor, no offset, no page dupes).
 */

import { rejectOffsetPagination } from "@/infrastructure/production/contracts/QuerySafety";
import { PHASE_4B_PAGE_LIMITS } from "@/application/shadow-validation/Phase4BShadowSummary";

export type PaginationPage = {
  ids: string[];
  nextCursor: string | null;
  limit: number;
};

export type PaginationValidationResult = {
  paginationValidationPass: boolean;
  paginationDuplicates: number;
  reasons: string[];
};

/**
 * Validate consecutive pages have no overlapping document ids,
 * respect established page limits, and forbid offset pagination.
 */
export function validatePaginationConsistency(input: {
  resource: keyof typeof PHASE_4B_PAGE_LIMITS;
  pages: PaginationPage[];
  /** When true, also assert rejectOffsetPagination throws for offset>0. */
  assertOffsetForbidden?: boolean;
}): PaginationValidationResult {
  const reasons: string[] = [];
  let paginationDuplicates = 0;
  const max = PHASE_4B_PAGE_LIMITS[input.resource];

  if (input.assertOffsetForbidden !== false) {
    try {
      rejectOffsetPagination({ offset: 1 });
      reasons.push("offset_pagination_not_rejected");
    } catch {
      // expected
    }
    try {
      rejectOffsetPagination({ pageNumber: 2 });
      reasons.push("pageNumber_pagination_not_rejected");
    } catch {
      // expected
    }
  }

  const seen = new Set<string>();
  for (const page of input.pages) {
    if (page.limit > max) {
      reasons.push(`${input.resource}:limit_exceeds_${max}`);
    }
    if (page.ids.length > page.limit) {
      reasons.push(`${input.resource}:ids_exceed_page_limit`);
    }
    for (const id of page.ids) {
      if (seen.has(id)) {
        paginationDuplicates += 1;
        reasons.push(`${input.resource}:duplicate_id:${id}`);
      }
      seen.add(id);
    }
  }

  // Within a single page — duplicate ids also count.
  for (const page of input.pages) {
    const local = new Set<string>();
    for (const id of page.ids) {
      if (local.has(id)) {
        paginationDuplicates += 1;
        reasons.push(`${input.resource}:intra_page_duplicate:${id}`);
      }
      local.add(id);
    }
  }

  return {
    paginationValidationPass: paginationDuplicates === 0 && reasons.length === 0,
    paginationDuplicates,
    reasons: [...new Set(reasons)],
  };
}

/** Agent / Customer established order field. */
export const PHASE_4B_SAFE_ORDER_FIELDS = {
  agents: "__name__",
  customers: "__name__",
  countries: "naim",
  cities: "naim",
  landmarks: "naim",
  trips: "data_order",
  drivers: "documented_4a5",
} as const;
