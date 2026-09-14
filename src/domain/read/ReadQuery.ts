/**
 * Phase 3.7 — ReadQuery interface + pagination safety.
 * No generic /api/read?collection= — resource-specific only.
 */

export type ReadSafetyLevel =
  | "SAFE"
  | "SAFE_WITH_WARNING"
  | "REDACTED"
  | "UNMAPPED"
  | "BLOCKED";

export type CursorPageRequest = {
  limit: number;
  cursor?: string | null;
  sort?: { field: string; direction: "asc" | "desc" };
  filters?: Record<string, unknown>;
};

export type CursorPageResult<T> = {
  items: T[];
  nextCursor: string | null;
  truncated: boolean;
};

/**
 * Resource-specific read query contract.
 * Implementations MUST apply server-side scope filter BEFORE query results leave the boundary.
 */
export interface ReadQuery<TFilter, TResult> {
  readonly resource: string;
  execute(input: {
    filter: TFilter;
    page: CursorPageRequest;
    maxPageSize: number;
  }): Promise<CursorPageResult<TResult>>;
}

export class PaginationPolicyError extends Error {
  readonly code = "PAGINATION_POLICY_VIOLATION";
  constructor(message: string) {
    super(message);
    this.name = "PaginationPolicyError";
  }
}

export function normalizePageRequest(
  page: Partial<CursorPageRequest> | null | undefined,
  maxPageSize: number,
): CursorPageRequest {
  if (page == null) {
    throw new PaginationPolicyError(
      "Unbounded reads forbidden — page.limit required",
    );
  }
  if (page.limit == null || !Number.isFinite(page.limit)) {
    throw new PaginationPolicyError(
      "Unbounded reads forbidden — page.limit required",
    );
  }
  if (page.limit <= 0) {
    throw new PaginationPolicyError("page.limit must be positive");
  }
  if (page.limit > maxPageSize) {
    throw new PaginationPolicyError(
      `page.limit ${page.limit} exceeds MAX_PAGE_SIZE ${maxPageSize}`,
    );
  }
  return {
    limit: page.limit,
    cursor: page.cursor ?? null,
    sort: page.sort,
    filters: page.filters,
  };
}

/** Design defaults — no production gateway in 3.7 */
export const RATE_LIMIT_POLICY_DESIGN = {
  listPerMinute: 60,
  detailPerMinute: 120,
  searchPerMinute: 30,
  exportPerHour: 5,
  notes: "Design only — enforce at API gateway in a later phase",
} as const;
