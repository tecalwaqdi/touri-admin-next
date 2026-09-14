// @vitest-environment node
/**
 * Phase 5N — metadata reconciliation APPLY stub (SKIP default).
 *
 * DO NOT arm/execute live Production reconciliation in this phase.
 * Even with PHASE5N_METADATA_RECONCILE_APPLY=1, the stub refuses writes.
 */

import { describe, expect, it } from "vitest";
import { isPhase5NMetadataReconcileApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { runPhase5NMetadataReconciliationApplyStub } from "@/application/controlled-writes/pilot/Phase5NMetadataReconciliationApplyStub";
import { planPhase5NMetadataReconciliation } from "@/application/controlled-writes/pilot/Phase5NReconciliationPlanner";
import { phase5NFixtureProductionIncomplete } from "@/application/controlled-writes/pilot/Phase5NFixtures";

const APPLY_FLAG = isPhase5NMetadataReconcileApplyEnabled(
  process.env.PHASE5N_METADATA_RECONCILE_APPLY,
);

describe("Phase 5N — metadata reconciliation apply stub (SKIP / refuse)", () => {
  it("apply gate defaults off; stub refuses even if flag on", async () => {
    if (!APPLY_FLAG) {
      expect(isPhase5NMetadataReconcileApplyEnabled(undefined)).toBe(false);
    }
    const plan = planPhase5NMetadataReconciliation(
      phase5NFixtureProductionIncomplete(),
    );
    const stub = await runPhase5NMetadataReconciliationApplyStub({
      plan,
      envFlag: APPLY_FLAG ? "1" : undefined,
    });
    expect(stub.applyRefused).toBe(true);
    expect(stub.productionWriteInvoked).toBe(false);
    expect(stub.domainCommandInvoked).toBe(false);
    expect(stub.summary.productionWrites).toBe(0);
    expect(stub.summary.applyAttempted).toBe(false);
  });
});
