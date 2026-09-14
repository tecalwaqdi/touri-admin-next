/**
 * Phase 5C — Production write gate for Customer Controlled Writes.
 * Requires GLOBAL_PRODUCTION_WRITE_ENABLED AND PRODUCTION_WRITE_ENABLED
 * AND CUSTOMER_WRITE_ENABLED. All remain false → PRODUCTION_WRITE_DISABLED
 * (no Firestore mutation attempt).
 *
 * CUSTOMER_AUTH_WRITE_ENABLED remains false — Auth sync is a later step.
 */

import type { CustomerWriteFlagGate } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

/** Hard lock — Phase 5C never activates Production customer writes. */
export const CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

/** Hard lock — Auth dual-write never enabled in Phase 5C. */
export const CUSTOMER_AUTH_WRITE_HARD_FALSE = false as const;

function productionHardLockActive(): boolean {
  return CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE === (false as boolean);
}

function authHardLockActive(): boolean {
  return CUSTOMER_AUTH_WRITE_HARD_FALSE === (false as boolean);
}

export function areCustomerProductionWritesEnabled(
  flags: CustomerWriteFlagGate,
): boolean {
  if (!productionHardLockActive()) {
    return (
      flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
      flags.PRODUCTION_WRITE_ENABLED === true &&
      flags.CUSTOMER_WRITE_ENABLED === true
    );
  }
  return false;
}

export function isCustomerAuthWriteEnabled(
  flags: CustomerWriteFlagGate,
): boolean {
  if (authHardLockActive()) return false;
  return flags.CUSTOMER_AUTH_WRITE_ENABLED === true;
}

/**
 * Gate for Production repository path.
 * Fake/emulator paths must NOT call this as a success gate — they use offline allow.
 */
export function assertCustomerProductionWriteEnabled(
  flags: CustomerWriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.CUSTOMER_WRITE_ENABLED
  ) {
    throw new CustomerWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and CUSTOMER_WRITE_ENABLED required",
    );
  }
  if (productionHardLockActive()) {
    throw new CustomerWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Customer Controlled Writes Production path hard-disabled (Phase 5C)",
    );
  }
}

/**
 * Auth mutation gate — prepared for later sync; always denies in Phase 5C.
 * Prefer Firestore application/account state only; no hidden dual writes.
 */
export function assertCustomerAuthWriteEnabled(
  flags: CustomerWriteFlagGate,
): void {
  if (!flags.CUSTOMER_AUTH_WRITE_ENABLED || authHardLockActive()) {
    throw new CustomerWriteError(
      "AUTH_WRITE_DISABLED",
      "CUSTOMER_AUTH_WRITE_ENABLED is false — Auth sync deferred (Phase 5C)",
    );
  }
}

export function snapshotCustomerWriteFlags(
  flags: CustomerWriteFlagGate,
): CustomerWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: flags.PRODUCTION_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: flags.CUSTOMER_WRITE_ENABLED,
    CUSTOMER_AUTH_WRITE_ENABLED: flags.CUSTOMER_AUTH_WRITE_ENABLED,
  };
}
