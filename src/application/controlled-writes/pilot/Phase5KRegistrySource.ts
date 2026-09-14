/**
 * Phase 5K — load fixture UID from Phase 5J operator registry only.
 * Never invents a new identity. Safe metadata only in return value.
 */

import {
  loadPhase5JOperatorRegistry,
  resolvePhase5JRegistryPath,
  type Phase5JOperatorRegistryRecord,
} from "@/application/controlled-writes/pilot/Phase5JOperatorRegistry";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import { existsSync } from "node:fs";

export type Phase5KRegistrySourceResult =
  | {
      ok: true;
      uid: string;
      logicalFixtureNameMatch: true;
      provisioningStatusMatch: boolean;
      status: Phase5JOperatorRegistryRecord["status"];
      registryPath: string;
    }
  | {
      ok: false;
      code:
        | "REGISTRY_MISSING"
        | "UID_MISSING"
        | "LOGICAL_NAME_MISMATCH"
        | "STATUS_NOT_PILOT_READY";
      message: string;
      uid: null;
      logicalFixtureNameMatch: boolean;
      provisioningStatusMatch: boolean;
      status: string | null;
      registryPath: string;
    };

/**
 * Source UID exclusively from .local/phase5j-fixture/registry.json.
 * Does not mutate the registry.
 */
export function loadPhase5KFixtureUidFromRegistry(
  cwd = process.cwd(),
): Phase5KRegistrySourceResult {
  const registryPath = resolvePhase5JRegistryPath(cwd);
  if (!existsSync(registryPath)) {
    return {
      ok: false,
      code: "REGISTRY_MISSING",
      message: "Phase 5J registry.json not found",
      uid: null,
      logicalFixtureNameMatch: false,
      provisioningStatusMatch: false,
      status: null,
      registryPath,
    };
  }

  const registry = loadPhase5JOperatorRegistry(cwd);
  const logicalFixtureNameMatch =
    registry.logicalFixtureName === PHASE_5I_LOGICAL_FIXTURE_NAME;
  const provisioningStatusMatch = registry.status === "pilot_ready";

  if (!logicalFixtureNameMatch) {
    return {
      ok: false,
      code: "LOGICAL_NAME_MISMATCH",
      message: `logicalFixtureName must be ${PHASE_5I_LOGICAL_FIXTURE_NAME}`,
      uid: null,
      logicalFixtureNameMatch: false,
      provisioningStatusMatch,
      status: registry.status,
      registryPath,
    };
  }

  if (!registry.uid?.trim()) {
    return {
      ok: false,
      code: "UID_MISSING",
      message: "registry.uid missing — cannot verify",
      uid: null,
      logicalFixtureNameMatch: true,
      provisioningStatusMatch,
      status: registry.status,
      registryPath,
    };
  }

  if (!provisioningStatusMatch) {
    return {
      ok: false,
      code: "STATUS_NOT_PILOT_READY",
      message: `provisioningStatus=${registry.status}; expected pilot_ready`,
      uid: null,
      logicalFixtureNameMatch: true,
      provisioningStatusMatch: false,
      status: registry.status,
      registryPath,
    };
  }

  return {
    ok: true,
    uid: registry.uid,
    logicalFixtureNameMatch: true,
    provisioningStatusMatch: true,
    status: registry.status,
    registryPath,
  };
}
