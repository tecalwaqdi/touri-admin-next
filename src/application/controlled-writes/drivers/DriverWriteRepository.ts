/**
 * Phase 5A — DriverWriteRepository port + implementations.
 *
 * - FakeDriverWriteRepository: offline contract tests only
 * - EmulatorDriverWriteRepository: synthetic emulator path (optional)
 * - DisabledDriverWriteRepository: always PRODUCTION_WRITE_DISABLED
 * - ProductionDriverWriteRepository: structurally prepared, unreachable
 *
 * Fake/emulator MUST NOT leak into Production runtime wiring.
 */

import type {
  DriverWriteApplyInput,
  DriverWriteApplyResult,
  DriverWriteFlagGate,
  DriverWriteSnapshot,
  ProvenDriverRegistrationState,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";
import {
  assertDriverProductionWriteEnabled,
  areDriverProductionWritesEnabled,
} from "@/application/controlled-writes/drivers/DriverWriteFlags";
import {
  ProductionWriteDisabledError,
  DisabledWriteRepository,
} from "@/infrastructure/production/DisabledWriteRepository";
import {
  planProductionDriverWriteTransaction,
  PRODUCTION_DRIVER_WRITE_REPO_REVIEW,
  type ProductionDriverWriteTransactionPlan,
} from "@/application/controlled-writes/pilot/Phase5EProductionDriverWriteAllowlist";

export type DriverWriteRepository = {
  readonly kind:
    | "fake_driver_write"
    | "emulator_driver_write"
    | "disabled_driver_write"
    | "production_driver_write"
    /** @deprecated alias retained for older pilot harness imports */
    | "production_driver_write_unreachable"
    /** Phase 5M Pilot-only Production path — gated by Phase5M operator gates. */
    | "phase5m_pilot_production_driver_write";
  apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult>;
};

function nextToken(prev: string): string {
  return `tok_${prev}_next_${Date.now().toString(36)}`;
}

/** Offline fake — mutates an in-memory driver map. Never touches Firebase. */
export class FakeDriverWriteRepository implements DriverWriteRepository {
  readonly kind = "fake_driver_write" as const;
  readonly applied: DriverWriteApplyResult[] = [];
  private readonly drivers = new Map<string, DriverWriteSnapshot>();
  /** Serialize applies per driverId (concurrency-safe token re-check). */
  private readonly driverChains = new Map<string, Promise<unknown>>();

  seed(snapshot: DriverWriteSnapshot): void {
    this.drivers.set(snapshot.driverId, { ...snapshot });
  }

  get(driverId: string): DriverWriteSnapshot | undefined {
    const s = this.drivers.get(driverId);
    return s ? { ...s } : undefined;
  }

  private async withDriverLock<T>(
    driverId: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const prev = this.driverChains.get(driverId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.then(() => gate);
    this.driverChains.set(driverId, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult> {
    return this.withDriverLock(input.command.driverId, () => {
      const current = this.drivers.get(input.command.driverId);
      if (!current || !current.exists) {
        throw new DriverWriteError(
          "DRIVER_NOT_FOUND",
          `Fake store missing ${input.command.driverId}`,
        );
      }
      if (current.preconditionToken !== input.command.preconditionToken) {
        throw new DriverWriteError(
          "PRECONDITION_FAILED",
          "Fake concurrency token mismatch at apply",
        );
      }
      if (current.registrationStatus !== input.fromState) {
        throw new DriverWriteError(
          "PRECONDITION_FAILED",
          "Fake fromState mismatch at apply",
        );
      }

      const afterToken = nextToken(current.preconditionToken);
      let accountEnabled = current.accountEnabled;
      if (input.toState === "suspended") accountEnabled = "disabled";
      else if (input.fromState === "suspended" && input.toState === "approved") {
        accountEnabled = "enabled";
      }
      const updated: DriverWriteSnapshot = {
        ...current,
        registrationStatus: input.toState,
        preconditionToken: afterToken,
        accountEnabled,
      };
      this.drivers.set(current.driverId, updated);

      const result: DriverWriteApplyResult = {
        driverId: current.driverId,
        fromState: input.fromState,
        toState: input.toState,
        preconditionTokenAfter: afterToken,
        appliedAtUtc: new Date().toISOString(),
      };
      this.applied.push(result);
      return result;
    });
  }

  /** Test helper for needs_changes → pending_review (not an admin command). */
  forceTransition(
    driverId: string,
    to: ProvenDriverRegistrationState,
  ): void {
    const current = this.drivers.get(driverId);
    if (!current) return;
    this.drivers.set(driverId, {
      ...current,
      registrationStatus: to,
      preconditionToken: nextToken(current.preconditionToken),
    });
  }
}

/**
 * Emulator repository — synthetic only.
 * Does not connect to Production. When no emulator client is injected,
 * apply throws INTERNAL_WRITE_FAILURE so callers document unavailability.
 */
export class EmulatorDriverWriteRepository implements DriverWriteRepository {
  readonly kind = "emulator_driver_write" as const;
  readonly applied: DriverWriteApplyResult[] = [];
  private readonly available: boolean;
  /** Synthetic in-memory stand-in — never Production Firebase. */
  private readonly store: FakeDriverWriteRepository;

  constructor(opts?: { available?: boolean }) {
    this.available = opts?.available === true;
    this.store = new FakeDriverWriteRepository();
  }

  get isAvailable(): boolean {
    return this.available;
  }

  /** Expose synthetic store for test loadPort wiring only. */
  getSyntheticStore(): FakeDriverWriteRepository {
    return this.store;
  }

  seed(snapshot: DriverWriteSnapshot): void {
    if (!this.available) {
      throw new DriverWriteError(
        "INTERNAL_WRITE_FAILURE",
        "Emulator unavailable — cannot seed",
      );
    }
    this.store.seed(snapshot);
  }

  async apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult> {
    if (!this.available) {
      throw new DriverWriteError(
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
export class DisabledDriverWriteRepository implements DriverWriteRepository {
  readonly kind = "disabled_driver_write" as const;
  private readonly disabled = new DisabledWriteRepository();

  async apply(input: DriverWriteApplyInput): Promise<never> {
    void input;
    try {
      await this.disabled.execute({
        resource: "driver",
        operation: "controlled_write",
      });
    } catch (err) {
      if (err instanceof ProductionWriteDisabledError) {
        throw new DriverWriteError(
          "PRODUCTION_WRITE_DISABLED",
          err.message,
        );
      }
      throw err;
    }
    throw new DriverWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "DisabledDriverWriteRepository",
    );
  }
}

/**
 * REAL Production driver writer — allowlisted registration_status patch via
 * injectable Firestore write port (WIF REST in Production). Gates must pass
 * before any mutation. Fake/offline must not use this class.
 */
export class ProductionDriverWriteRepository implements DriverWriteRepository {
  readonly kind = "production_driver_write" as const;

  static readonly review = {
    ...PRODUCTION_DRIVER_WRITE_REPO_REVIEW,
    kind: "production_driver_write" as const,
    activated: true,
    hardLock: false,
    notes:
      "REAL allowlisted Production writer. Env gates default FALSE. " +
      "Uses dedicated driver-review WIF principal — never shadow-reader.",
  };

  constructor(
    private readonly flags: DriverWriteFlagGate,
    private readonly port?: import("@/infrastructure/production/writes/ProductionFirestoreWritePort").ProductionFirestoreWritePort,
  ) {}

  planAllowlistedTransaction(
    input: DriverWriteApplyInput,
  ): ProductionDriverWriteTransactionPlan {
    return planProductionDriverWriteTransaction({
      action: input.command.action,
      driverId: input.command.driverId,
      preconditionToken: input.command.preconditionToken,
      fromState: input.fromState,
      toState: input.toState,
    });
  }

  async apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult> {
    assertDriverProductionWriteEnabled(this.flags);
    const port = this.port;
    if (!port) {
      throw new DriverWriteError(
        "INTERNAL_WRITE_FAILURE",
        "WRITE_RUNTIME_UNAVAILABLE: Production driver write port not configured (WIF SA)",
      );
    }
    const plan = this.planAllowlistedTransaction(input);
    const snap = await port.getDocument("user", input.command.driverId);
    if (!snap.exists || !snap.data) {
      throw new DriverWriteError("DRIVER_NOT_FOUND", `Driver ${input.command.driverId} missing`);
    }
    const status = String(snap.data.registration_status ?? "");
    if (status !== input.fromState) {
      throw new DriverWriteError("PRECONDITION_FAILED", "fromState mismatch at apply");
    }
    const expectedUt =
      input.command.preconditionToken.startsWith("fs_ut_")
        ? input.command.preconditionToken.slice("fs_ut_".length)
        : snap.updateTime;
    const patched = await port.updateDocument(
      "user",
      input.command.driverId,
      { ...plan.patch } as Record<string, unknown>,
      { expectedUpdateTime: expectedUt },
    );
    return {
      driverId: input.command.driverId,
      fromState: input.fromState,
      toState: input.toState,
      preconditionTokenAfter: patched.updateTime
        ? `fs_ut_${patched.updateTime}`
        : `fs_exists_${input.command.driverId.slice(0, 8)}`,
      appliedAtUtc: new Date().toISOString(),
    };
  }

  static isReachable(flags: DriverWriteFlagGate): boolean {
    return areDriverProductionWritesEnabled(flags);
  }
}

/**
 * Factory: Production runtime receives REAL ProductionDriverWriteRepository.
 * Gates remain FALSE by default — apply() fails closed without mutation.
 * Fake/emulator are test/offline wiring only.
 */
export function createProductionRuntimeDriverWriteRepository(
  flags?: DriverWriteFlagGate,
  port?: import("@/infrastructure/production/writes/ProductionFirestoreWritePort").ProductionFirestoreWritePort,
): ProductionDriverWriteRepository {
  return new ProductionDriverWriteRepository(
    flags ?? {
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
    },
    port,
  );
}
