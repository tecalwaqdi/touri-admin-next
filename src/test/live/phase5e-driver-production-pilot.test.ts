// @vitest-environment node
/**
 * Phase 5E — Synthetic Production Driver Pilot harness (PREPARATION).
 *
 * DEFAULT: SKIP unless PHASE5E_DRIVER_PILOT=1 (still fail-closed on write flags).
 * DRY-RUN: PHASE5E_DRIVER_PILOT_DRY_RUN=1 → read/validate/plan only; writes=0.
 *
 * Do NOT execute real Production write. Do NOT enable write flags.
 * Do NOT create synthetic Driver. Do NOT start Finance.
 *
 * Operator dry-run (local only):
 *   PHASE5E_DRIVER_PILOT_DRY_RUN=1 \
 *     PILOT_DRIVER_ID=test_phase5e_driver_needs_changes_pilot_001 \
 *     PILOT_PROJECT_ID=tutorial-multi-language-70gx4j \
 *     PILOT_BEFORE_STATE=pending_review \
 *     PILOT_PRECONDITION_TOKEN='…' \
 *     PILOT_OPERATOR_IDENTITY='super_admin_uid' \
 *     npx vitest run src/test/live/phase5e-driver-production-pilot.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  isPhase5EDriverPilotDryRunEnabled,
  isPhase5EDriverPilotEnabled,
} from "@/application/controlled-writes/pilot/isPhase5EDriverPilotEnabled";
import {
  PHASE_5E_EXPECTED_PROJECT_ID,
  PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
  AUTH_REQUIRED_FOR_PILOT_TARGET,
} from "@/application/controlled-writes/pilot/Phase5ESyntheticDriverRequirements";
import {
  evaluatePhase5EPilotGate,
  PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION,
  PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
  buildPreparationObservabilitySummary,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotGates";
import { runPhase5EDriverPilotDryRun } from "@/application/controlled-writes/pilot/Phase5EDriverPilotDryRun";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { ProductionDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";

const PILOT = isPhase5EDriverPilotEnabled(process.env.PHASE5E_DRIVER_PILOT);
const DRY_RUN = isPhase5EDriverPilotDryRunEnabled(
  process.env.PHASE5E_DRIVER_PILOT_DRY_RUN,
);

describe("Phase 5E — Driver Production Pilot harness (SKIP / dry-run)", () => {
  it("defaults to SKIP; write flags remain false; Production unreachable", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(
      ProductionDriverWriteRepository.isReachable({
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
      }),
    ).toBe(false);
    expect(AUTH_REQUIRED_FOR_PILOT_TARGET).toBe(false);
    expect(PHASE_5E_EXPECTED_WRITE_COUNTS_PREPARATION.productionWrites).toBe(0);

    if (!PILOT && !DRY_RUN) {
      const gate = evaluatePhase5EPilotGate({
        PHASE5E_DRIVER_PILOT: process.env.PHASE5E_DRIVER_PILOT,
      });
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.code).toBe("PHASE5E_DRIVER_PILOT_SKIP");
      expect(buildPreparationObservabilitySummary().actualWrite).toBe(false);
      return;
    }

    // Explicit dry-run path — still no writes / flags false.
    if (DRY_RUN) {
      const result = runPhase5EDriverPilotDryRun({
        projectId:
          process.env.PILOT_PROJECT_ID?.trim() || PHASE_5E_EXPECTED_PROJECT_ID,
        pilotDriverId:
          process.env.PILOT_DRIVER_ID?.trim() ||
          PHASE_5E_SYNTHETIC_DRIVER_ID_STRATEGY,
        expectedBeforeState:
          process.env.PILOT_BEFORE_STATE?.trim() || "pending_review",
        preconditionToken:
          process.env.PILOT_PRECONDITION_TOKEN?.trim() || "tok_dry_placeholder",
        operatorIdentity:
          process.env.PILOT_OPERATOR_IDENTITY?.trim() || "op_dry_run",
        actorRole: PHASE_5E_PILOT_ACTOR_ROLE_REQUIRED,
        observed: {
          tripState: "idle",
          isOperationalDriver: true,
          is_test: true,
          functional_test: true,
        },
      });
      expect(result.actualWrite).toBe(false);
      expect(result.productionWrites).toBe(0);
      expect(result.authWrites).toBe(0);
      expect(result.financeWrites).toBe(0);
      expect(result.tripWrites).toBe(0);
      expect(result.writeFlagsRemainFalse).toBe(true);
      // wouldWrite may be true when plan valid — still no mutation.
      return;
    }

    // PHASE5E_DRIVER_PILOT=1 without dry-run: preparation still refuses writes.
    // Real Pilot execution is NOT implemented in Phase 5E.
    const gate = evaluatePhase5EPilotGate({
      PHASE5E_DRIVER_PILOT: "1",
      projectId: process.env.PILOT_PROJECT_ID,
      pilotDriverId: process.env.PILOT_DRIVER_ID,
      expectedBeforeState: process.env.PILOT_BEFORE_STATE,
      preconditionToken: process.env.PILOT_PRECONDITION_TOKEN,
      operatorIdentity: process.env.PILOT_OPERATOR_IDENTITY,
      actorRole: process.env.PILOT_ACTOR_ROLE || "super_admin",
    });
    // Even if gate requirements pass, Phase 5E must not mutate Production.
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    void gate;
    expect(true).toBe(true);
  });
});
