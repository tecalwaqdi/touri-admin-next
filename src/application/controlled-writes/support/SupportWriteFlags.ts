import type { SupportWriteFlagGate } from "@/application/controlled-writes/support/SupportWriteTypes";
import { SupportWriteError } from "@/application/controlled-writes/support/SupportWriteErrors";

/** Historical constant retained for inventory docs/tests. */
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

export function areSupportProductionWritesEnabled(
  flags: SupportWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === true &&
    flags.PRODUCTION_WRITE_ENABLED === true &&
    flags.SUPPORT_WRITE_ENABLED === true
  );
}

export function assertSupportProductionWriteEnabled(
  flags: SupportWriteFlagGate,
): void {
  if (!areSupportProductionWritesEnabled(flags)) {
    throw new SupportWriteError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED, PRODUCTION_WRITE_ENABLED, and SUPPORT_WRITE_ENABLED required",
    );
  }
}
