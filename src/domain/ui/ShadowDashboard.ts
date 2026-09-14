/**
 * Phase 4A-0 — Shadow dashboard contracts (no Production data).
 */

export type ShadowDashboardCounts = {
  tripCount: number;
  completedTripCount: number;
  cancelledTripCount: number;
  driverCount: number;
  agentCount: number;
  mappingWarningCount: number;
};

export type ShadowDashboardContract = {
  sourceEnvironment: "production";
  sourceSystem: "legacy";
  readMode: "shadow";
  counts: ShadowDashboardCounts;
  mappingWarnings: Array<{ code: string; message: string }>;
  /** Explicit: no Production data in 4A-0 */
  productionDataAttached: false;
};

export function emptyShadowDashboard(): ShadowDashboardContract {
  return {
    sourceEnvironment: "production",
    sourceSystem: "legacy",
    readMode: "shadow",
    counts: {
      tripCount: 0,
      completedTripCount: 0,
      cancelledTripCount: 0,
      driverCount: 0,
      agentCount: 0,
      mappingWarningCount: 0,
    },
    mappingWarnings: [],
    productionDataAttached: false,
  };
}
