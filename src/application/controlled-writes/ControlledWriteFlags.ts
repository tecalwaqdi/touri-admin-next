/**
 * Phase 5 / PC-9 — write flag gate for Controlled Writes.
 * All Production write flags MUST remain false.
 * controlledWritesEnabled (Semantics B) stays false — Fake offline uses
 * allowOfflineExecution instead of flipping these env arms.
 */

import type { AppEnvConfig } from "@/config/env";
import type {
  ControlledWriteFlagSnapshot,
  ControlledWriteResource,
  ControlledWriteStageResult,
} from "@/application/controlled-writes/ControlledWriteTypes";

export const CONTROLLED_WRITES_ENABLED_HARD_FALSE = false as const;

export function snapshotWriteFlags(
  env: Pick<
    AppEnvConfig,
    | "PRODUCTION_WRITE_ENABLED"
    | "GLOBAL_PRODUCTION_WRITE_ENABLED"
    | "DRIVER_WRITE_ENABLED"
    | "AGENT_WRITE_ENABLED"
    | "CUSTOMER_WRITE_ENABLED"
    | "FINANCE_WRITE_ENABLED"
  >,
): ControlledWriteFlagSnapshot {
  return {
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
  };
}

export function allControlledWriteFlagsDisabled(
  flags: ControlledWriteFlagSnapshot,
): boolean {
  return (
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false
  );
}

function resourceFlagEnabled(
  resource: ControlledWriteResource,
  flags: ControlledWriteFlagSnapshot,
): boolean {
  switch (resource) {
    case "driver":
      return flags.DRIVER_WRITE_ENABLED;
    case "agent":
      return flags.AGENT_WRITE_ENABLED;
    case "customer":
      return flags.CUSTOMER_WRITE_ENABLED;
  }
}

/**
 * Every Production mutation requires: explicit resource flag + global write flags.
 * Finance remains out of this driver/agent/customer pipeline.
 */
export function assertControlledWriteFlagsAllow(
  resource: ControlledWriteResource,
  flags: ControlledWriteFlagSnapshot,
): ControlledWriteStageResult {
  if (flags.FINANCE_WRITE_ENABLED) {
    return {
      stage: "write_flags",
      ok: false,
      code: "FINANCE_FORBIDDEN",
      detail: "FINANCE_WRITE_ENABLED must remain false for Controlled Writes readiness",
    };
  }

  if (!flags.PRODUCTION_WRITE_ENABLED || !flags.GLOBAL_PRODUCTION_WRITE_ENABLED) {
    return {
      stage: "write_flags",
      ok: false,
      code: "GLOBAL_WRITE_DISABLED",
      detail: "PRODUCTION_WRITE_ENABLED and GLOBAL_PRODUCTION_WRITE_ENABLED required",
    };
  }

  if (!resourceFlagEnabled(resource, flags)) {
    return {
      stage: "write_flags",
      ok: false,
      code: "RESOURCE_FLAG_DISABLED",
      detail: `${resource} write flag is false`,
    };
  }

  void CONTROLLED_WRITES_ENABLED_HARD_FALSE;
  return { stage: "write_flags", ok: true };
}
