// @vitest-environment node
/**
 * Phase 5H — Synthetic Driver fixture create harnesses (PREPARATION).
 *
 * DEFAULT: SKIP unless:
 *   PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE_DRY_RUN=1  → plan-only dry-run
 *   PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE=1          → create harness (still blocked)
 *
 * Separate from Pilot flags (5E/5F/5G). Do NOT create fixture. Do NOT create Auth.
 * Do NOT enable write flags. Do NOT start Finance / Pilot.
 *
 * Operator dry-run (local only):
 *   PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE_DRY_RUN=1 \
 *     npx vitest run src/test/live/phase5h-synthetic-driver-fixture.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  isPhase5HCreateSyntheticDriverFixtureDryRunEnabled,
  isPhase5HCreateSyntheticDriverFixtureEnabled,
} from "@/application/controlled-writes/pilot/isPhase5HFixtureCreateEnabled";
import {
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  PHASE_5H_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import { runPhase5HFixtureCreateDryRun } from "@/application/controlled-writes/pilot/Phase5HFixtureDryRun";
import {
  evaluatePhase5HFixtureCreateGate,
  PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateSemantics";
import {
  createSyntheticDriverFixtureRepository,
  SyntheticDriverFixtureRepository,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureRepository";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION } from "@/application/controlled-writes/pilot/Phase5HFixtureCreateAllowlist";

const CREATE = isPhase5HCreateSyntheticDriverFixtureEnabled(
  process.env.PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE,
);
const DRY_RUN = isPhase5HCreateSyntheticDriverFixtureDryRunEnabled(
  process.env.PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE_DRY_RUN,
);

describe("Phase 5H — Synthetic Driver fixture harness (SKIP / dry-run)", () => {
  it("defaults to SKIP; write flags false; Auth required → create NO-GO", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
    expect(FIXTURE_CREATION_NO_GO).toBe(true);
    expect(
      SyntheticDriverFixtureRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        PRODUCTION_WRITE_ENABLED: false,
      }),
    ).toBe(false);
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.fixtureDomainWrites).toBe(
      0,
    );
    expect(PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION.authWrites).toBe(0);

    if (!CREATE && !DRY_RUN) {
      const gate = evaluatePhase5HFixtureCreateGate({
        PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE:
          process.env.PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE,
        expectedProjectId: PHASE_5H_EXPECTED_PROJECT_ID,
        writeFlagsAllFalse: true,
      });
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.code).toBe("PHASE5H_FIXTURE_CREATE_SKIP");
      expect(gate.actualCreate).toBe(false);
      return;
    }

    if (DRY_RUN) {
      const result = runPhase5HFixtureCreateDryRun({
        projectId: PHASE_5H_EXPECTED_PROJECT_ID,
      });
      expect(result.actualWrite).toBe(false);
      expect(result.productionWrites).toBe(0);
      expect(result.authWrites).toBe(0);
      expect(result.financeWrites).toBe(0);
      expect(result.tripWrites).toBe(0);
      expect(result.writeFlagsRemainFalse).toBe(true);
      expect(result.AUTH_REQUIRED_FOR_FIXTURE).toBe(true);
      expect(result.FIXTURE_CREATION_NO_GO).toBe(true);
      expect(result.documentId).toBe(PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID);
      expect(result.idempotencyKey).toBe(PHASE_5H_FIXTURE_IDEMPOTENCY_KEY);
      expect(result.allowlistOk).toBe(true);
      expect(result.pilotCompatibility.safePilotEligible).toBe(true);
      expect(result.wouldWrite).toBe(false);
      expect(result.createBlockedCode).toBe("FIXTURE_CREATION_NO_GO");
      return;
    }

    // PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE=1 — still refuse mutation.
    const repo = createSyntheticDriverFixtureRepository();
    const created = repo.create(repo.planCreate());
    expect(created.ok).toBe(false);
    expect(created.actualWrite).toBe(false);
    if (!created.ok) {
      expect(created.code).toBe("FIXTURE_CREATION_NO_GO");
    }
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
  });
});
