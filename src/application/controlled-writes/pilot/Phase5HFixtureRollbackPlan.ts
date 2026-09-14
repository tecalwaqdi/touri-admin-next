/**
 * Phase 5H — rollback / retention strategy for dedicated synthetic fixture.
 * A: retain marked synthetic. B: future controlled deletion (NOT implemented).
 * No destructive delete in Phase 5H.
 */

import { PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID } from "@/application/controlled-writes/pilot/Phase5HAuthAndTriggerAnalysis";

export type Phase5HFixtureRollbackPlan = {
  readonly strategyA_retain: {
    readonly enabled: true;
    readonly documentId: typeof PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID;
    readonly retainMarkedSynthetic: true;
    readonly notes: string;
  };
  readonly strategyB_futureControlledDeletion: {
    readonly enabled: false;
    readonly implemented: false;
    readonly destructiveDeleteNow: false;
    readonly notes: string;
  };
  readonly pilotRollbackSeparate: true;
};

export function buildPhase5HFixtureRollbackPlan(): Phase5HFixtureRollbackPlan {
  return {
    strategyA_retain: {
      enabled: true,
      documentId: PHASE_5H_DEDICATED_SYNTHETIC_DRIVER_ID,
      retainMarkedSynthetic: true,
      notes:
        "Default: keep dedicated synthetic fixture after create (when unblocked). " +
        "Markers is_test / functional_test / qa_fixture + test_ id prefix.",
    },
    strategyB_futureControlledDeletion: {
      enabled: false,
      implemented: false,
      destructiveDeleteNow: false,
      notes:
        "Future operator-controlled deletion only under separate approval. " +
        "Do NOT implement destructive delete in Phase 5H. " +
        "Must account for syncUserClaimsOnWrite on delete (after.exists=false → no-op).",
    },
    pilotRollbackSeparate: true,
  };
}
