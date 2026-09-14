/**
 * Phase 5C — CustomerWriteRepository port + implementations.
 *
 * - FakeCustomerWriteRepository: offline contract tests
 * - EmulatorCustomerWriteRepository: synthetic emulator path (optional)
 * - DisabledCustomerWriteRepository: always PRODUCTION_WRITE_DISABLED
 * - ProductionCustomerWriteRepository: structurally prepared, unreachable
 *
 * Fake/emulator MUST NOT leak into Production runtime wiring.
 * No finance / wallet / trip cancel / Auth dual-write.
 * Auth mutation prepared behind CUSTOMER_AUTH_WRITE_ENABLED=false.
 */

import type {
  CustomerWriteApplyInput,
  CustomerWriteApplyResult,
  CustomerWriteFlagGate,
  CustomerWriteSnapshot,
  ProvenCustomerOperationalState,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";
import {
  assertCustomerProductionWriteEnabled,
  areCustomerProductionWritesEnabled,
  assertCustomerAuthWriteEnabled,
} from "@/application/controlled-writes/customers/CustomerWriteFlags";
import {
  ProductionWriteDisabledError,
  DisabledWriteRepository,
} from "@/infrastructure/production/DisabledWriteRepository";

export type CustomerWriteRepository = {
  readonly kind:
    | "fake_customer_write"
    | "emulator_customer_write"
    | "disabled_customer_write"
    | "production_customer_write_unreachable";
  apply(input: CustomerWriteApplyInput): Promise<CustomerWriteApplyResult>;
};

function nextToken(prev: string): string {
  return `tok_${prev}_next_${Date.now().toString(36)}`;
}

/**
 * Offline fake — mutates an in-memory customer map.
 * Never touches Firebase. Never mutates Auth.
 */
export class FakeCustomerWriteRepository implements CustomerWriteRepository {
  readonly kind = "fake_customer_write" as const;
  readonly applied: CustomerWriteApplyResult[] = [];
  private readonly customers = new Map<string, CustomerWriteSnapshot>();
  /** Serialize applies per customerId (concurrency-safe token re-check). */
  private readonly customerChains = new Map<string, Promise<unknown>>();

  seed(snapshot: CustomerWriteSnapshot): void {
    this.customers.set(snapshot.customerId, { ...snapshot });
  }

  get(customerId: string): CustomerWriteSnapshot | undefined {
    const s = this.customers.get(customerId);
    return s ? { ...s } : undefined;
  }

  private async withCustomerLock<T>(
    customerId: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const prev = this.customerChains.get(customerId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const chained = prev.then(() => gate);
    this.customerChains.set(customerId, chained);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async apply(input: CustomerWriteApplyInput): Promise<CustomerWriteApplyResult> {
    return this.withCustomerLock(input.command.customerId, () => {
      const current = this.customers.get(input.command.customerId);
      if (!current || !current.exists) {
        throw new CustomerWriteError(
          "CUSTOMER_NOT_FOUND",
          `Fake store missing ${input.command.customerId}`,
        );
      }
      if (current.preconditionToken !== input.command.preconditionToken) {
        throw new CustomerWriteError(
          "PRECONDITION_FAILED",
          "Fake concurrency token mismatch at apply",
        );
      }
      if (current.operationalState !== input.fromState) {
        throw new CustomerWriteError(
          "PRECONDITION_FAILED",
          "Fake fromState mismatch at apply",
        );
      }
      // Re-check active trip at apply for disable/block
      if (
        (input.command.action === "disable" ||
          input.command.action === "block") &&
        current.tripState === "active"
      ) {
        throw new CustomerWriteError(
          "CUSTOMER_HAS_ACTIVE_TRIP",
          "Fake apply denied — active trip",
        );
      }

      const afterToken = nextToken(current.preconditionToken);
      let accountEnabled = current.accountEnabled;
      if (input.toState === "disabled" || input.toState === "blocked") {
        accountEnabled = "disabled";
      } else if (input.toState === "enabled") {
        accountEnabled = "enabled";
      }

      const updated: CustomerWriteSnapshot = {
        ...current,
        operationalState: input.toState,
        preconditionToken: afterToken,
        accountEnabled,
      };
      this.customers.set(current.customerId, updated);

      const result: CustomerWriteApplyResult = {
        customerId: current.customerId,
        countryId: current.countryId,
        fromState: input.fromState,
        toState: input.toState,
        preconditionTokenAfter: afterToken,
        appliedAtUtc: new Date().toISOString(),
        authWriteExecuted: false,
      };
      this.applied.push(result);
      return result;
    });
  }

  /** Test helper — force operational state without going through commands. */
  forceState(customerId: string, to: ProvenCustomerOperationalState): void {
    const current = this.customers.get(customerId);
    if (!current) return;
    this.customers.set(customerId, {
      ...current,
      operationalState: to,
      preconditionToken: nextToken(current.preconditionToken),
      accountEnabled:
        to === "enabled"
          ? "enabled"
          : to === "disabled" || to === "blocked"
            ? "disabled"
            : current.accountEnabled,
    });
  }

  forceTripState(
    customerId: string,
    tripState: CustomerWriteSnapshot["tripState"],
  ): void {
    const current = this.customers.get(customerId);
    if (!current) return;
    this.customers.set(customerId, { ...current, tripState });
  }
}

/**
 * Emulator repository — synthetic only.
 * Does not connect to Production. When no emulator client is injected,
 * apply throws INTERNAL_WRITE_FAILURE so callers document unavailability.
 */
export class EmulatorCustomerWriteRepository implements CustomerWriteRepository {
  readonly kind = "emulator_customer_write" as const;
  readonly applied: CustomerWriteApplyResult[] = [];
  private readonly available: boolean;
  private readonly store: FakeCustomerWriteRepository;

  constructor(opts?: { available?: boolean }) {
    this.available = opts?.available === true;
    this.store = new FakeCustomerWriteRepository();
  }

  get isAvailable(): boolean {
    return this.available;
  }

  getSyntheticStore(): FakeCustomerWriteRepository {
    return this.store;
  }

  seed(snapshot: CustomerWriteSnapshot): void {
    if (!this.available) {
      throw new CustomerWriteError(
        "INTERNAL_WRITE_FAILURE",
        "Emulator unavailable — cannot seed",
      );
    }
    this.store.seed(snapshot);
  }

  async apply(input: CustomerWriteApplyInput): Promise<CustomerWriteApplyResult> {
    if (!this.available) {
      throw new CustomerWriteError(
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
export class DisabledCustomerWriteRepository implements CustomerWriteRepository {
  readonly kind = "disabled_customer_write" as const;
  private readonly disabled = new DisabledWriteRepository();

  async apply(input: CustomerWriteApplyInput): Promise<never> {
    void input;
    try {
      await this.disabled.execute({
        resource: "customer",
        operation: "controlled_write",
      });
    } catch (err) {
      if (err instanceof ProductionWriteDisabledError) {
        throw new CustomerWriteError(
          "PRODUCTION_WRITE_DISABLED",
          err.message,
        );
      }
      throw err;
    }
    throw new CustomerWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "DisabledCustomerWriteRepository",
    );
  }
}

/**
 * Production path — structurally prepared but unreachable while flags/hard-lock
 * remain false. Never instantiated in Production runtime DI in Phase 5C.
 * Auth sync prepared but gated by CUSTOMER_AUTH_WRITE_ENABLED=false.
 */
export class ProductionCustomerWriteRepository implements CustomerWriteRepository {
  readonly kind = "production_customer_write_unreachable" as const;

  constructor(private readonly flags: CustomerWriteFlagGate) {}

  async apply(input: CustomerWriteApplyInput): Promise<never> {
    void input;
    // Gate first — never attempt Firestore.
    assertCustomerProductionWriteEnabled(this.flags);
    // Unreachable while hard-lock is false.
    throw new CustomerWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "ProductionCustomerWriteRepository unreachable (Phase 5C)",
    );
  }

  /**
   * Prepared Auth sync hook — always AUTH_WRITE_DISABLED in Phase 5C.
   * Documents later Auth disable/enable sync; no hidden dual writes.
   */
  async prepareAuthSync(_input: {
    customerId: string;
    desiredAuthDisabled: boolean;
  }): Promise<never> {
    assertCustomerAuthWriteEnabled(this.flags);
    throw new CustomerWriteError(
      "AUTH_WRITE_DISABLED",
      "Auth sync unreachable (Phase 5C)",
    );
  }

  static isReachable(flags: CustomerWriteFlagGate): boolean {
    return areCustomerProductionWritesEnabled(flags);
  }
}

/**
 * Factory: Production runtime MUST receive Disabled only.
 * Fake/emulator are test/offline wiring only.
 */
export function createProductionRuntimeCustomerWriteRepository(): DisabledCustomerWriteRepository {
  return new DisabledCustomerWriteRepository();
}
