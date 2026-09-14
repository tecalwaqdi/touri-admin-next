/**
 * Phase 5J — operator-controlled provision harness flow (testable offline).
 *
 * Order (§6):
 * 1–3 gates / project / forbidden surfaces
 * 4 IAM preflight (check-only)
 * 5–13 provision runner (exactly one bounded attempt when IAM passes)
 *
 * IAM failure → provisionAttempted=false, writes=0.
 */

import {
  evaluatePhase5JOperatorGates,
  type Phase5JOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5JOperatorGates";
import {
  runPhase5JIamPreflight,
  type Phase5JIamPermissionTester,
  type Phase5JIamPreflightResult,
} from "@/application/controlled-writes/pilot/Phase5JIamPreflight";
import {
  emptyPhase5JHarnessSafeSummary,
  summarizePhase5JProvisionResult,
  type Phase5JHarnessSafeSummary,
} from "@/application/controlled-writes/pilot/Phase5JHarnessSafeSummary";
import type { Phase5IProvisionResult } from "@/application/controlled-writes/pilot/SyntheticDriverProvisioningService";
import type { ProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

export type Phase5JProvisionHarnessFlowInput = {
  readonly harnessArmed: boolean;
  readonly gates?: Phase5JOperatorGateEnv;
  readonly permissionTester?: Phase5JIamPermissionTester;
  readonly credentialProvider?: ProductionCredentialProvider;
  /**
   * Invoked at most once, and only after gates OK + IAM_PREFLIGHT_PASS.
   * Live harness injects Firebase ports; unit tests inject fake provision.
   */
  readonly runProvision?: () => Promise<Phase5IProvisionResult>;
  readonly claimVerificationReadCount?: number;
};

export type Phase5JProvisionHarnessFlowResult = {
  readonly summary: Phase5JHarnessSafeSummary;
  readonly iam: Phase5JIamPreflightResult | null;
  readonly provisionResult: Phase5IProvisionResult | null;
};

/**
 * Execute the armed/unarmed harness decision tree without mutating IAM.
 * Default (harnessArmed=false) → SKIP; never calls runProvision.
 */
export async function runPhase5JProvisionHarnessFlow(
  input: Phase5JProvisionHarnessFlowInput,
): Promise<Phase5JProvisionHarnessFlowResult> {
  if (!input.harnessArmed) {
    return {
      summary: emptyPhase5JHarnessSafeSummary({
        overallStatus: "SKIPPED",
        harnessArmed: false,
        code: "PHASE5J_PROVISION_SKIP",
      }),
      iam: null,
      provisionResult: null,
    };
  }

  const gates = evaluatePhase5JOperatorGates(input.gates);
  if (!gates.ok) {
    return {
      summary: emptyPhase5JHarnessSafeSummary({
        overallStatus: "GATED_REFUSED",
        harnessArmed: true,
        gatesOk: false,
        code: gates.code,
      }),
      iam: null,
      provisionResult: null,
    };
  }

  const iam = await runPhase5JIamPreflight({
    projectId: gates.projectId,
    permissionTester: input.permissionTester,
    credentialProvider: input.credentialProvider,
  });

  if (!iam.ok) {
    return {
      summary: summarizePhase5JProvisionResult({
        harnessArmed: true,
        gatesOk: true,
        iam,
        provisionAttempted: false,
        result: null,
      }),
      iam,
      provisionResult: null,
    };
  }

  if (!input.runProvision) {
    return {
      summary: emptyPhase5JHarnessSafeSummary({
        overallStatus: "GATED_REFUSED",
        harnessArmed: true,
        gatesOk: true,
        iamPreflightOk: true,
        code: "PROVISIONING_PORTS_UNAVAILABLE",
      }),
      iam,
      provisionResult: null,
    };
  }

  const provisionResult = await input.runProvision();
  return {
    summary: summarizePhase5JProvisionResult({
      harnessArmed: true,
      gatesOk: true,
      iam,
      provisionAttempted: true,
      result: provisionResult,
      claimVerificationReadCount: input.claimVerificationReadCount,
    }),
    iam,
    provisionResult,
  };
}
