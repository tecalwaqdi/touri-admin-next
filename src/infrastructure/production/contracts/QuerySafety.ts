/**
 * Phase 4 DESIGN — query safety + search strategy (no Production scans).
 */

import {
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_TRIP_LIST_WINDOW_DAYS,
  MAX_TRIP_LIST_WINDOW_DAYS,
} from "@/domain/production-read/constants";
import {
  normalizePageRequest,
  PaginationPolicyError,
  type CursorPageRequest,
} from "@/domain/read/ReadQuery";

export type SearchStrategy =
  | "indexed_exact"
  | "normalized_exact"
  | "separate_index"
  | "unsupported_initially";

export const RESOURCE_SEARCH_STRATEGY: Record<string, SearchStrategy> = {
  countries: "indexed_exact",
  cities: "normalized_exact",
  trips: "indexed_exact",
  drivers: "normalized_exact",
  agents: "indexed_exact",
  customers: "unsupported_initially", // no full-collection name scan
};

export type QueryBudget = {
  maxPageSize: number;
  maxConcurrentReads: number;
  maxDocumentsPerRequest: number;
  tripDefaultWindowDays: number;
  tripMaxWindowDays: number;
};

export const DEFAULT_QUERY_BUDGET: QueryBudget = {
  maxPageSize: DEFAULT_MAX_PAGE_SIZE,
  maxConcurrentReads: 4,
  maxDocumentsPerRequest: DEFAULT_MAX_PAGE_SIZE,
  tripDefaultWindowDays: DEFAULT_TRIP_LIST_WINDOW_DAYS,
  tripMaxWindowDays: MAX_TRIP_LIST_WINDOW_DAYS,
};

export class QuerySafetyError extends Error {
  readonly code = "QUERY_SAFETY_VIOLATION";
  constructor(message: string) {
    super(message);
    this.name = "QuerySafetyError";
  }
}

export function assertSearchSupported(resource: string): void {
  const strategy = RESOURCE_SEARCH_STRATEGY[resource];
  if (!strategy || strategy === "unsupported_initially") {
    throw new QuerySafetyError(
      `Search unsupported initially for resource=${resource} (no full collection scan)`,
    );
  }
}

export function assertCursorPagination(
  page: Partial<CursorPageRequest> | null | undefined,
  maxPageSize: number = DEFAULT_MAX_PAGE_SIZE,
): CursorPageRequest {
  try {
    return normalizePageRequest(page, maxPageSize);
  } catch (err) {
    if (err instanceof PaginationPolicyError) {
      throw new QuerySafetyError(err.message);
    }
    throw err;
  }
}

/**
 * Offset-heavy pagination is forbidden for Production shadow lists.
 */
export function rejectOffsetPagination(input: {
  offset?: number | null;
  pageNumber?: number | null;
}): void {
  if (input.offset != null && input.offset > 0) {
    throw new QuerySafetyError(
      "Offset pagination forbidden — use cursor pagination",
    );
  }
  if (input.pageNumber != null && input.pageNumber > 1) {
    throw new QuerySafetyError(
      "pageNumber pagination forbidden — use cursor pagination",
    );
  }
}

export function resolveTripDateWindow(input: {
  createdFromUtc?: string | null;
  createdToUtc?: string | null;
  now?: Date;
  budget?: QueryBudget;
}): { createdFromUtc: string; createdToUtc: string } {
  const budget = input.budget ?? DEFAULT_QUERY_BUDGET;
  const now = input.now ?? new Date();
  const to = input.createdToUtc ? new Date(input.createdToUtc) : now;
  const defaultFrom = new Date(
    to.getTime() - budget.tripDefaultWindowDays * 24 * 60 * 60 * 1000,
  );
  const from = input.createdFromUtc
    ? new Date(input.createdFromUtc)
    : defaultFrom;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new QuerySafetyError("Invalid trip date window");
  }
  if (from.getTime() > to.getTime()) {
    throw new QuerySafetyError("createdFromUtc must be <= createdToUtc");
  }
  const windowMs = to.getTime() - from.getTime();
  const maxMs = budget.tripMaxWindowDays * 24 * 60 * 60 * 1000;
  if (windowMs > maxMs) {
    throw new QuerySafetyError(
      `Trip date window exceeds max ${budget.tripMaxWindowDays} days`,
    );
  }
  return {
    createdFromUtc: from.toISOString(),
    createdToUtc: to.toISOString(),
  };
}
