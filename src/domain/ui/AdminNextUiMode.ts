/**
 * Phase 4A-0 — UI mode abstraction.
 * production_shadow is never active unless Production read is explicitly enabled
 * AND mode=shadow. Default remains development_synthetic.
 */

export type AdminNextUiMode = "development_synthetic" | "production_shadow";

export function resolveAdminNextUiMode(input: {
  PRODUCTION_READ_ENABLED: boolean;
  PRODUCTION_READ_MODE: "disabled" | "shadow";
  APP_ENV: string;
}): AdminNextUiMode {
  if (
    input.PRODUCTION_READ_ENABLED === true &&
    input.PRODUCTION_READ_MODE === "shadow"
  ) {
    return "production_shadow";
  }
  return "development_synthetic";
}

export function isShadowUiActive(mode: AdminNextUiMode): boolean {
  return mode === "production_shadow";
}
