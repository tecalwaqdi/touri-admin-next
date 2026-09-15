/**
 * Phase 4A-1..4A-7 + Phase 4B — multi-gate FAIL STARTUP when Production Read is enabled.
 * Any write flag true → FAIL STARTUP.
 * Live allowlist must be exactly one controlled 4A window OR the full Phase 4B set:
 * countries | cities | landmarks | trips | drivers | agents | customers
 * OR all seven for Phase 4B cross-resource shadow validation.
 */

import {
  isExactLiveShadowAllowlist,
  parseLiveShadowAllowedResources,
  PHASE_4A1_LIVE_RESOURCES,
  PHASE_4A2_LIVE_RESOURCES,
  PHASE_4A3_LIVE_RESOURCES,
  PHASE_4A4_LIVE_RESOURCES,
  PHASE_4A5_LIVE_RESOURCES,
  PHASE_4A6_LIVE_RESOURCES,
  PHASE_4A7_LIVE_RESOURCES,
  PHASE_4B_LIVE_RESOURCES,
  PHASE_PC10_FULL_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";

export class LiveShadowStartupError extends Error {
  readonly code = "LIVE_SHADOW_STARTUP_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "LiveShadowStartupError";
  }
}

export type LiveShadowStartupInput = {
  PRODUCTION_READ_ENABLED: boolean;
  PRODUCTION_READ_MODE: "disabled" | "shadow";
  AUTH_MODE: "mock" | "verified_token";
  EXPECTED_PROJECT_ID: string;
  PRODUCTION_WRITE_ENABLED: boolean;
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  /** Phase 4A-7 — optional for older startup fixtures; defaults false. */
  CUSTOMER_WRITE_ENABLED?: boolean;
  FULL_PII_SHADOW_ENABLED: boolean;
  LIVE_SHADOW_ALLOWED_RESOURCES: string;
  PRODUCTION_READ_OBSERVABILITY_SINK: "memory" | "structured_logger" | "file_ndjson";
};

/**
 * When PRODUCTION_READ_ENABLED=false → no-op (safe default).
 * When true → ALL gates must pass or throw.
 */
export function assertLiveShadowStartupOrThrow(
  env: LiveShadowStartupInput,
): void {
  if (!env.PRODUCTION_READ_ENABLED) {
    return;
  }

  if (env.PRODUCTION_READ_MODE !== "shadow") {
    throw new LiveShadowStartupError(
      "PRODUCTION_READ_MODE must be shadow when PRODUCTION_READ_ENABLED=true",
    );
  }
  if (env.AUTH_MODE !== "verified_token") {
    throw new LiveShadowStartupError(
      "AUTH_MODE must be verified_token when Production read is enabled",
    );
  }
  if (!env.EXPECTED_PROJECT_ID?.trim()) {
    throw new LiveShadowStartupError(
      "EXPECTED_PROJECT_ID must be set when Production read is enabled",
    );
  }

  const writeFlags: Array<[string, boolean]> = [
    ["PRODUCTION_WRITE_ENABLED", env.PRODUCTION_WRITE_ENABLED],
    ["GLOBAL_PRODUCTION_WRITE_ENABLED", env.GLOBAL_PRODUCTION_WRITE_ENABLED],
    ["FINANCE_WRITE_ENABLED", env.FINANCE_WRITE_ENABLED],
    ["DRIVER_WRITE_ENABLED", env.DRIVER_WRITE_ENABLED],
    ["AGENT_WRITE_ENABLED", env.AGENT_WRITE_ENABLED],
    ["CUSTOMER_WRITE_ENABLED", env.CUSTOMER_WRITE_ENABLED ?? false],
  ];
  for (const [name, enabled] of writeFlags) {
    if (enabled) {
      throw new LiveShadowStartupError(
        `${name}=true is forbidden — FAIL STARTUP while Production read enabled`,
      );
    }
  }

  if (env.FULL_PII_SHADOW_ENABLED) {
    throw new LiveShadowStartupError(
      "FULL_PII_SHADOW_ENABLED must be false during Phase 4A/4B live shadow",
    );
  }

  let allowed;
  try {
    allowed = parseLiveShadowAllowedResources(env.LIVE_SHADOW_ALLOWED_RESOURCES);
  } catch (err) {
    throw new LiveShadowStartupError(
      err instanceof Error ? err.message : String(err),
    );
  }
  const countriesOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A1_LIVE_RESOURCES,
  );
  const citiesOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A2_LIVE_RESOURCES,
  );
  const landmarksOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A3_LIVE_RESOURCES,
  );
  const tripsOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A4_LIVE_RESOURCES,
  );
  const driversOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A5_LIVE_RESOURCES,
  );
  const agentsOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A6_LIVE_RESOURCES,
  );
  const customersOnly = isExactLiveShadowAllowlist(
    allowed,
    PHASE_4A7_LIVE_RESOURCES,
  );
  const phase4bAll = isExactLiveShadowAllowlist(allowed, PHASE_4B_LIVE_RESOURCES);
  const pc10Full = isExactLiveShadowAllowlist(
    allowed,
    PHASE_PC10_FULL_LIVE_RESOURCES,
  );
  if (
    !countriesOnly &&
    !citiesOnly &&
    !landmarksOnly &&
    !tripsOnly &&
    !driversOnly &&
    !agentsOnly &&
    !customersOnly &&
    !phase4bAll &&
    !pc10Full
  ) {
    throw new LiveShadowStartupError(
      `LIVE_SHADOW_ALLOWED_RESOURCES must be exactly one Phase 4A resource (countries|cities|landmarks|trips|drivers|agents|customers), the full Phase 4B set (all seven), or PC-10 full (seven plus users,audit) (got: ${env.LIVE_SHADOW_ALLOWED_RESOURCES || "<empty>"})`,
    );
  }

  if (
    env.PRODUCTION_READ_OBSERVABILITY_SINK !== "structured_logger" &&
    env.PRODUCTION_READ_OBSERVABILITY_SINK !== "file_ndjson"
  ) {
    throw new LiveShadowStartupError(
      "PRODUCTION_READ_OBSERVABILITY_SINK must be structured_logger or file_ndjson when Production read is enabled (InMemory-only is insufficient for live)",
    );
  }
}
