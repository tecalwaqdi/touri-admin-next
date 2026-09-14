/**
 * FR5 Settlement Execution / Collection pilot preparation + offline Fake apply regression.
 * Production writes = 0 in this suite.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { prepareFinanceFr5SettlementExecutionPilot } from "@/application/finance/pilot/FinanceFr5PilotPreparation";
import { runFinanceFr5SettlementExecutionPilotApply } from "@/application/finance/pilot/FinanceFr5PilotApply";
import {
  createFakeFinanceFr5ApplyFirestorePort,
  financeFr5ApplyTotalWrites,
} from "@/application/finance/pilot/FinanceFr5ApplyPorts";
import {
  FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
  FINANCE_FR5_CANONICAL_MECHANISM,
  FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
  FINANCE_FR5_EXACT_TRANSITION,
  FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR5_EXPECTED_WRITE_COUNTS,
  FINANCE_FR5_PAYMENT_AMOUNT_MINOR,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_REQUIRED_RBAC_PERMISSION,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
  FINANCE_FR5_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import { FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr5PilotIamDerivation";
import { evaluateFinanceFr5LiveArmGates } from "@/application/finance/pilot/FinanceFr5PilotGates";
import { FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr5PilotDocuments";
import { calculateFinanceFr5ExecutionFromFr4Locked } from "@/application/finance/pilot/FinanceFr5PilotCalculator";
import { FINANCE_FR5_PREP_FR4_LOCKED_SETTLEMENT_FIXTURE } from "@/application/finance/pilot/FinanceFr5PilotPreparation";
import { buildFinanceFr1PilotSnapshotDoc } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { mapRegistryFixtureToFinanceFr1Candidate } from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import {
  buildFinanceFr2PilotIdempotencyDoc,
  buildFinanceFr2SettlementDoc,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import { calculateFinanceFr2SettlementFromFr1Snapshot } from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import { FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE } from "@/application/finance/pilot/FinanceFr2PilotPreparation";
import {
  buildFinanceFr4PilotIdempotencyDoc,
  buildFinanceFr4SettlementApprovalPatch,
} from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr5PilotLiveWriteEnvironment,
  captureFinanceFr5PilotOperatorLiveGates,
} from "@/test/helpers/financeFr5PilotOperatorLiveEnv";
import { isFinanceFr5SettlementExecutionPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr5SettlementExecutionPilotApplyEnabled";
import { ROLE_PERMISSION_MATRIX, hasPermission } from "@/permissions/rbac";

const PASS_GATES = {
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "1",
  FINANCE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
  SOURCE: "fr4_settlement_locked",
  FIREBASE_ID_TOKEN: "unit-test-token-not-a-jwt",
  FINANCE_FR1_PILOT_APPLY: "",
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "",
  FINANCE_FR3_RECON_PILOT_VERIFY: "",
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "",
} as const;

const CREATOR_UID = "finance_fr2_prepare_actor";
const APPROVER_UID = "finance_fr4_approver_actor";
const EXECUTOR = {
  uid: "finance_fr5_executor_actor",
  role: "operations_manager",
  permissions: ["finance:read", "settlements:execute"],
};

const IAM_PASS = {
  async testIamPermissions() {
    return [...FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS];
  },
};

const PRINCIPAL_PASS = {
  async resolvePrincipal() {
    return {
      credentialType: "authorized_user" as const,
      principalEmail: FINANCE_FR5_EXPECTED_ADC_PRINCIPAL,
    };
  },
};

function seedFr4LockedPort() {
  const candidate = mapRegistryFixtureToFinanceFr1Candidate(
    FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
    { registryPilotFlag: "1" },
  );
  const fr1Calc = calculateFinanceFr1PilotSnapshot({
    order: candidate,
    actorUserId: CREATOR_UID,
    discountFundingOwner: "company",
    asOfUtc: "2026-09-13T21:00:00.000Z",
  });
  const snapshot = buildFinanceFr1PilotSnapshotDoc({
    calculated: fr1Calc,
    actorUid: CREATOR_UID,
    correlationId: "fr1corr_unit",
    createdAtUtc: "2026-09-13T21:00:00.000Z",
  });
  const fr2Calc = calculateFinanceFr2SettlementFromFr1Snapshot({
    snapshot: FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE,
    actorUserId: CREATOR_UID,
  });
  const draft = buildFinanceFr2SettlementDoc({
    calculated: fr2Calc,
    actorUid: CREATOR_UID,
    correlationId: "fr2corr_unit",
    createdAtUtc: "2026-09-13T22:00:00.000Z",
    idempotencyKey: "fr2_idem_key_unit",
  });
  const approvalPatch = buildFinanceFr4SettlementApprovalPatch({
    approverUid: APPROVER_UID,
    correlationId: "fr4corr_unit",
    approvedAtUtc: "2026-09-14T01:00:00.000Z",
  });
  const settlement = { ...draft, ...approvalPatch };
  const fr4Idem = buildFinanceFr4PilotIdempotencyDoc({
    actorUid: APPROVER_UID,
    correlationId: "fr4corr_unit",
    auditIntentId: "fr4audit_intent_unit",
    auditResultId: "fr4audit_result_unit",
    createdAtUtc: "2026-09-14T01:00:00.000Z",
  });
  void buildFinanceFr2PilotIdempotencyDoc;
  return createFakeFinanceFr5ApplyFirestorePort({
    fr1Snapshot: snapshot,
    fr4Idempotency: fr4Idem as unknown as Record<string, unknown>,
    settlement,
  });
}

describe("Finance FR5 Settlement Execution pilot preparation (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false and Production writes = 0", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prep = prepareFinanceFr5SettlementExecutionPilot();
    expect(prep.financeWriteEnabled).toBe(false);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.fr5PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
  });

  it("locks exact transition / direction / amount / mechanism / RBAC", () => {
    const prep = prepareFinanceFr5SettlementExecutionPilot();
    expect(prep.exactTransition).toBe(FINANCE_FR5_EXACT_TRANSITION);
    expect(prep.exactExecutionDirection).toBe(
      FINANCE_FR5_EXACT_EXECUTION_DIRECTION,
    );
    expect(prep.exactPaymentAmount).toBe(FINANCE_FR5_PAYMENT_AMOUNT_MINOR);
    expect(prep.canonicalMechanism).toBe(FINANCE_FR5_CANONICAL_MECHANISM);
    expect(prep.allowedFieldMutations).toEqual(
      FINANCE_FR5_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
    );
    expect(prep.calculatedExecution?.toStatus).toBe("settled");
    expect(prep.calculatedExecution?.paymentStatus).toBe("confirmed");
    expect(prep.calculatedExecution?.amountMinor).toBe("1500");
    expect(prep.calculatedExecution?.paidConfirmedMinorAfter).toBe("1500");
    expect(prep.calculatedExecution?.outstandingMinorAfter).toBe("0");
    expect(prep.calculatedExecution?.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(prep.calculatedExecution?.walletTouched).toBe(false);
    expect(prep.calculatedExecution?.payoutExecuted).toBe(false);
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR5_EXPECTED_WRITE_COUNTS);
    expect(prep.lockedExecutionExpectations).toEqual(
      FINANCE_FR5_LOCKED_EXECUTION_EXPECTATIONS,
    );
    expect(prep.requiredRbacPermission).toBe(FINANCE_FR5_REQUIRED_RBAC_PERMISSION);
    expect(prep.requiredIamPermissions).toEqual(
      FINANCE_FR5_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    );
    expect(prep.expectedAdcPrincipal).toBe(FINANCE_FR5_EXPECTED_ADC_PRINCIPAL);
    expect(prep.separationOfDuties).toBe("prepare≠approve≠execute");
  });

  it("RBAC: settlements:approve does NOT imply execute", () => {
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.finance_approver, "settlements:approve"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.finance_approver, "settlements:execute"),
    ).toBe(false);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "settlements:execute"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "settlements:approve"),
    ).toBe(false);

    const approveOnly = prepareFinanceFr5SettlementExecutionPilot({
      actorPermissions: ["finance:read", "settlements:approve"],
    });
    expect(approveOnly.goNoGo).toBe("NO-GO");
  });

  it("NO-GO on SoD violation (executor === preparer or approver)", () => {
    const asPreparer = prepareFinanceFr5SettlementExecutionPilot({
      executorUserId: CREATOR_UID,
    });
    expect(asPreparer.goNoGo).toBe("NO-GO");

    const asApprover = prepareFinanceFr5SettlementExecutionPilot({
      executorUserId: APPROVER_UID,
    });
    expect(asApprover.goNoGo).toBe("NO-GO");
  });

  it("NO-GO when prior FR5 execution exists", () => {
    const prep = prepareFinanceFr5SettlementExecutionPilot({
      priorFr5ExecutionExists: true,
    });
    expect(prep.goNoGo).toBe("NO-GO");
  });

  it("prep refuses live arm; unarmed apply SKIP/REFUSED", async () => {
    expect(isFinanceFr5SettlementExecutionPilotApplyEnabled(undefined)).toBe(
      false,
    );
    const gates = evaluateFinanceFr5LiveArmGates({
      env: process.env,
      mode: "preparation",
    });
    expect(gates.allowed).toBe(false);

    const prep = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
  });
});

describe("Finance FR5 Settlement Execution pilot apply (offline Fake)", () => {
  it("unarmed / preparation = 0 writes", async () => {
    const prep = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
    expect(prep.writeCounts).toEqual(FINANCE_FR5_ZERO_WRITE_COUNTS);

    const unarmed = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "" },
      executeApply: true,
      firestorePort: seedFr4LockedPort(),
      actor: EXECUTOR,
      skipIamPreflight: true,
    });
    expect(unarmed.productionWrites).toBe(0);
    expect(["SKIPPED", "REFUSED_GATES"]).toContain(unarmed.status);
  });

  it("first apply = exactly 5 writes; amountMinor unchanged; paid=1500; outstanding=0", async () => {
    const port = seedFr4LockedPort();
    const beforeFr1 = JSON.stringify(port.getFr1SnapshotRaw());
    const beforeFr4Idem = JSON.stringify(port.getFr4IdempotencyRaw());
    const beforeSettlement = JSON.stringify(port.getSettlementRaw());
    const r = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: EXECUTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
      nowUtc: "2026-09-14T02:00:00.000Z",
    });
    expect(r.status).toBe(FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS);
    expect(r.productionWrites).toBe(5);
    expect(r.writeCounts).toEqual(FINANCE_FR5_EXPECTED_WRITE_COUNTS);
    expect(r.settlementId).toBe(FINANCE_FR5_SETTLEMENT_DOC_ID);
    expect(r.paymentId).toBe(FINANCE_FR5_PAYMENT_DOC_ID);
    expect(financeFr5ApplyTotalWrites(port.counter)).toBe(5);
    expect(port.counter.settlementUpdates).toBe(1);
    expect(port.counter.settlementCreates).toBe(0);
    expect(port.counter.paymentCreates).toBe(1);
    expect(port.counter.paymentUpdates).toBe(0);
    expect(port.counter.snapshotWrites).toBe(0);
    expect(port.counter.walletWrites).toBe(0);
    expect(port.counter.orderWrites).toBe(0);
    expect(JSON.stringify(port.getFr1SnapshotRaw())).toBe(beforeFr1);
    expect(JSON.stringify(port.getFr4IdempotencyRaw())).toBe(beforeFr4Idem);
    const after = port.getSettlementRaw()!;
    const payment = port.getPaymentRaw()!;
    expect(after.status).toBe("settled");
    expect(Number(after.amountMinor)).toBe(1500);
    expect(Number(after.paidConfirmedMinor)).toBe(1500);
    expect(Number(after.outstandingMinor)).toBe(0);
    expect(after.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(after.currency).toBe("SAR");
    expect(payment.status).toBe("confirmed");
    expect(Number(payment.amountMinor)).toBe(1500);
    expect(payment.walletTouched).toBe(false);
    const before = JSON.parse(beforeSettlement) as Record<string, unknown>;
    expect(after.createdByUserId).toBe(before.createdByUserId);
    expect(after.lockedByUserId).toBe(before.lockedByUserId);
    expect(r.summary.verificationPass).toBe(true);
    expect(r.summary.forbiddenWritesZero).toBe(true);
  });

  it("rerun = ALREADY_APPLIED with 0 writes", async () => {
    const port = seedFr4LockedPort();
    const first = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: EXECUTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(first.status).toBe(FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS);

    const second = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: EXECUTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(second.status).toBe("ALREADY_APPLIED");
    expect(second.productionWrites).toBe(0);
    expect(second.writeCounts).toEqual(FINANCE_FR5_ZERO_WRITE_COUNTS);
  });

  it("SoD executor===approver = REFUSED; 0 writes", async () => {
    const port = seedFr4LockedPort();
    const r = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: {
        uid: APPROVER_UID,
        role: "operations_manager",
        permissions: ["finance:read", "settlements:execute"],
      },
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers).toContain("sod_violation_executor_eq_approver");
  });

  it("RBAC without settlements:execute = REFUSED; 0 writes", async () => {
    const port = seedFr4LockedPort();
    const r = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: {
        uid: EXECUTOR.uid,
        role: "finance_approver",
        permissions: ["finance:read", "settlements:approve"],
      },
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers).toContain("rbac_denied_settlements_execute");
  });

  it("conflict / partial prior payment = CONFLICT_NO_GO; 0 writes", async () => {
    const port = seedFr4LockedPort();
    port.setPayment({
      id: FINANCE_FR5_PAYMENT_DOC_ID,
      status: "pending",
      amountMinor: 1500,
    });
    const r = await runFinanceFr5SettlementExecutionPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: EXECUTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(r.status).toBe("CONFLICT_NO_GO");
    expect(r.productionWrites).toBe(0);
  });

  it("calculator refuses amount mutation path", () => {
    const calc = calculateFinanceFr5ExecutionFromFr4Locked({
      settlement: {
        ...FINANCE_FR5_PREP_FR4_LOCKED_SETTLEMENT_FIXTURE,
        amountMinor: 9999,
      },
      executorUid: EXECUTOR.uid,
    });
    expect(calc.reconciliationStatus).toBe("blocked");
    expect(calc.reconciliationBlockers).toContain("amountMinor_must_remain_1500");
  });

  it("preserves FINANCE_FR5 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("live env helper arms FINANCE_WRITE independently", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureFinanceFr5PilotOperatorLiveGates(env);
    applyFinanceFr5PilotLiveWriteEnvironment({ capturedGates: captured, env });
    expect(env.FINANCE_WRITE_ENABLED).toBe("true");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.SOURCE).toBe("fr4_settlement_locked");
    expect(env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY).toBe("");
  });
});
