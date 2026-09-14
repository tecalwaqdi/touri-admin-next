/**
 * Phase 5L — Auth side-effect expectation for needs_changes dry-run.
 * Does NOT call setCustomUserClaims. Plan/classification only.
 *
 * Evidence: Production syncUserClaimsOnWrite on ANY user/{uid} update where
 * after.exists ALWAYS calls admin.auth().setCustomUserClaims. registration_status
 * is NOT a claim input → semantic claims stay { country_id }.
 */

import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import { PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS } from "@/application/controlled-writes/pilot/Phase5HExistingApprovedDriverAuthImpact";

export type Phase5LAuthTriggerExpectation = {
  readonly expectedAuthTrigger: true;
  readonly expectedClaimsChange: false;
  readonly expectedClaimsRemain: typeof PHASE_5I_EXPECTED_CUSTOM_CLAIMS;
  readonly elevatedClaimsExpected: false;
  readonly setCustomUserClaimsPlannedInDryRun: false;
  readonly triggerExportName: "syncUserClaimsOnWrite";
  readonly authClaimWritesIfApplied: 1;
  readonly justification: string;
};

/**
 * Classify Auth trigger for pending_review → needs_changes on the Auth-safe fixture.
 */
export function classifyPhase5LAuthTriggerExpectation(): Phase5LAuthTriggerExpectation {
  const sync = PHASE_5H_APPROVED_UPDATE_TRIGGER_ANALYSIS.find(
    (r) => r.exportName === "syncUserClaimsOnWrite" && r.firesOnUserDocUpdate,
  );

  return {
    expectedAuthTrigger: true,
    expectedClaimsChange: false,
    expectedClaimsRemain: PHASE_5I_EXPECTED_CUSTOM_CLAIMS,
    elevatedClaimsExpected: false,
    setCustomUserClaimsPlannedInDryRun: false,
    triggerExportName: "syncUserClaimsOnWrite",
    authClaimWritesIfApplied: 1,
    justification:
      sync?.effect ??
      "syncUserClaimsOnWrite always setCustomUserClaims on user/{uid} update; " +
        "claims payload ignores registration_status so country_id-only remains.",
  };
}
