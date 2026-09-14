/**
 * Phase 5M — live Production WRITE environment contract.
 *
 * Resource scope reuses Phase 5L minimum (`drivers` only). Global env safety
 * forbids PRODUCTION_READ_MODE=shadow while any write flag is true, so the
 * write harness uses PRODUCTION_READ_ENABLED=false / PRODUCTION_READ_MODE=disabled
 * for loadEnv, while asserting LIVE_SHADOW_ALLOWED_RESOURCES=drivers as the
 * Phase 5M resource-scope fingerprint (not LiveShadowStartupGuard).
 */

import {
  isExactLiveShadowAllowlist,
  parseLiveShadowAllowedResources,
  PHASE_4A5_LIVE_RESOURCES,
  type LiveShadowResource,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { PHASE_5M_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import { PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES } from "@/application/controlled-writes/pilot/Phase5LLiveReadContract";

export const PHASE_5M_LIVE_WRITE_RESOURCES = PHASE_4A5_LIVE_RESOURCES;

export const PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES =
  PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES;

export const PHASE_5M_LIVE_WRITE_CONTRACT = {
  resources: PHASE_5M_LIVE_WRITE_RESOURCES,
  allowedResourcesCsv: PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
  projectId: PHASE_5M_EXPECTED_PROJECT_ID,
  environment: "production" as const,
  /** Write path cannot enable Production read/shadow (global env safety). */
  productionReadEnabled: false,
  productionReadMode: "disabled" as const,
  notTouched: [
    "trips",
    "countries",
    "cities",
    "agents",
    "customers",
    "landmarks",
  ] as const satisfies readonly LiveShadowResource[],
} as const;

export class Phase5MLiveWriteContractError extends Error {
  readonly code = "PHASE5M_LIVE_WRITE_CONTRACT_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "Phase5MLiveWriteContractError";
  }
}

/**
 * Fail-closed: Phase 5M resource scope must be exactly `drivers`.
 * Empty / Phase 4B all-seven / unrelated → deny.
 */
export function assertPhase5MLiveShadowResources(
  liveShadowAllowedResources: string | null | undefined,
): void {
  let allowed: Set<LiveShadowResource>;
  try {
    allowed = parseLiveShadowAllowedResources(liveShadowAllowedResources);
  } catch (err) {
    throw new Phase5MLiveWriteContractError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (allowed.size === 0) {
    throw new Phase5MLiveWriteContractError(
      "Phase 5M LIVE_SHADOW_ALLOWED_RESOURCES missing — fail closed (expected drivers)",
    );
  }

  if (!isExactLiveShadowAllowlist(allowed, PHASE_5M_LIVE_WRITE_RESOURCES)) {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M LIVE_SHADOW_ALLOWED_RESOURCES must be exactly "${PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES}" (got: ${
        liveShadowAllowedResources?.trim() || "<empty>"
      })`,
    );
  }
}

export function assertPhase5MLiveProjectFingerprint(input: {
  EXPECTED_PROJECT_ID?: string | null;
  GOOGLE_CLOUD_PROJECT?: string | null;
}): void {
  const expected = PHASE_5M_EXPECTED_PROJECT_ID;
  const project = (input.EXPECTED_PROJECT_ID ?? "").trim();
  const gcloud = (input.GOOGLE_CLOUD_PROJECT ?? "").trim();
  if (project !== expected) {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M EXPECTED_PROJECT_ID must be ${expected} (got: ${project || "<empty>"})`,
    );
  }
  if (gcloud !== expected) {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M GOOGLE_CLOUD_PROJECT must be ${expected} (got: ${gcloud || "<empty>"})`,
    );
  }
}

/**
 * Production identity required before loadEnv() with write flags true.
 * Vitest beforeEach resets APP_ENV/EXPECTED_ENVIRONMENT to development —
 * that is the first-apply failure mode.
 */
export function assertPhase5MLiveProductionIdentity(input: {
  NODE_ENV?: string | null;
  APP_ENV?: string | null;
  EXPECTED_ENVIRONMENT?: string | null;
}): void {
  const nodeEnv = (input.NODE_ENV ?? "").trim();
  const appEnv = (input.APP_ENV ?? "").trim();
  const expectedEnv = (input.EXPECTED_ENVIRONMENT ?? "").trim();
  if (appEnv !== "production") {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M APP_ENV must be production (got: ${appEnv || "<empty>"})`,
    );
  }
  if (expectedEnv !== "production") {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M EXPECTED_ENVIRONMENT must be production (got: ${expectedEnv || "<empty>"})`,
    );
  }
  // loadEnv treats NODE_ENV=development as non-prod even when APP_ENV=production.
  if (nodeEnv !== "production") {
    throw new Phase5MLiveWriteContractError(
      `Phase 5M NODE_ENV must be production (got: ${nodeEnv || "<empty>"})`,
    );
  }
}
