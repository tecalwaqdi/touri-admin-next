/**
 * Phase 4A-7 — classify Customers live query failures (index / permission).
 * Document-id order avoids created_time composite index mistakes (4A-6 lesson).
 */

export const CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER =
  "CUSTOMER_QUERY_REQUIRES_COMPOSITE_INDEX" as const;

export type CustomerLiveQueryFailureKind =
  | "index_dependency"
  | "permission_denied"
  | "timeout"
  | "unknown";

export function classifyCustomerLiveQueryFailure(err: unknown): {
  kind: CustomerLiveQueryFailureKind;
  blocker: string;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (
    lower.includes("requires an index") ||
    lower.includes("failed_precondition") ||
    lower.includes("composite index")
  ) {
    return {
      kind: "index_dependency",
      blocker: CUSTOMER_QUERY_INDEX_DEPENDENCY_BLOCKER,
      message,
    };
  }
  if (
    lower.includes("permission") ||
    lower.includes("insufficient") ||
    lower.includes("unauthenticated")
  ) {
    return {
      kind: "permission_denied",
      blocker: "CUSTOMER_QUERY_PERMISSION_DENIED",
      message,
    };
  }
  if (lower.includes("timeout") || lower.includes("deadline")) {
    return {
      kind: "timeout",
      blocker: "CUSTOMER_QUERY_TIMEOUT",
      message,
    };
  }
  return {
    kind: "unknown",
    blocker: "CUSTOMER_QUERY_FAILED",
    message,
  };
}
