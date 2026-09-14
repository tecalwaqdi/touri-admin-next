/**
 * Phase 5H — fixture create dry-run (plan only). Writes = 0.
 * Separate from Pilot dry-run flags. No Production mutation.
 */

import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import {
  AUTH_REQUIRED_FOR_FIXTURE,
  FIXTURE_CREATION_NO_GO,
  PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
  PHASE_5H_EXPECTED_PROJECT_ID,
  assessAuthDependencyForFixture,
} from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";
import {
  PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION,
  PHASE_5H_FIXTURE_CREATE_ALLOWLIST,
  assertCreateAllowlistTyped,
  type Phase5HExpectedWriteCounts,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateAllowlist";
import {
  PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
  evaluatePhase5HFixtureCreateGate,
} from "@/application/controlled-writes/pilot/Phase5HFixtureCreateSemantics";
import {
  assertPhase5HFixturePilotCompatibility,
  resolvePhase5HFixtureGeography,
  PHASE_5H_PII_POLICY,
  PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureSchema";
import {
  createSyntheticDriverFixtureRepository,
  SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW,
} from "@/application/controlled-writes/pilot/Phase5HSyntheticDriverFixtureRepository";
import { buildPhase5HFixtureRollbackPlan } from "@/application/controlled-writes/pilot/Phase5HFixtureRollbackPlan";

export type Phase5HFixtureDryRunResult = {
  readonly mode: "dry_run";
  readonly wouldWrite: boolean;
  readonly actualWrite: false;
  readonly writeFlagsRemainFalse: true;
  readonly AUTH_REQUIRED_FOR_FIXTURE: typeof AUTH_REQUIRED_FOR_FIXTURE;
  readonly FIXTURE_CREATION_NO_GO: typeof FIXTURE_CREATION_NO_GO;
  readonly documentId: typeof PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
  readonly idempotencyKey: typeof PHASE_5H_FIXTURE_IDEMPOTENCY_KEY;
  readonly geography: ReturnType<typeof resolvePhase5HFixtureGeography>;
  readonly pilotCompatibility: ReturnType<
    typeof assertPhase5HFixturePilotCompatibility
  >;
  readonly allowlistOk: boolean;
  readonly repoKind: typeof SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.kind;
  readonly createBlockedCode: string;
  readonly writeCounts: Phase5HExpectedWriteCounts;
  readonly productionWrites: 0;
  readonly authWrites: 0;
  readonly financeWrites: 0;
  readonly tripWrites: 0;
  readonly piiPolicy: typeof PHASE_5H_PII_POLICY;
  readonly rollback: ReturnType<typeof buildPhase5HFixtureRollbackPlan>;
  readonly authAssessment: ReturnType<typeof assessAuthDependencyForFixture>;
};

export function runPhase5HFixtureCreateDryRun(input?: {
  projectId?: string;
  documentAlreadyExists?: boolean;
}): Phase5HFixtureDryRunResult {
  const projectId =
    input?.projectId?.trim() || PHASE_5H_EXPECTED_PROJECT_ID;
  const writeFlagsAllFalse =
    CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled === false &&
    CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled === false;

  const gate = evaluatePhase5HFixtureCreateGate({
    PHASE5H_CREATE_SYNTHETIC_DRIVER_FIXTURE: "1",
    projectId,
    documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
    idempotencyKey: PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
    documentAlreadyExists: input?.documentAlreadyExists ?? false,
    expectedProjectId: PHASE_5H_EXPECTED_PROJECT_ID,
    writeFlagsAllFalse,
  });

  const repo = createSyntheticDriverFixtureRepository();
  const plan = repo.planCreate();
  const createResult = repo.create(plan);

  const geography = resolvePhase5HFixtureGeography();
  const pilotCompatibility = assertPhase5HFixturePilotCompatibility();
  void PHASE_5H_SYNTHETIC_DRIVER_FIXTURE_DOC;
  void PHASE_5H_FIXTURE_CREATE_ALLOWLIST;

  // Create is blocked while FIXTURE_CREATION_NO_GO / Auth required.
  // wouldWrite stays false — plan is structurally valid but not executable.
  const wouldWrite = false;

  return {
    mode: "dry_run",
    wouldWrite,
    actualWrite: false,
    writeFlagsRemainFalse: true,
    AUTH_REQUIRED_FOR_FIXTURE,
    FIXTURE_CREATION_NO_GO,
    documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
    idempotencyKey: PHASE_5H_FIXTURE_IDEMPOTENCY_KEY,
    geography,
    pilotCompatibility,
    allowlistOk: assertCreateAllowlistTyped(),
    repoKind: SYNTHETIC_DRIVER_FIXTURE_REPO_REVIEW.kind,
    createBlockedCode: !gate.ok ? gate.code : createResult.code,
    writeCounts: PHASE_5H_EXPECTED_WRITE_COUNTS_PREPARATION,
    productionWrites: 0,
    authWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    piiPolicy: PHASE_5H_PII_POLICY,
    rollback: buildPhase5HFixtureRollbackPlan(),
    authAssessment: assessAuthDependencyForFixture(),
  };
}
