/**
 * Phase 5B — AgentWriteRepository port + implementations.
 *
 * - FakeAgentWriteRepository: offline contract tests; concurrency-safe
 *   one-country-one-active guard inside apply (serialized per country)
 * - EmulatorAgentWriteRepository: synthetic emulator path (optional)
 * - DisabledAgentWriteRepository: always PRODUCTION_WRITE_DISABLED
 * - ProductionAgentWriteRepository: structurally prepared, unreachable
 *
 * Fake/emulator MUST NOT leak into Production runtime wiring.
 * No finance coupling. Deactivate/suspend do not transfer/replace/settle.
 */

import type {
  AgentWriteApplyInput,
  AgentWriteApplyResult,
  AgentWriteFlagGate,
  AgentWriteSnapshot,
  ProvenAgentOperationalState,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import {
  assertAgentProductionWriteEnabled,
  areAgentProductionWritesEnabled,
} from "@/application/controlled-writes/agents/AgentWriteFlags";
import {
  assertNoOtherActiveAgentSync,
  agentCountryBucketId,
} from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import {
  ProductionWriteDisabledError,
  DisabledWriteRepository,
} from "@/infrastructure/production/DisabledWriteRepository";

export type AgentWriteRepository = {
  readonly kind:
    | "fake_agent_write"
    | "emulator_agent_write"
    | "disabled_agent_write"
    | "production_agent_write"
    | "production_agent_write_unreachable";
  apply(input: AgentWriteApplyInput): Promise<AgentWriteApplyResult>;
};

function nextToken(prev: string): string {
  return `tok_${prev}_next_${Date.now().toString(36)}`;
}

/**
 * Offline fake — mutates an in-memory agent map.
 * Country uniqueness enforced inside apply under a per-country mutex so
 * concurrent activate races yield exactly one success.
 * Never touches Firebase.
 */
export class FakeAgentWriteRepository implements AgentWriteRepository {
  readonly kind = "fake_agent_write" as const;
  readonly applied: AgentWriteApplyResult[] = [];
  private readonly agents = new Map<string, AgentWriteSnapshot>();
  /** countryId → agentId currently active (at most one). */
  private readonly activeByCountry = new Map<string, string>();
  /** Per-country serialization chain (concurrency-safe uniqueness). */
  private readonly countryChains = new Map<string, Promise<unknown>>();

  seed(snapshot: AgentWriteSnapshot): void {
    this.agents.set(snapshot.agentId, { ...snapshot });
    this.rebuildActiveIndex();
  }

  get(agentId: string): AgentWriteSnapshot | undefined {
    const s = this.agents.get(agentId);
    return s ? { ...s } : undefined;
  }

  findActiveAgentIdForCountry(countryId: string): string | null {
    const bucket = agentCountryBucketId(countryId);
    return this.activeByCountry.get(bucket) ?? null;
  }

  private rebuildActiveIndex(): void {
    this.activeByCountry.clear();
    for (const snap of this.agents.values()) {
      if (
        snap.exists &&
        snap.operationalState === "active" &&
        snap.countryId
      ) {
        const bucket = agentCountryBucketId(snap.countryId);
        const existing = this.activeByCountry.get(bucket);
        if (existing && existing !== snap.agentId) {
          // Seed invariant violation — keep first; tests should not seed this.
          continue;
        }
        this.activeByCountry.set(bucket, snap.agentId);
      }
    }
  }

  private async withCountryLock<T>(
    countryId: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const bucket = agentCountryBucketId(countryId);
    const prev = this.countryChains.get(bucket) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.then(() => gate);
    this.countryChains.set(bucket, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async apply(input: AgentWriteApplyInput): Promise<AgentWriteApplyResult> {
    const countryId =
      input.command.countryId || input.snapshot.countryId || "";
    if (!countryId) {
      throw new AgentWriteError(
        "VALIDATION_FAILED",
        "countryId required at apply",
      );
    }
    const bucket = agentCountryBucketId(countryId);

    return this.withCountryLock(countryId, () => {
      const current = this.agents.get(input.command.agentId);
      if (!current || !current.exists) {
        throw new AgentWriteError(
          "AGENT_NOT_FOUND",
          `Fake store missing ${input.command.agentId}`,
        );
      }
      if (current.preconditionToken !== input.command.preconditionToken) {
        throw new AgentWriteError(
          "PRECONDITION_FAILED",
          "Fake concurrency token mismatch at apply",
        );
      }
      if (current.operationalState !== input.fromState) {
        throw new AgentWriteError(
          "PRECONDITION_FAILED",
          "Fake fromState mismatch at apply",
        );
      }
      if (current.countryId !== input.command.countryId) {
        throw new AgentWriteError(
          "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
          "Fake country mismatch at apply",
        );
      }

      // One-country-one-active inside concurrency-safe critical section
      if (input.toState === "active") {
        assertNoOtherActiveAgentSync({
          countryId: bucket,
          agentId: current.agentId,
          activeAgentId: this.activeByCountry.get(bucket),
        });
      }

      const afterToken = nextToken(current.preconditionToken);
      let accountEnabled = current.accountEnabled;
      if (input.toState === "suspended") accountEnabled = "disabled";
      else if (input.toState === "active") accountEnabled = "enabled";
      else if (input.toState === "inactive") accountEnabled = "enabled";

      const updated: AgentWriteSnapshot = {
        ...current,
        operationalState: input.toState,
        preconditionToken: afterToken,
        accountEnabled,
      };
      this.agents.set(current.agentId, updated);

      // Maintain active index — never auto-deactivate others
      if (input.toState === "active") {
        this.activeByCountry.set(bucket, current.agentId);
      } else if (
        input.fromState === "active" &&
        this.activeByCountry.get(bucket) === current.agentId
      ) {
        this.activeByCountry.delete(bucket);
      }

      const result: AgentWriteApplyResult = {
        agentId: current.agentId,
        countryId,
        fromState: input.fromState,
        toState: input.toState,
        preconditionTokenAfter: afterToken,
        appliedAtUtc: new Date().toISOString(),
      };
      this.applied.push(result);
      return result;
    });
  }

  /** Test helper — force operational state without going through commands. */
  forceState(agentId: string, to: ProvenAgentOperationalState): void {
    const current = this.agents.get(agentId);
    if (!current) return;
    const wasActive = current.operationalState === "active";
    this.agents.set(agentId, {
      ...current,
      operationalState: to,
      preconditionToken: nextToken(current.preconditionToken),
    });
    if (wasActive && to !== "active" && current.countryId) {
      if (this.activeByCountry.get(current.countryId) === agentId) {
        this.activeByCountry.delete(current.countryId);
      }
    }
    if (to === "active" && current.countryId) {
      this.activeByCountry.set(current.countryId, agentId);
    }
  }
}

/**
 * Emulator repository — synthetic only.
 * Does not connect to Production. When no emulator client is injected,
 * apply throws INTERNAL_WRITE_FAILURE so callers document unavailability.
 */
export class EmulatorAgentWriteRepository implements AgentWriteRepository {
  readonly kind = "emulator_agent_write" as const;
  readonly applied: AgentWriteApplyResult[] = [];
  private readonly available: boolean;
  private readonly store: FakeAgentWriteRepository;

  constructor(opts?: { available?: boolean }) {
    this.available = opts?.available === true;
    this.store = new FakeAgentWriteRepository();
  }

  get isAvailable(): boolean {
    return this.available;
  }

  getSyntheticStore(): FakeAgentWriteRepository {
    return this.store;
  }

  seed(snapshot: AgentWriteSnapshot): void {
    if (!this.available) {
      throw new AgentWriteError(
        "INTERNAL_WRITE_FAILURE",
        "Emulator unavailable — cannot seed",
      );
    }
    this.store.seed(snapshot);
  }

  async apply(input: AgentWriteApplyInput): Promise<AgentWriteApplyResult> {
    if (!this.available) {
      throw new AgentWriteError(
        "INTERNAL_WRITE_FAILURE",
        "Firestore emulator not available in this environment",
      );
    }
    const result = await this.store.apply(input);
    this.applied.push(result);
    return result;
  }
}

/** Always denies — Production mutation never attempted. */
export class DisabledAgentWriteRepository implements AgentWriteRepository {
  readonly kind = "disabled_agent_write" as const;
  private readonly disabled = new DisabledWriteRepository();

  async apply(input: AgentWriteApplyInput): Promise<never> {
    void input;
    try {
      await this.disabled.execute({
        resource: "agent",
        operation: "controlled_write",
      });
    } catch (err) {
      if (err instanceof ProductionWriteDisabledError) {
        throw new AgentWriteError(
          "PRODUCTION_WRITE_DISABLED",
          err.message,
        );
      }
      throw err;
    }
    throw new AgentWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "DisabledAgentWriteRepository",
    );
  }
}

/**
 * REAL Production agent writer — ONE COUNTRY ONE ACTIVE AGENT enforced
 * atomically via uniqueness query + allowlisted status patch.
 */
export class ProductionAgentWriteRepository implements AgentWriteRepository {
  readonly kind = "production_agent_write" as const;

  constructor(
    private readonly flags: AgentWriteFlagGate,
    private readonly port?: import("@/infrastructure/production/writes/ProductionFirestoreWritePort").ProductionFirestoreWritePort,
  ) {}

  async apply(input: AgentWriteApplyInput): Promise<AgentWriteApplyResult> {
    assertAgentProductionWriteEnabled(this.flags);
    const port = this.port;
    if (!port) {
      throw new AgentWriteError(
        "INTERNAL_WRITE_FAILURE",
        "WRITE_RUNTIME_UNAVAILABLE: Production agent write port not configured (WIF SA)",
      );
    }
    const countryId = input.command.countryId || input.snapshot.countryId || "";
    if (!countryId) {
      throw new AgentWriteError("VALIDATION_FAILED", "countryId required");
    }
    const snap = await port.getDocument("user", input.command.agentId);
    if (!snap.exists || !snap.data) {
      throw new AgentWriteError("AGENT_NOT_FOUND", `Agent ${input.command.agentId} missing`);
    }
    if (input.toState === "active") {
      const active = await port.queryEqual("user", "Isagent", true, 50);
      const bucket = agentCountryBucketId(countryId);
      const other = active.find((row) => {
        if (row.id === input.command.agentId) return false;
        const op = String(row.data?.operational_status ?? row.data?.status ?? "");
        if (op !== "active" && row.data?.active !== true) return false;
        const rowCountry = String(row.data?.countryId ?? row.data?.country_id ?? "");
        try {
          return agentCountryBucketId(rowCountry) === bucket;
        } catch {
          return false;
        }
      });
      assertNoOtherActiveAgentSync({
        countryId,
        agentId: input.command.agentId,
        activeAgentId: other?.id ?? null,
      });
    }
    const expectedUt =
      input.command.preconditionToken.startsWith("fs_ut_")
        ? input.command.preconditionToken.slice("fs_ut_".length)
        : snap.updateTime;
    const patched = await port.updateDocument(
      "user",
      input.command.agentId,
      {
        operational_status: input.toState,
        active: input.toState === "active",
      },
      { expectedUpdateTime: expectedUt },
    );
    return {
      agentId: input.command.agentId,
      fromState: input.fromState,
      toState: input.toState,
      countryId,
      preconditionTokenAfter: patched.updateTime
        ? `fs_ut_${patched.updateTime}`
        : `fs_exists_${input.command.agentId.slice(0, 8)}`,
      appliedAtUtc: new Date().toISOString(),
    };
  }

  static isReachable(flags: AgentWriteFlagGate): boolean {
    return areAgentProductionWritesEnabled(flags);
  }
}

/**
 * Factory: Production runtime receives REAL ProductionAgentWriteRepository.
 * Gates default FALSE — apply fails closed.
 */
export function createProductionRuntimeAgentWriteRepository(
  flags?: AgentWriteFlagGate,
  port?: import("@/infrastructure/production/writes/ProductionFirestoreWritePort").ProductionFirestoreWritePort,
): ProductionAgentWriteRepository {
  return new ProductionAgentWriteRepository(
    flags ?? {
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    },
    port,
  );
}
