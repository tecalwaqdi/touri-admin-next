/**
 * Phase 5D — consolidated Production / resource write gating.
 * Distinct codes: PRODUCTION_WRITE_DISABLED vs RESOURCE_WRITE_DISABLED.
 * All flags remain false in this phase — no repository mutation.
 */

import type { ControlledWriteResource } from "@/application/controlled-writes/ControlledWriteTypes";
import { ControlledWriteConsolidationError } from "@/application/controlled-writes/ControlledWriteErrorCatalog";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";

export type ConsolidationWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  CUSTOMER_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
  CUSTOMER_AUTH_WRITE_ENABLED?: boolean;
};

export const DEFAULT_CONSOLIDATION_FLAGS_FALSE: ConsolidationWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  CUSTOMER_AUTH_WRITE_ENABLED: false,
};

function resourceFlag(
  resource: ControlledWriteResource,
  flags: ConsolidationWriteFlagGate,
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
 * Assert Production path may proceed. Throws distinct codes.
 * Offline Fake paths must skip this (allowOfflineExecution).
 */
export function assertConsolidationProductionGates(
  resource: ControlledWriteResource,
  flags: ConsolidationWriteFlagGate,
): void {
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    throw new ControlledWriteConsolidationError(
      "PRODUCTION_WRITE_DISABLED",
      "productionWritesEnabled must remain false (Phase 5D)",
    );
  }
  if (CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled !== false) {
    throw new ControlledWriteConsolidationError(
      "PRODUCTION_WRITE_DISABLED",
      "controlledWritesEnabled must remain false (Phase 5D)",
    );
  }

  if (flags.FINANCE_WRITE_ENABLED) {
    throw new ControlledWriteConsolidationError(
      "VALIDATION_FAILED",
      "FINANCE_WRITE_ENABLED must remain false — Finance not started",
    );
  }

  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED
  ) {
    throw new ControlledWriteConsolidationError(
      "PRODUCTION_WRITE_DISABLED",
      "GLOBAL_PRODUCTION_WRITE_ENABLED and PRODUCTION_WRITE_ENABLED required",
    );
  }

  if (!resourceFlag(resource, flags)) {
    throw new ControlledWriteConsolidationError(
      "RESOURCE_WRITE_DISABLED",
      `${resource} write flag is false`,
    );
  }

  // Even if flags were flipped, Phase 5D hard enablement stays off.
  throw new ControlledWriteConsolidationError(
    "PRODUCTION_WRITE_DISABLED",
    "Controlled Writes activation locked false (Phase 5D consolidation)",
  );
}

export function allConsolidationWriteFlagsDisabled(
  flags: ConsolidationWriteFlagGate,
): boolean {
  return (
    flags.GLOBAL_PRODUCTION_WRITE_ENABLED === false &&
    flags.PRODUCTION_WRITE_ENABLED === false &&
    flags.DRIVER_WRITE_ENABLED === false &&
    flags.AGENT_WRITE_ENABLED === false &&
    flags.CUSTOMER_WRITE_ENABLED === false &&
    flags.FINANCE_WRITE_ENABLED === false &&
    (flags.CUSTOMER_AUTH_WRITE_ENABLED ?? false) === false
  );
}
