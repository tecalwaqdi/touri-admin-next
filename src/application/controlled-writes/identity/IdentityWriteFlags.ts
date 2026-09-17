/**
 * Admin identity write gates — env only. Dedicated identity-admin WIF required at apply.
 */

import type { IdentityWriteFlagGate } from "@/application/controlled-writes/identity/IdentityWriteTypes";
import { IdentityWriteError } from "@/application/controlled-writes/identity/IdentityWriteErrors";

/** Historical constant retained for inventory docs/tests. */
export const IDENTITY_WRITE_PRODUCTION_HARD_FALSE = false as const;

export function snapshotIdentityWriteFlags(env: {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  ADMIN_IDENTITY_WRITE_ENABLED: boolean;
}): IdentityWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    ADMIN_IDENTITY_WRITE_ENABLED: env.ADMIN_IDENTITY_WRITE_ENABLED,
  };
}

export function areIdentityProductionWritesEnabled(
  flags: IdentityWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.ADMIN_IDENTITY_WRITE_ENABLED === true
  );
}

export function assertIdentityProductionWriteEnabled(
  flags: IdentityWriteFlagGate,
): void {
  if (!areIdentityProductionWritesEnabled(flags)) {
    throw new IdentityWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and ADMIN_IDENTITY_WRITE_ENABLED required",
    );
  }
}
