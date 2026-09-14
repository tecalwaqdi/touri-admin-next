/**
 * Phase 5D — Controlled Writes enablement model.
 * Keep implementation/validation distinct from activation.
 * Production writes remain disabled.
 */

export type ControlledWritesEnablementState = {
  /** 5A+5B+5C command pipelines exist offline. */
  controlledWritesImplemented: true;
  /** Fake/offline consolidation validation passed (Phase 5D). */
  controlledWritesValidatedOffline: true;
  /** Activation (Semantics B) — MUST stay false. */
  controlledWritesEnabled: false;
  /** Any Production write path — MUST stay false. */
  productionWritesEnabled: false;
};

/**
 * Hard-coded Phase 5D posture. Do not flip activation here.
 */
export const CONTROLLED_WRITES_ENABLEMENT: ControlledWritesEnablementState = {
  controlledWritesImplemented: true,
  controlledWritesValidatedOffline: true,
  controlledWritesEnabled: false,
  productionWritesEnabled: false,
};

export function assertEnablementNotActivated(): void {
  if (CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled !== false) {
    throw new Error("controlledWritesEnabled must remain false (Phase 5D)");
  }
  if (CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled !== false) {
    throw new Error("productionWritesEnabled must remain false (Phase 5D)");
  }
}
