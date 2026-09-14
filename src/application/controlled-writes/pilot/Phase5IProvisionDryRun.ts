/**
 * Phase 5I — operator dry-run harness (plan only). Writes = 0.
 * Separate from Pilot flags. No Production Auth/Firestore mutation.
 */

import { createSyntheticDriverProvisioningService } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import type { Phase5IDryRunResult } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import { buildEmptyOperatorRegistryRecord } from "@/application/controlled-writes/pilot/Phase5IProvisioningOrder";

export function runPhase5ISyntheticDriverProvisionDryRun(input?: {
  projectId?: string;
  dryRunEnv?: string;
  provisionEnv?: string;
  authFixtureWriteEnv?: string;
}): Phase5IDryRunResult {
  const service = createSyntheticDriverProvisioningService();
  return service.dryRun({
    projectId: input?.projectId,
    registry: buildEmptyOperatorRegistryRecord(),
    dryRunEnv: input?.dryRunEnv ?? "1",
    provisionEnv: input?.provisionEnv,
    authFixtureWriteEnv: input?.authFixtureWriteEnv,
  });
}
