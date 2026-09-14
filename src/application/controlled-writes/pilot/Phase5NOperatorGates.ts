/**
 * Phase 5N — operator gates for narrow metadata-only reconciliation apply.
 * DRIVER_WRITE_ENABLED must stay false (no domain writes).
 * Metadata writes use GLOBAL + PRODUCTION write flags only.
 */

import {
  isPhase5NMetadataReconcileApplyEnabled,
  PHASE_5N_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import { isEnvWriteFlagTrue } from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";

export type Phase5NOperatorGateEnv = {
  readonly PHASE5N_METADATA_RECONCILE_APPLY?: string;
  readonly GLOBAL_PRODUCTION_WRITE_ENABLED?: string;
  readonly PRODUCTION_WRITE_ENABLED?: string;
  readonly DRIVER_WRITE_ENABLED?: string;
  readonly AGENT_WRITE_ENABLED?: string;
  readonly CUSTOMER_WRITE_ENABLED?: string;
  readonly CUSTOMER_AUTH_WRITE_ENABLED?: string;
  readonly FINANCE_WRITE_ENABLED?: string;
  readonly SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED?: string;
  readonly PHASE5M_DRIVER_PILOT_APPLY?: string;
  readonly EXPECTED_PROJECT_ID?: string;
  readonly GOOGLE_CLOUD_PROJECT?: string;
};

export type Phase5NGateDenialCode =
  | "METADATA_RECONCILE_APPLY_DISABLED"
  | "UNSAFE_WRITE_CONFIGURATION"
  | "PROJECT_ID_MISMATCH";

export type Phase5NGateEvaluation =
  | {
      readonly ok: true;
      readonly metadataReconcileApplyEnabled: true;
      readonly projectId: typeof PHASE_5N_EXPECTED_PROJECT_ID;
      readonly required: {
        readonly PHASE5N_METADATA_RECONCILE_APPLY: true;
        readonly GLOBAL_PRODUCTION_WRITE_ENABLED: true;
        readonly PRODUCTION_WRITE_ENABLED: true;
        readonly DRIVER_WRITE_ENABLED: false;
        readonly EXPECTED_PROJECT_ID: typeof PHASE_5N_EXPECTED_PROJECT_ID;
        readonly GOOGLE_CLOUD_PROJECT: typeof PHASE_5N_EXPECTED_PROJECT_ID;
      };
      readonly forbiddenFalse: {
        readonly DRIVER_WRITE_ENABLED: false;
        readonly AGENT_WRITE_ENABLED: false;
        readonly CUSTOMER_WRITE_ENABLED: false;
        readonly CUSTOMER_AUTH_WRITE_ENABLED: false;
        readonly FINANCE_WRITE_ENABLED: false;
        readonly SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: false;
        readonly PHASE5M_DRIVER_PILOT_APPLY: false;
      };
    }
  | {
      readonly ok: false;
      readonly code: Phase5NGateDenialCode;
      readonly message: string;
      readonly missingRequired: readonly string[];
      readonly unsafeTrue: readonly string[];
    };

function readEnv(
  input: Phase5NOperatorGateEnv | undefined,
  key: keyof Phase5NOperatorGateEnv,
): string | undefined {
  if (input && key in input && input[key] !== undefined) {
    return input[key];
  }
  return process.env[key];
}

/**
 * Evaluate ALL required operator gates for Phase 5N metadata reconcile apply.
 */
export function evaluatePhase5NOperatorGates(
  input?: Phase5NOperatorGateEnv,
): Phase5NGateEvaluation {
  const applyArm = readEnv(input, "PHASE5N_METADATA_RECONCILE_APPLY");
  const globalWrite = readEnv(input, "GLOBAL_PRODUCTION_WRITE_ENABLED");
  const productionWrite = readEnv(input, "PRODUCTION_WRITE_ENABLED");
  const driverWrite = readEnv(input, "DRIVER_WRITE_ENABLED");
  const agentWrite = readEnv(input, "AGENT_WRITE_ENABLED");
  const customerWrite = readEnv(input, "CUSTOMER_WRITE_ENABLED");
  const customerAuthWrite = readEnv(input, "CUSTOMER_AUTH_WRITE_ENABLED");
  const financeWrite = readEnv(input, "FINANCE_WRITE_ENABLED");
  const syntheticAuth = readEnv(input, "SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED");
  const phase5mApply = readEnv(input, "PHASE5M_DRIVER_PILOT_APPLY");
  const projectId = (readEnv(input, "EXPECTED_PROJECT_ID") ?? "").trim();
  const gcpProject = (readEnv(input, "GOOGLE_CLOUD_PROJECT") ?? "").trim();

  const missingRequired: string[] = [];
  if (!isPhase5NMetadataReconcileApplyEnabled(applyArm)) {
    missingRequired.push("PHASE5N_METADATA_RECONCILE_APPLY");
  }
  if (!isEnvWriteFlagTrue(globalWrite)) {
    missingRequired.push("GLOBAL_PRODUCTION_WRITE_ENABLED");
  }
  if (!isEnvWriteFlagTrue(productionWrite)) {
    missingRequired.push("PRODUCTION_WRITE_ENABLED");
  }
  if (!projectId) missingRequired.push("EXPECTED_PROJECT_ID");
  if (!gcpProject) missingRequired.push("GOOGLE_CLOUD_PROJECT");

  const unsafeTrue: string[] = [];
  // Domain / Phase 5M re-Apply / other surfaces must stay false.
  if (isEnvWriteFlagTrue(driverWrite)) unsafeTrue.push("DRIVER_WRITE_ENABLED");
  if (isEnvWriteFlagTrue(agentWrite)) unsafeTrue.push("AGENT_WRITE_ENABLED");
  if (isEnvWriteFlagTrue(customerWrite))
    unsafeTrue.push("CUSTOMER_WRITE_ENABLED");
  if (isEnvWriteFlagTrue(customerAuthWrite)) {
    unsafeTrue.push("CUSTOMER_AUTH_WRITE_ENABLED");
  }
  if (isEnvWriteFlagTrue(financeWrite)) unsafeTrue.push("FINANCE_WRITE_ENABLED");
  if (isEnvWriteFlagTrue(syntheticAuth)) {
    unsafeTrue.push("SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED");
  }
  if (phase5mApply === "1") {
    unsafeTrue.push("PHASE5M_DRIVER_PILOT_APPLY");
  }

  if (unsafeTrue.length > 0) {
    return {
      ok: false,
      code: "UNSAFE_WRITE_CONFIGURATION",
      message: `Forbidden write surfaces enabled: ${unsafeTrue.join(",")}`,
      missingRequired,
      unsafeTrue,
    };
  }

  if (missingRequired.length > 0) {
    return {
      ok: false,
      code: "METADATA_RECONCILE_APPLY_DISABLED",
      message: `Required operator gates missing/false: ${missingRequired.join(",")}`,
      missingRequired,
      unsafeTrue,
    };
  }

  if (
    projectId !== PHASE_5N_EXPECTED_PROJECT_ID ||
    gcpProject !== PHASE_5N_EXPECTED_PROJECT_ID
  ) {
    return {
      ok: false,
      code: "PROJECT_ID_MISMATCH",
      message: `EXPECTED_PROJECT_ID and GOOGLE_CLOUD_PROJECT must both be ${PHASE_5N_EXPECTED_PROJECT_ID}`,
      missingRequired: [],
      unsafeTrue: [],
    };
  }

  return {
    ok: true,
    metadataReconcileApplyEnabled: true,
    projectId: PHASE_5N_EXPECTED_PROJECT_ID,
    required: {
      PHASE5N_METADATA_RECONCILE_APPLY: true,
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: true,
      DRIVER_WRITE_ENABLED: false,
      EXPECTED_PROJECT_ID: PHASE_5N_EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: PHASE_5N_EXPECTED_PROJECT_ID,
    },
    forbiddenFalse: {
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
      CUSTOMER_WRITE_ENABLED: false,
      CUSTOMER_AUTH_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: false,
      PHASE5M_DRIVER_PILOT_APPLY: false,
    },
  };
}
