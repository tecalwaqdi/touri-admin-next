import type { SupportWriteFlagGate } from "@/application/controlled-writes/support/SupportWriteTypes";
import { SupportWriteError } from "@/application/controlled-writes/support/SupportWriteErrors";

/** Hard lock — Production path never executes even if env flipped. */
export const SUPPORT_WRITE_PRODUCTION_HARD_FALSE = false as const;

export const DEFAULT_SUPPORT_WRITE_FLAGS_FALSE: SupportWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  SUPPORT_WRITE_ENABLED: false,
};

export function snapshotSupportWriteFlags(env: {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  SUPPORT_WRITE_ENABLED: boolean;
}): SupportWriteFlagGate {
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    SUPPORT_WRITE_ENABLED: env.SUPPORT_WRITE_ENABLED,
  };
}

export function assertSupportProductionWriteEnabled(
  flags: SupportWriteFlagGate,
): void {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED ||
    !flags.SUPPORT_WRITE_ENABLED
  ) {
    throw new SupportWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and SUPPORT_WRITE_ENABLED required",
    );
  }
  if (SUPPORT_WRITE_PRODUCTION_HARD_FALSE === (false as boolean)) {
    throw new SupportWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "Support write Production path hard-disabled until operator arming",
    );
  }
}
