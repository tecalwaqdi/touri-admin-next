/**
 * Phase 5A — Production write gate for Driver Controlled Writes.
 * Requires GLOBAL_PRODUCTION_WRITE_ENABLED AND DRIVER_WRITE_ENABLED.
 * Both remain false → PRODUCTION_WRITE_DISABLED (no Firestore mutation attempt).
 */

import type { DriverWriteFlagGate } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import {
  DriverWriteError,
} from "@/application/controlled-writes/drivers/DriverWriteErrors";

/**
 * Historical constant name retained for inventory docs/tests.
 * Env gates (GLOBAL ∧ DRIVER ∧ PRODUCTION) are the only Production arm —
 * no code hard-lock bypasses operator flags.
 */
export const DRIVER_CONTROLLED_WRITES_PRODUCTION_HARD_FALSE = false as const;

export function areDriverProductionWritesEnabled(
  flags: DriverWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.DRIVER_WRITE_ENABLED === true
  );
}

/**
 * Gate for Production repository path.
 * Fake/emulator paths must NOT call this as a success gate — they use offline allow.
 */
export function assertDriverProductionWriteEnabled(
  flags: DriverWriteFlagGate,
): void {
  if (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED !== true ||
    flags.PRODUCTION_WRITE_ENABLED !== true
  ) {
    throw new DriverWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED and PRODUCTION_WRITE_ENABLED required",
    );
  }
  if (flags.DRIVER_WRITE_ENABLED !== true) {
    throw new DriverWriteError(
      "RESOURCE_WRITE_DISABLED",
      "DRIVER_WRITE_ENABLED required",
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
