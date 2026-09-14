import type { PaginatedResult } from "@/types/common";

export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 10,
): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, Math.min(100, pageSize));
  const start = (safePage - 1) * safeSize;
  const slice = items.slice(start, start + safeSize);
  const total = items.length;
  return {
    items: slice,
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}
