/**
 * Admin identity write gates.
 * ADMIN_IDENTITY_WRITE_ENABLED default false.
 * Production hard-lock remains false until operator arming.
 */

import type { IdentityWriteFlagGate } from "@/application/controlled-writes/identity/IdentityWriteTypes";
import { IdentityWriteError } from "@/application/controlled-writes/identity/IdentityWriteErrors";

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

export function assertIdentityProductionWriteEnabled(
  flags: IdentityWriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.ADMIN_IDENTITY_WRITE_ENABLED
  ) {
    throw new IdentityWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and ADMIN_IDENTITY_WRITE_ENABLED required",
    );
  }
  if (IDENTITY_WRITE_PRODUCTION_HARD_FALSE === (false as boolean)) {
    throw new IdentityWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Identity write Production path hard-disabled until operator arming",
    );
  }
}
