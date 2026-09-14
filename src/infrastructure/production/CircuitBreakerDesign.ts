/**
 * Phase 4 DESIGN — circuit breaker for Production reads.
 * On open → disable read path or return unavailable (never synthetic fallback).
 */

import { DEGRADED_PRODUCTION_MESSAGE } from "@/domain/production-read/constants";

export type CircuitState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  failureThreshold: number;
  resetTimeoutMs: number;
  /** Auth denials must NOT count as failures that trip the breaker. */
  ignoreAuthDenials: true;
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  ignoreAuthDenials: true,
};

export type CircuitDecision =
  | { allow: true; state: CircuitState }
  | {
      allow: false;
      state: "open";
      message: typeof DEGRADED_PRODUCTION_MESSAGE;
      code: "CIRCUIT_OPEN";
    };

export interface ProductionReadCircuitBreaker {
  beforeRequest(resource: string): CircuitDecision;
  recordSuccess(resource: string): void;
  recordFailure(
    resource: string,
    kind: "timeout" | "upstream" | "auth_deny" | "other",
  ): void;
  getState(resource: string): CircuitState;
}

type ResourceBreaker = {
  failures: number;
  state: CircuitState;
  openedAt: number | null;
};

export class InMemoryProductionReadCircuitBreaker
  implements ProductionReadCircuitBreaker
{
  private readonly byResource = new Map<string, ResourceBreaker>();

  constructor(
    private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private get(resource: string): ResourceBreaker {
    let b = this.byResource.get(resource);
    if (!b) {
      b = { failures: 0, state: "closed", openedAt: null };
      this.byResource.set(resource, b);
    }
    if (
      b.state === "open" &&
      b.openedAt != null &&
      this.now() - b.openedAt >= this.config.resetTimeoutMs
    ) {
      b.state = "half_open";
    }
    return b;
  }

  beforeRequest(resource: string): CircuitDecision {
    const b = this.get(resource);
    if (b.state === "open") {
      return {
        allow: false,
        state: "open",
        message: DEGRADED_PRODUCTION_MESSAGE,
        code: "CIRCUIT_OPEN",
      };
    }
    return { allow: true, state: b.state };
  }

  recordSuccess(resource: string): void {
    const b = this.get(resource);
    b.failures = 0;
    b.state = "closed";
    b.openedAt = null;
  }

  recordFailure(
    resource: string,
    kind: "timeout" | "upstream" | "auth_deny" | "other",
  ): void {
    if (kind === "auth_deny" && this.config.ignoreAuthDenials) {
      return;
    }
    const b = this.get(resource);
    b.failures += 1;
    if (b.failures >= this.config.failureThreshold || b.state === "half_open") {
      b.state = "open";
      b.openedAt = this.now();
    }
  }

  getState(resource: string): CircuitState {
    return this.get(resource).state;
  }
}

/** Design defaults for timeouts / retries — no retry on auth deny. */
export const PRODUCTION_READ_RETRY_POLICY = {
  timeoutMs: 8_000,
  maxRetries: 1,
  retryOn: ["timeout", "upstream"] as const,
  neverRetryOn: ["auth_deny", "scope_denied", "kill_switch"] as const,
} as const;
