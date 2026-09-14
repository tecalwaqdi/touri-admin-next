/**
 * Phase 4 DESIGN — multi-gate Production Read + environment fingerprint.
 * Defaults remain DISABLED. Read and write flags are never coupled.
 */

import type { AppEnvConfig } from "@/config/env";
import type { ProductionReadMode } from "@/domain/production-read/constants";

export type EnvironmentFingerprint = {
  expectedProjectId: string;
  expectedEnvironment: "production" | "staging" | "development";
  actualProjectId?: string | null;
  actualEnvironment?: string | null;
};

export class EnvironmentFingerprintError extends Error {
  readonly code = "ENVIRONMENT_FINGERPRINT_MISMATCH";
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentFingerprintError";
  }
}

/**
 * Mismatch → FAIL STARTUP (design). Tests use fakes — no real project check.
 */
export function assertEnvironmentFingerprint(
  fingerprint: EnvironmentFingerprint,
): void {
  if (!fingerprint.expectedProjectId?.trim()) {
    throw new EnvironmentFingerprintError(
      "expectedProjectId required when Production read gates are evaluated",
    );
  }
  if (
    fingerprint.actualProjectId != null &&
    fingerprint.actualProjectId !== fingerprint.expectedProjectId
  ) {
    throw new EnvironmentFingerprintError(
      `Project id mismatch: expected=${fingerprint.expectedProjectId} actual=${fingerprint.actualProjectId}`,
    );
  }
  if (
    fingerprint.actualEnvironment != null &&
    fingerprint.actualEnvironment !== fingerprint.expectedEnvironment
  ) {
    throw new EnvironmentFingerprintError(
      `Environment mismatch: expected=${fingerprint.expectedEnvironment} actual=${fingerprint.actualEnvironment}`,
    );
  }
}

export type ProductionReadGateInput = {
  PRODUCTION_READ_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  FINANCE_WRITE_ENABLED: boolean;
  DRIVER_WRITE_ENABLED: boolean;
  AGENT_WRITE_ENABLED: boolean;
  APP_ENV: AppEnvConfig["APP_ENV"];
  AUTH_MODE: AppEnvConfig["AUTH_MODE"];
  PRODUCTION_READ_MODE: ProductionReadMode;
  expectedProjectId: string;
  actualProjectId?: string | null;
};

export type ProductionReadGateResult =
  | { allow: true; mode: "shadow" }
  | { allow: false; reason: string; code: string };

/**
 * Multi-gate: ALL must pass or DENY.
 * Never couples read enablement to write flags — write must stay false.
 */
export function evaluateProductionReadGate(
  input: ProductionReadGateInput,
): ProductionReadGateResult {
  if (!input.PRODUCTION_READ_ENABLED) {
    return {
      allow: false,
      reason: "PRODUCTION_READ_ENABLED=false",
      code: "KILL_SWITCH",
    };
  }
  if (input.PRODUCTION_READ_MODE !== "shadow") {
    return {
      allow: false,
      reason: `PRODUCTION_READ_MODE=${input.PRODUCTION_READ_MODE}`,
      code: "READ_MODE_DISABLED",
    };
  }
  if (input.APP_ENV !== "production") {
    return {
      allow: false,
      reason: "APP_ENV must be production for Production read",
      code: "APP_ENV_DENIED",
    };
  }
  if (input.AUTH_MODE !== "verified_token") {
    return {
      allow: false,
      reason: "AUTH_MODE must be verified_token",
      code: "AUTH_MODE_DENIED",
    };
  }
  if (
    !input.expectedProjectId ||
    (input.actualProjectId != null &&
      input.actualProjectId !== input.expectedProjectId)
  ) {
    return {
      allow: false,
      reason: "EXPECTED_PROJECT_ID mismatch or missing",
      code: "PROJECT_FINGERPRINT_MISMATCH",
    };
  }
  // Write must remain impossible on the Production read path.
  if (input.PRODUCTION_WRITE_ENABLED) {
    return {
      allow: false,
      reason: "PRODUCTION_WRITE_ENABLED must be false during shadow read",
      code: "WRITE_FLAG_DENY",
    };
  }
  if (input.GLOBAL_PRODUCTION_WRITE_ENABLED) {
    return {
      allow: false,
      reason: "GLOBAL_PRODUCTION_WRITE_ENABLED must be false during shadow read",
      code: "WRITE_FLAG_DENY",
    };
  }
  if (
    input.FINANCE_WRITE_ENABLED ||
    input.DRIVER_WRITE_ENABLED ||
    input.AGENT_WRITE_ENABLED
  ) {
    return {
      allow: false,
      reason: "Domain write flags must be false during shadow read",
      code: "WRITE_FLAG_DENY",
    };
  }
  return { allow: true, mode: "shadow" };
}

export class ProductionReadDisabledError extends Error {
  readonly code = "PRODUCTION_READ_DISABLED";
  constructor(message = "Production read kill switch is off") {
    super(message);
    this.name = "ProductionReadDisabledError";
  }
}

/**
 * Kill switch: every Production repo call must check this first.
 */
export function assertProductionReadEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new ProductionReadDisabledError();
  }
}
