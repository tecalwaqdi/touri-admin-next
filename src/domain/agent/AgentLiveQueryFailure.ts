/**
 * Phase 4A-6 — distinguish infrastructure/query failure from mapping failure.
 * Live summary must never imply mapping success when the query never returned docs.
 */

export const AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER =
  "query_index_dependency" as const;

export type AgentLiveQueryFailureClassification = {
  blocker: typeof AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER | "query_failure";
  productionReadCompleted: false;
  mappingExecuted: false;
  /** Safe reason fragment — no PII, no create-index URL. */
  safeReason: string;
};

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return "";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Detect Firestore FAILED_PRECONDITION / missing-index style query failures.
 * Strips console create-index URLs from the safe reason.
 */
export function classifyAgentLiveQueryFailure(
  err: unknown,
): AgentLiveQueryFailureClassification {
  const code = errorCode(err).toLowerCase();
  const msg = errorMessage(err);
  const lower = msg.toLowerCase();

  const looksLikeIndex =
    code === "failed-precondition" ||
    lower.includes("failed_precondition") ||
    lower.includes("failed-precondition") ||
    lower.includes("requires an index") ||
    lower.includes("query requires an index") ||
    lower.includes("the query requires an index") ||
    (lower.includes("index") &&
      (lower.includes("composite") || lower.includes("create")));

  const safeReason = looksLikeIndex
    ? "Firestore query requires index (FAILED_PRECONDITION) — query redesign required; do not create index from this harness"
    : "Agent Production query failed before documents were returned";

  return {
    blocker: looksLikeIndex
      ? AGENT_QUERY_INDEX_DEPENDENCY_BLOCKER
      : "query_failure",
    productionReadCompleted: false,
    mappingExecuted: false,
    safeReason,
  };
}
