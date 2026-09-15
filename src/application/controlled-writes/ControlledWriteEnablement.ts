/**
 * PC-9 — Controlled Writes enablement model.
 * Offline/Fake pipelines are product-ready; Production activation stays false.
 */

export type ControlledWritesEnablementState = {
  /** 5A+5B+5C command pipelines exist. */
  controlledWritesImplemented: true;
  /** Fake/offline consolidation validation passed (Phase 5D). */
  controlledWritesValidatedOffline: true;
  /**
   * PC-9: local/synthetic bridged Fake path is ready when
   * APP_ENV=development && PRODUCTION_READ_MODE=disabled (API traps).
   */
  localOfflineWritesReady: true;
  /** UI chrome gated by NEXT_PUBLIC_CONTROLLED_WRITES_UI / APP_ENV. */
  controlledWritesUiChromeGated: true;
  /** Production activation (Semantics B) — MUST stay false. */
  controlledWritesEnabled: false;
  /** Any Production write path — MUST stay false. */
  productionWritesEnabled: false;
};

/**
 * Hard-coded PC-9 posture. Do not flip Production activation here.
 */
export const CONTROLLED_WRITES_ENABLEMENT: ControlledWritesEnablementState = {
  controlledWritesImplemented: true,
  controlledWritesValidatedOffline: true,
  localOfflineWritesReady: true,
  controlledWritesUiChromeGated: true,
  controlledWritesEnabled: false,
  productionWritesEnabled: false,
};

export function assertEnablementNotActivated(): void {
  if (CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled !== false) {
    throw new Error("controlledWritesEnabled must remain false (PC-9)");
  }
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    throw new Error("productionWritesEnabled must remain false (PC-9)");
  }
}
