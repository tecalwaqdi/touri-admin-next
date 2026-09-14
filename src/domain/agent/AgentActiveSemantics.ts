/**
 * Phase 4A-6 — Agent active semantics (mirror Legacy agent_active.js).
 *
 * Active when:
 * - Isagent / isagent === true
 * - actev_user !== false
 * - optional agent_date_reg / agent_date_end window contains `at` when present
 *
 * Account flag (actev_user) is orthogonal to Auth enabled — we do NOT call
 * Auth Admin; Auth enabled ≠ Agent active.
 */

export type AgentAccountState = "enabled" | "disabled" | "unknown";

export type AgentOperationalActiveState =
  | "active"
  | "inactive"
  | "window_future"
  | "window_expired"
  | "unknown";

function parseMaybeDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value);
  }
  return null;
}

function hasUnparseableDateField(value: unknown): boolean {
  if (value == null || value === "") return false;
  return parseMaybeDate(value) == null;
}

export function mapAgentAccountState(
  data: Record<string, unknown>,
): AgentAccountState {
  if (data.actev_user === true) return "enabled";
  if (data.actev_user === false) return "disabled";
  if (Object.prototype.hasOwnProperty.call(data, "actev_user")) {
    return "unknown";
  }
  return "unknown";
}

/**
 * Canonical active check at instant `at` (default now) — identical to
 * Legacy `isAgentActiveAt` in agent_active.js.
 */
export function isAgentActiveAt(
  data: Record<string, unknown>,
  at: Date = new Date(),
): boolean {
  if (!data || (data.Isagent !== true && data.isagent !== true)) return false;
  if (data.actev_user === false) return false;
  if (hasUnparseableDateField(data.agent_date_reg)) return false;
  if (hasUnparseableDateField(data.agent_date_end)) return false;
  const now = at.getTime();
  if (Number.isNaN(now)) return false;

  const end = parseMaybeDate(data.agent_date_end);
  if (end && end.getTime() < now) return false;
  const start = parseMaybeDate(data.agent_date_reg);
  if (start && start.getTime() > now) return false;
  return true;
}

/**
 * Rich operational state for diagnostics — never invents Auth-enabled status.
 */
export function mapAgentOperationalActiveState(
  data: Record<string, unknown>,
  at: Date = new Date(),
): {
  operationalActive: AgentOperationalActiveState;
  isActive: boolean;
  accountState: AgentAccountState;
  /** Explicit: Auth enabled is NOT derived here. */
  authEnabledKnowledge: "not_queried";
} {
  const accountState = mapAgentAccountState(data);
  const isAgentFlag = data.Isagent === true || data.isagent === true;

  if (!isAgentFlag) {
    return {
      operationalActive: "inactive",
      isActive: false,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }
  if (accountState === "disabled") {
    return {
      operationalActive: "inactive",
      isActive: false,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }
  if (
    hasUnparseableDateField(data.agent_date_reg) ||
    hasUnparseableDateField(data.agent_date_end)
  ) {
    return {
      operationalActive: "unknown",
      isActive: false,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }

  const now = at.getTime();
  const end = parseMaybeDate(data.agent_date_end);
  if (end && end.getTime() < now) {
    return {
      operationalActive: "window_expired",
      isActive: false,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }
  const start = parseMaybeDate(data.agent_date_reg);
  if (start && start.getTime() > now) {
    return {
      operationalActive: "window_future",
      isActive: false,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }

  if (isAgentActiveAt(data, at)) {
    return {
      operationalActive: "active",
      isActive: true,
      accountState,
      authEnabledKnowledge: "not_queried",
    };
  }

  return {
    operationalActive: "unknown",
    isActive: false,
    accountState,
    authEnabledKnowledge: "not_queried",
  };
}

export function agentEffectiveWindow(data: Record<string, unknown>): {
  startMs: number;
  endMs: number;
  startIso: string | null;
  endIso: string | null;
} {
  const start = parseMaybeDate(data.agent_date_reg);
  const end = parseMaybeDate(data.agent_date_end);
  return {
    startMs: start ? start.getTime() : Number.NEGATIVE_INFINITY,
    endMs: end ? end.getTime() : Number.POSITIVE_INFINITY,
    startIso: start ? start.toISOString() : null,
    endIso: end ? end.toISOString() : null,
  };
}
