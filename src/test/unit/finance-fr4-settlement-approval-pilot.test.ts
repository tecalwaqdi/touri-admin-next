/**
 * FR4 Settlement Approval pilot preparation + offline Fake apply regression.
 * Production writes = 0 in this suite.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { prepareFinanceFr4SettlementApprovalPilot } from "@/application/finance/pilot/FinanceFr4PilotPreparation";
import { runFinanceFr4SettlementApprovalPilotApply } from "@/application/finance/pilot/FinanceFr4PilotApply";
import {
  createFakeFinanceFr4ApplyFirestorePort,
  financeFr4ApplyTotalWrites,
} from "@/application/finance/pilot/FinanceFr4ApplyPorts";
import {
  FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
  FINANCE_FR4_EXACT_TRANSITION,
  FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR4_EXPECTED_WRITE_COUNTS,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import { FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr4PilotIamDerivation";
import { evaluateFinanceFr4LiveArmGates } from "@/application/finance/pilot/FinanceFr4PilotGates";
import {
  FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS,
} from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import {
  calculateFinanceFr4ApprovalFromFr2Draft,
} from "@/application/finance/pilot/FinanceFr4PilotCalculator";
import { FINANCE_FR4_PREP_FR2_DRAFT_SETTLEMENT_FIXTURE } from "@/application/finance/pilot/FinanceFr4PilotPreparation";
import { buildFinanceFr1PilotSnapshotDoc } from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { mapRegistryFixtureToFinanceFr1Candidate } from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import {
  buildFinanceFr2PilotIdempotencyDoc,
  buildFinanceFr2SettlementDoc,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import {
  calculateFinanceFr2SettlementFromFr1Snapshot,
} from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import { FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE } from "@/application/finance/pilot/FinanceFr2PilotPreparation";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr4PilotLiveWriteEnvironment,
  captureFinanceFr4PilotOperatorLiveGates,
} from "@/test/helpers/financeFr4PilotOperatorLiveEnv";
import { isFinanceFr4SettlementApprovalPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr4SettlementApprovalPilotApplyEnabled";

const PASS_GATES = {
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "1",
  FINANCE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
  SOURCE: "fr2_settlement_draft",
  FIREBASE_ID_TOKEN: "unit-test-token-not-a-jwt",
  FINANCE_FR1_PILOT_APPLY: "",
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "",
  FINANCE_FR3_RECON_PILOT_VERIFY: "",
} as const;

const CREATOR_UID = "finance_fr2_prepare_actor";
const APPROVER = {
  uid: "finance_fr4_approver_actor",
  role: "finance_approver",
  permissions: ["finance:read", "settlements:approve"],
};

const IAM_PASS = {
  async testIamPermissions() {
    return [...FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS];
  },
};

const PRINCIPAL_PASS = {
  async resolvePrincipal() {
    return {
      credentialType: "authorized_user" as const,
      principalEmail: FINANCE_FR4_EXPECTED_ADC_PRINCIPAL,
    };
  },
};

function seedFr2DraftPort() {
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
  const settlement = buildFinanceFr2SettlementDoc({
    calculated: fr2Calc,
    actorUid: CREATOR_UID,
    correlationId: "fr2corr_unit",
    createdAtUtc: "2026-09-13T22:00:00.000Z",
    idempotencyKey: "fr2_idem_key_unit",
  });
  const fr2Idem = buildFinanceFr2PilotIdempotencyDoc({
    actorUid: CREATOR_UID,
    correlationId: "fr2corr_unit",
    auditIntentId: "fr2audit_intent_unit",
    auditResultId: "fr2audit_result_unit",
    createdAtUtc: "2026-09-13T22:00:00.000Z",
  });
  return createFakeFinanceFr4ApplyFirestorePort({
    fr1Snapshot: snapshot,
    fr2Idempotency: fr2Idem as unknown as Record<string, unknown>,
    settlement,
  });
}

describe("Finance FR4 Settlement Approval pilot preparation (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false and Production writes = 0", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prep = prepareFinanceFr4SettlementApprovalPilot();
    expect(prep.financeWriteEnabled).toBe(false);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.fr4PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
  });

  it("locks exact transition draft → locked (= approved) and field mutations", () => {
    const prep = prepareFinanceFr4SettlementApprovalPilot();
    expect(prep.exactTransition).toBe(FINANCE_FR4_EXACT_TRANSITION);
    expect(prep.allowedFieldMutations).toEqual(
      FINANCE_FR4_ALLOWED_SETTLEMENT_FIELD_MUTATIONS,
    );
    expect(prep.calculatedApproval?.toStatus).toBe("locked");
    expect(prep.calculatedApproval?.opsApprovalLabel).toBe("approved");
    expect(prep.calculatedApproval?.amountMinor).toBe("1500");
    expect(prep.calculatedApproval?.paidConfirmedMinor).toBe("0");
    expect(prep.calculatedApproval?.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(prep.calculatedApproval?.paymentExecutionForbidden).toBe(true);
    expect(prep.calculatedApproval?.mutatesSettlementAmounts).toBe(false);
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR4_EXPECTED_WRITE_COUNTS);
    expect(prep.lockedApprovalExpectations).toEqual(
      FINANCE_FR4_LOCKED_APPROVAL_EXPECTATIONS,
    );
    expect(prep.requiredRbacPermission).toBe("settlements:approve");
    expect(prep.requiredIamPermissions).toEqual(
      FINANCE_FR4_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    );
    expect(prep.expectedAdcPrincipal).toBe(FINANCE_FR4_EXPECTED_ADC_PRINCIPAL);
    expect(prep.separationOfDuties).toBe("prepare≠approve≠execute");
  });

  it("NO-GO on dual control violation (approver === creator)", () => {
    const prep = prepareFinanceFr4SettlementApprovalPilot({
      fr2Settlement: {
        ...FINANCE_FR4_PREP_FR2_DRAFT_SETTLEMENT_FIXTURE,
        createdByUserId: "same_actor",
      },
      approverUserId: "same_actor",
    });
    expect(prep.goNoGo).toBe("NO-GO");
    expect(prep.fr4PrepStatus).toBe("NO-GO");
  });

  it("NO-GO when prior FR4 approval exists", () => {
    const prep = prepareFinanceFr4SettlementApprovalPilot({
      priorFr4ApprovalExists: true,
    });
    expect(prep.goNoGo).toBe("NO-GO");
  });

  it("prep refuses live arm; unarmed apply SKIP/REFUSED", async () => {
    expect(isFinanceFr4SettlementApprovalPilotApplyEnabled(undefined)).toBe(
      false,
    );
    const gates = evaluateFinanceFr4LiveArmGates({
      env: process.env,
      mode: "preparation",
    });
    expect(gates.allowed).toBe(false);

    const prep = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
  });
});

describe("Finance FR4 Settlement Approval pilot apply (offline Fake)", () => {
  it("unarmed / preparation = 0 writes", async () => {
    const prep = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
    expect(prep.writeCounts).toEqual(FINANCE_FR4_ZERO_WRITE_COUNTS);

    const unarmed = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "" },
      executeApply: true,
      firestorePort: seedFr2DraftPort(),
      actor: APPROVER,
      skipIamPreflight: true,
    });
    expect(unarmed.productionWrites).toBe(0);
    expect(["SKIPPED", "REFUSED_GATES"]).toContain(unarmed.status);
  });

  it("first apply = exactly 4 writes; immutable fields untouched", async () => {
    const port = seedFr2DraftPort();
    const beforeSettlement = JSON.stringify(port.getSettlementRaw());
    const beforeFr1 = JSON.stringify(port.getFr1SnapshotRaw());
    const beforeFr2Idem = JSON.stringify(port.getFr2IdempotencyRaw());
    const r = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: APPROVER,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
      nowUtc: "2026-09-14T01:00:00.000Z",
    });
    expect(r.status).toBe(FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS);
    expect(r.productionWrites).toBe(4);
    expect(r.writeCounts).toEqual(FINANCE_FR4_EXPECTED_WRITE_COUNTS);
    expect(r.settlementId).toBe(FINANCE_FR4_SETTLEMENT_DOC_ID);
    expect(financeFr4ApplyTotalWrites(port.counter)).toBe(4);
    expect(port.counter.settlementUpdates).toBe(1);
    expect(port.counter.settlementCreates).toBe(0);
    expect(port.counter.snapshotWrites).toBe(0);
    expect(port.counter.paymentWrites).toBe(0);
    expect(port.counter.orderWrites).toBe(0);
    expect(JSON.stringify(port.getFr1SnapshotRaw())).toBe(beforeFr1);
    expect(JSON.stringify(port.getFr2IdempotencyRaw())).toBe(beforeFr2Idem);
    const after = port.getSettlementRaw()!;
    expect(after.status).toBe("locked");
    expect(after.approvedBy).toBe(APPROVER.uid);
    expect(after.lockedByUserId).toBe(APPROVER.uid);
    expect(Number(after.amountMinor)).toBe(1500);
    expect(Number(after.paidConfirmedMinor)).toBe(0);
    expect(after.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(after.currency).toBe("SAR");
    // creator unchanged
    const before = JSON.parse(beforeSettlement) as Record<string, unknown>;
    expect(after.createdByUserId).toBe(before.createdByUserId);
    expect(r.summary.verificationPass).toBe(true);
    expect(r.summary.forbiddenWritesZero).toBe(true);
    expect(r.summary.calculatedApproval?.opsApprovalLabel).toBe("approved");
  });

  it("rerun = ALREADY_APPLIED with 0 writes", async () => {
    const port = seedFr2DraftPort();
    const first = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: APPROVER,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(first.status).toBe(FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS);

    const second = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: APPROVER,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(second.status).toBe("ALREADY_APPLIED");
    expect(second.productionWrites).toBe(0);
    expect(second.writeCounts).toEqual(FINANCE_FR4_ZERO_WRITE_COUNTS);
  });

  it("self-approve = REFUSED dual_control; 0 writes", async () => {
    const port = seedFr2DraftPort();
    const r = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: {
        uid: CREATOR_UID,
        role: "finance_approver",
        permissions: ["finance:read", "settlements:approve"],
      },
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers).toContain("dual_control_violation");
  });

  it("RBAC without settlements:approve = REFUSED; 0 writes", async () => {
    const port = seedFr2DraftPort();
    const r = await runFinanceFr4SettlementApprovalPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: {
        uid: APPROVER.uid,
        role: "accountant",
        permissions: ["finance:read", "settlements:prepare"],
      },
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers).toContain("rbac_denied_settlements_approve");
  });

  it("calculator refuses amount mutation path", () => {
    const calc = calculateFinanceFr4ApprovalFromFr2Draft({
      settlement: {
        ...FINANCE_FR4_PREP_FR2_DRAFT_SETTLEMENT_FIXTURE,
        amountMinor: 9999,
      },
      approverUid: APPROVER.uid,
    });
    expect(calc.reconciliationStatus).toBe("blocked");
    expect(calc.reconciliationBlockers).toContain("amountMinor_must_remain_1500");
  });

  it("preserves FINANCE_FR4 apply arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it("live env helper arms FINANCE_WRITE independently", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureFinanceFr4PilotOperatorLiveGates(env);
    applyFinanceFr4PilotLiveWriteEnvironment({ capturedGates: captured, env });
    expect(env.FINANCE_WRITE_ENABLED).toBe("true");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.SOURCE).toBe("fr2_settlement_draft");
    expect(env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY).toBe("");
  });
});
