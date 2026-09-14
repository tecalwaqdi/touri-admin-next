/**
 * Phase 5A — Production write gate for Driver Controlled Writes.
 * Requires GLOBAL_PRODUCTION_WRITE_ENABLED AND DRIVER_WRITE_ENABLED.
 * Both remain false → PRODUCTION_WRITE_DISABLED (no Firestore mutation attempt).
 */

import type { DriverWriteFlagGate } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import {
  DriverWriteError,
} from "@/application/controlled-writes/drivers/DriverWriteErrors";

/** Hard lock — Phase 5A never activates Production driver writes. */
export const DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

function productionHardLockActive(): boolean {
  // Indirection avoids TS narrowing `false as const` against `true`.
  return DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE === (false as boolean);
}

export function areDriverProductionWritesEnabled(
  flags: DriverWriteFlagGate,
): boolean {
  if (!productionHardLockActive()) {
    return (
      flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
      flags.DRIVER_WRITE_ENABLED === true
    );
  }
  return false;
}

/**
 * Gate for Production repository path.
 * Fake/emulator paths must NOT call this as a success gate — they use offline allow.
 */
export function assertDriverProductionWriteEnabled(
  flags: DriverWriteFlagGate,
): void {
  if (!flags.GLOBAL_PRODUCTION_WRITE_ENABLED || !flags.DRIVER_WRITE_ENABLED) {
    throw new DriverWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED and DRIVER_WRITE_ENABLED required",
    );
  }
  if (productionHardLockActive()) {
    throw new DriverWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Driver Controlled Writes Production path hard-disabled (Phase 5A)",
    );
  }
}

export function snapshotDriverWriteFlags(
  flags: DriverWriteFlagGate,
): DriverWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: flags.GLOBAL_PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: flags.DRIVER_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: flags.PRODUCTION_WRITE_ENABLED ?? false,
  };
}
