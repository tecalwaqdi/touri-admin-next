/**
 * Phase 5F — operator-controlled dry-run / discovery env helpers.
 * Default SKIP. Never auto-enable in CI / agents.
 */

/** Exact `"1"` only. Accepts Phase 5E or 5F dry-run flag names. */
export function isPhase5FDriverPilotDryRunEnabled(env: {
  PHASE5F_DRIVER_PILOT_DRY_RUN?: string | undefined;
  PHASE5E_DRIVER_PILOT_DRY_RUN?: string | undefined;
}): boolean {
  return (
    env.PHASE5F_DRIVER_PILOT_DRY_RUN === "1" ||
    env.PHASE5E_DRIVER_PILOT_DRY_RUN === "1"
  );
}

/**
 * Live Production discovery via approved Drivers shadow read.
 * Exact `"1"` only. Independent of dry-run plan (still write-free).
 */
export function isPhase5FLiveDiscoveryEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
