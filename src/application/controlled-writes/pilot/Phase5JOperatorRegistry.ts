/**
 * Phase 5J — local operator registry under .local/phase5j-fixture/ (gitignored).
 * Stores logical name, uid, status, requestId, timestamps.
 * NO password / token / email / phone / SA material.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PHASE_5I_LOGICAL_FIXTURE_NAME } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import { PHASE_5J_IDEMPOTENCY_KEY } from "@/application/controlled-writes/pilot/ProvisionSyntheticDriverFixtureCommand";
import type { Phase5JFixtureStatus } from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";
import {
  isPhase5JPartialFailure,
  isPhase5JPilotReady,
  isPhase5JTerminalProvisioned,
} from "@/application/controlled-writes/pilot/Phase5JFixtureStateMachine";

export const PHASE_5J_REGISTRY_DIR_NAME = "phase5j-fixture" as const;
export const PHASE_5J_REGISTRY_FILE_NAME = "registry.json" as const;

export type Phase5JOperatorRegistryRecord = {
  readonly logicalFixtureName: typeof PHASE_5I_LOGICAL_FIXTURE_NAME;
  readonly idempotencyKey: typeof PHASE_5J_IDEMPOTENCY_KEY;
  readonly uid: string | null;
  readonly status: Phase5JFixtureStatus;
  readonly requestId: string | null;
  readonly createdAtUtc: string | null;
  readonly updatedAtUtc: string;
  readonly authDisabled: true;
  readonly passwordStored: false;
  readonly tokenStored: false;
  readonly emailStored: false;
  readonly phoneStored: false;
  readonly serviceAccountStored: false;
};

export function buildEmptyPhase5JRegistryRecord(
  nowIso = new Date().toISOString(),
): Phase5JOperatorRegistryRecord {
  return {
    logicalFixtureName: PHASE_5I_LOGICAL_FIXTURE_NAME,
    idempotencyKey: PHASE_5J_IDEMPOTENCY_KEY,
    uid: null,
    status: "planned",
    requestId: null,
    createdAtUtc: null,
    updatedAtUtc: nowIso,
    authDisabled: true,
    passwordStored: false,
    tokenStored: false,
    emailStored: false,
    phoneStored: false,
    serviceAccountStored: false,
  };
}

export function resolvePhase5JRegistryDir(cwd = process.cwd()): string {
  return join(cwd, ".local", PHASE_5J_REGISTRY_DIR_NAME);
}

export function resolvePhase5JRegistryPath(cwd = process.cwd()): string {
  return join(resolvePhase5JRegistryDir(cwd), PHASE_5J_REGISTRY_FILE_NAME);
}

export function loadPhase5JOperatorRegistry(
  cwd = process.cwd(),
): Phase5JOperatorRegistryRecord {
  const path = resolvePhase5JRegistryPath(cwd);
  if (!existsSync(path)) {
    return buildEmptyPhase5JRegistryRecord();
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<
      Phase5JOperatorRegistryRecord
    >;
    const base = buildEmptyPhase5JRegistryRecord();
    return {
      ...base,
      uid: typeof raw.uid === "string" ? raw.uid : null,
      status: (raw.status as Phase5JFixtureStatus) || "planned",
      requestId: typeof raw.requestId === "string" ? raw.requestId : null,
      createdAtUtc:
        typeof raw.createdAtUtc === "string" ? raw.createdAtUtc : null,
      updatedAtUtc:
        typeof raw.updatedAtUtc === "string"
          ? raw.updatedAtUtc
          : base.updatedAtUtc,
      passwordStored: false,
      tokenStored: false,
      emailStored: false,
      phoneStored: false,
      serviceAccountStored: false,
      authDisabled: true,
      logicalFixtureName: PHASE_5I_LOGICAL_FIXTURE_NAME,
      idempotencyKey: PHASE_5J_IDEMPOTENCY_KEY,
    };
  } catch {
    return buildEmptyPhase5JRegistryRecord();
  }
}

export function savePhase5JOperatorRegistry(
  record: Phase5JOperatorRegistryRecord,
  cwd = process.cwd(),
): void {
  const dir = resolvePhase5JRegistryDir(cwd);
  mkdirSync(dir, { recursive: true });
  const safe: Phase5JOperatorRegistryRecord = {
    ...record,
    passwordStored: false,
    tokenStored: false,
    emailStored: false,
    phoneStored: false,
    serviceAccountStored: false,
    authDisabled: true,
    logicalFixtureName: PHASE_5I_LOGICAL_FIXTURE_NAME,
    idempotencyKey: PHASE_5J_IDEMPOTENCY_KEY,
  };
  writeFileSync(
    resolvePhase5JRegistryPath(cwd),
    `${JSON.stringify(safe, null, 2)}\n`,
    "utf8",
  );
}

export type Phase5JIdempotencyDecision = {
  readonly allowAuthCreate: boolean;
  readonly code:
    | "IDEMPOTENT_PLANNED_OK"
    | "RESUME_FIRESTORE_ONLY"
    | "FIXTURE_ALREADY_EXISTS"
    | "FAILED_PARTIAL_NO_MULTI_CREATE"
    | "PILOT_READY_IDEMPOTENT";
  readonly message: string;
  readonly uid: string | null;
};

/**
 * Never multi Auth for same logical fixture.
 * Detect registry / partial / pilot_ready.
 */
export function evaluatePhase5JIdempotency(
  registry: Phase5JOperatorRegistryRecord,
): Phase5JIdempotencyDecision {
  if (registry.logicalFixtureName !== PHASE_5I_LOGICAL_FIXTURE_NAME) {
    return {
      allowAuthCreate: false,
      code: "FAILED_PARTIAL_NO_MULTI_CREATE",
      message: "logicalFixtureName mismatch",
      uid: registry.uid,
    };
  }

  if (isPhase5JPilotReady(registry.status) && registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "PILOT_READY_IDEMPOTENT",
      message: "pilot_ready — refuse second Auth create",
      uid: registry.uid,
    };
  }

  if (registry.status === "planned" && registry.uid == null) {
    return {
      allowAuthCreate: true,
      code: "IDEMPOTENT_PLANNED_OK",
      message: "No prior Auth — single create permitted when gates open",
      uid: null,
    };
  }

  if (registry.status === "auth_created" && registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "RESUME_FIRESTORE_ONLY",
      message: "Auth exists — do not multi-create; resume Firestore only",
      uid: registry.uid,
    };
  }

  if (isPhase5JTerminalProvisioned(registry.status) && registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "FIXTURE_ALREADY_EXISTS",
      message: "Fixture already provisioned — create-only refuse",
      uid: registry.uid,
    };
  }

  if (isPhase5JPartialFailure(registry.status) && registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "FAILED_PARTIAL_NO_MULTI_CREATE",
      message: "Partial failure — registry preserves UID; no second Auth create",
      uid: registry.uid,
    };
  }

  if (registry.uid != null) {
    return {
      allowAuthCreate: false,
      code: "FAILED_PARTIAL_NO_MULTI_CREATE",
      message: "UID present — no second Auth create",
      uid: registry.uid,
    };
  }

  return {
    allowAuthCreate: false,
    code: "FIXTURE_ALREADY_EXISTS",
    message: "Refuse multi-create",
    uid: registry.uid,
  };
}
