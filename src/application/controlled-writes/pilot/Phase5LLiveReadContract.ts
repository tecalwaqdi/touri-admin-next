/**
 * Phase 5L — minimal Production live-read contract.
 *
 * Traced call chain (harness → ADC ports → dry-run planner):
 * - createPhase5KReadOnlyFirebasePorts: Auth getUser(uid) + Firestore user/{uid}
 * - Phase5LDriverPilotDryRun: same two reads only; no shadow list repos
 * - ProductionDriverWriteRepository: isReachable check only (no apply / no read)
 * - Active-trip guard: on_trip field on user doc (verifyPhase5KFinanceAndTrip) —
 *   NOT the trips/order collection
 * - Scope/precondition: in-memory snapshot + PHASE_5I_FIXTURE_COUNTRY_ID constant —
 *   no countries/cities collection reads
 *
 * Therefore LIVE_SHADOW_ALLOWED_RESOURCES must be exactly `drivers` (Phase 4A-5).
 * Do NOT expand to Phase 4B all-seven merely to pass loadEnv validation.
 * Global Phase 4A/4B startup validation is unchanged.
 */

import {
  isExactLiveShadowAllowlist,
  parseLiveShadowAllowedResources,
  PHASE_4A5_LIVE_RESOURCES,
  type LiveShadowResource,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { PHASE_5I_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";

/** Exact minimal Phase 5L Production shadow resources (canonical tokens). */
export const PHASE_5L_LIVE_READ_RESOURCES = PHASE_4A5_LIVE_RESOURCES;

export const PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES =
  PHASE_5L_LIVE_READ_RESOURCES.join(",") as "drivers";

export const PHASE_5L_EXPECTED_PROJECT_ID = PHASE_5I_EXPECTED_PROJECT_ID;

export const PHASE_5L_LIVE_READ_CONTRACT = {
  resources: PHASE_5L_LIVE_READ_RESOURCES,
  allowedResourcesCsv: PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
  projectId: PHASE_5L_EXPECTED_PROJECT_ID,
  environment: "production" as const,
  /** Explicit non-reads for operator/report clarity. */
  notRead: [
    "trips",
    "countries",
    "cities",
    "agents",
    "customers",
    "landmarks",
  ] as const satisfies readonly LiveShadowResource[],
} as const;

export class Phase5LLiveReadContractError extends Error {
  readonly code = "PHASE5L_LIVE_READ_CONTRACT_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "Phase5LLiveReadContractError";
  }
}

/**
 * Fail-closed: Phase 5L live read allowlist must be exactly the minimal contract.
 * Empty / partial multi-resource / unrelated single resource → deny.
 */
export function assertPhase5LLiveReadContract(
  liveShadowAllowedResources: string | null | undefined,
): void {
  let allowed: Set<LiveShadowResource>;
  try {
    allowed = parseLiveShadowAllowedResources(liveShadowAllowedResources);
  } catch (err) {
    throw new Phase5LLiveReadContractError(
      err instanceof Error ? err.message : String(err),
    );
  }

  if (allowed.size === 0) {
    throw new Phase5LLiveReadContractError(
      "Phase 5L LIVE_SHADOW_ALLOWED_RESOURCES missing — fail closed (expected drivers)",
    );
  }

  if (!isExactLiveShadowAllowlist(allowed, PHASE_5L_LIVE_READ_RESOURCES)) {
    throw new Phase5LLiveReadContractError(
      `Phase 5L LIVE_SHADOW_ALLOWED_RESOURCES must be exactly "${PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES}" (got: ${
        liveShadowAllowedResources?.trim() || "<empty>"
      })`,
    );
  }
}

/**
 * Fail-closed project fingerprint for Phase 5L live dry-run.
 * Wrong EXPECTED_PROJECT_ID / GOOGLE_CLOUD_PROJECT → deny (before Auth/Firestore).
 */
export function assertPhase5LLiveProjectFingerprint(input: {
  EXPECTED_PROJECT_ID?: string | null;
  GOOGLE_CLOUD_PROJECT?: string | null;
}): void {
  const expected = PHASE_5L_EXPECTED_PROJECT_ID;
  const project = (input.EXPECTED_PROJECT_ID ?? "").trim();
  const gcloud = (input.GOOGLE_CLOUD_PROJECT ?? "").trim();
  if (project !== expected) {
    throw new Phase5LLiveReadContractError(
      `Phase 5L EXPECTED_PROJECT_ID must be ${expected} (got: ${project || "<empty>"})`,
    );
  }
  if (gcloud !== expected) {
    throw new Phase5LLiveReadContractError(
      `Phase 5L GOOGLE_CLOUD_PROJECT must be ${expected} (got: ${gcloud || "<empty>"})`,
    );
  }
}

export function isPhase5LLiveReadContractSatisfied(
  liveShadowAllowedResources: string | null | undefined,
): boolean {
  try {
    assertPhase5LLiveReadContract(liveShadowAllowedResources);
    return true;
  } catch {
    return false;
  }
}
