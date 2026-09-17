/**
 * Phase 5C — Production write gate for Customer Controlled Writes.
 * Env gates only. Auth dual-write remains deferred (CUSTOMER_AUTH_WRITE_ENABLED).
 */

import type { CustomerWriteFlagGate } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

/** Historical constant retained for inventory docs/tests. */
export const CUSTOMER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

/** Auth dual-write stays deferred until explicit operator arming of CUSTOMER_AUTH_WRITE_ENABLED. */
export const CUSTOMER_AUTH_WRITE_HARD_FALSE = false as const;

export function areCustomerProductionWritesEnabled(
  flags: CustomerWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.CUSTOMER_WRITE_ENABLED === true
  );
}

export function isCustomerAuthWriteEnabled(
  flags: CustomerWriteFlagGate,
): boolean {
  // Auth sync remains deferred until CUSTOMER_AUTH_WRITE_HARD_FALSE is lifted
  // by a dedicated phase. Constant stays false → always deferred here.
  void CUSTOMER_AUTH_WRITE_HARD_FALSE;
  void flags.CUSTOMER_AUTH_WRITE_ENABLED;
  return false;
}

export function assertCustomerProductionWriteEnabled(
  flags: CustomerWriteFlagGate,
): void {
  if (!areCustomerProductionWritesEnabled(flags)) {
    throw new CustomerWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and CUSTOMER_WRITE_ENABLED required",
    );
  }
}

export function assertCustomerAuthWriteEnabled(
  flags: CustomerWriteFlagGate,
): void {
  if (!isCustomerAuthWriteEnabled(flags)) {
    throw new CustomerWriteError(
      "AUTH_WRITE_DISABLED",
      "CUSTOMER_AUTH_WRITE_ENABLED is false — Auth sync deferred",
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
