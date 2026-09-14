/**
 * FR2 Settlement V2 pilot preparation + offline Fake apply regression.
 * Production writes = 0 in this suite.
 */

import { describe, expect, it } from "vitest";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { prepareFinanceFr2SettlementPilot } from "@/application/finance/pilot/FinanceFr2PilotPreparation";
import { runFinanceFr2SettlementPilotApply } from "@/application/finance/pilot/FinanceFr2PilotApply";
import {
  createFakeFinanceFr2ApplyFirestorePort,
  financeFr2ApplyTotalWrites,
} from "@/application/finance/pilot/FinanceFr2ApplyPorts";
import {
  FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR2_EXPECTED_PROJECT_ID,
  FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SETTLEMENT_PILOT_PASS,
  FINANCE_FR2_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr2PilotIamDerivation";
import { evaluateFinanceFr2LiveArmGates } from "@/application/finance/pilot/FinanceFr2PilotGates";
import {
  buildFinanceFr2PilotIdempotencyDoc,
  buildFinanceFr2SettlementDoc,
  FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import {
  calculateFinanceFr2SettlementFromFr1Snapshot,
} from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import { FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE } from "@/application/finance/pilot/FinanceFr2PilotPreparation";
import {
  buildFinanceFr1PilotIdempotencyDoc,
  buildFinanceFr1PilotSnapshotDoc,
} from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { mapRegistryFixtureToFinanceFr1Candidate } from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr2PilotLiveWriteEnvironment,
  captureFinanceFr2PilotOperatorLiveGates,
} from "@/test/helpers/financeFr2PilotOperatorLiveEnv";
import { isFinanceFr2SettlementPilotApplyEnabled } from "@/application/finance/pilot/isFinanceFr2SettlementPilotApplyEnabled";

const PASS_GATES = {
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "1",
  FINANCE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: FINANCE_FR2_EXPECTED_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: FINANCE_FR2_EXPECTED_PROJECT_ID,
  SOURCE: "fr1_snapshot",
  FIREBASE_ID_TOKEN: "unit-test-token-not-a-jwt",
  FINANCE_FR1_PILOT_APPLY: "",
} as const;

const ACTOR = {
  uid: "finance_fr2_unit_actor",
  role: "super_admin",
  permissions: ["finance:read", "settlements:prepare"],
};

const IAM_PASS = {
  async testIamPermissions() {
    return [...FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS];
  },
};

const PRINCIPAL_PASS = {
  async resolvePrincipal() {
    return {
      credentialType: "authorized_user" as const,
      principalEmail: FINANCE_FR2_EXPECTED_ADC_PRINCIPAL,
    };
  },
};

function seedFr1CompletePort() {
  const candidate = mapRegistryFixtureToFinanceFr1Candidate(
    FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
    { registryPilotFlag: "1" },
  );
  const calculated = calculateFinanceFr1PilotSnapshot({
    order: candidate,
    actorUserId: ACTOR.uid,
    discountFundingOwner: "company",
    asOfUtc: "2026-09-13T21:00:00.000Z",
  });
  const snapshot = buildFinanceFr1PilotSnapshotDoc({
    calculated,
    actorUid: ACTOR.uid,
    correlationId: "fr1corr_unit",
    createdAtUtc: "2026-09-13T21:00:00.000Z",
  });
  const fr1Idem = buildFinanceFr1PilotIdempotencyDoc({
    actorUid: ACTOR.uid,
    correlationId: "fr1corr_unit",
    auditIntentId: "fr1audit_intent_unit",
    auditResultId: "fr1audit_result_unit",
    createdAtUtc: "2026-09-13T21:00:00.000Z",
  });
  return createFakeFinanceFr2ApplyFirestorePort({
    fr1Snapshot: snapshot,
    fr1Idempotency: fr1Idem as unknown as Record<string, unknown>,
  });
}

describe("Finance FR2 Settlement V2 pilot preparation (offline)", () => {
  it("keeps FINANCE_WRITE_ENABLED false and Production writes = 0", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const prep = prepareFinanceFr2SettlementPilot();
    expect(prep.financeWriteEnabled).toBe(false);
    expect(prep.productionWritesThisSession).toBe(0);
    expect(prep.fr2PrepStatus).toBe("PASS");
    expect(prep.goNoGo).toBe("GO");
  });

  it("locks Settlement V2 draft from FR1 snapshot amounts", () => {
    const prep = prepareFinanceFr2SettlementPilot();
    expect(prep.calculatedSettlement?.amountMinor).toBe("1500");
    expect(prep.calculatedSettlement?.direction).toBe("DRIVER_PAYS_COMPANY");
    expect(prep.calculatedSettlement?.agentSettlementCreated).toBe(false);
    expect(prep.calculatedSettlement?.agentShareMinor).toBeNull();
    expect(prep.calculatedSettlement?.fr1GrossFareMinor).toBe("10000");
    expect(prep.calculatedSettlement?.fr1CommissionMinor).toBe("1500");
    expect(prep.calculatedSettlement?.fr1DriverNetMinor).toBe("8500");
    expect(prep.exactExpectedWrites).toEqual(FINANCE_FR2_EXPECTED_WRITE_COUNTS);
    expect(prep.lockedSettlementExpectations).toEqual(
      FINANCE_FR2_LOCKED_SETTLEMENT_EXPECTATIONS,
    );
    expect(prep.expectedAdcPrincipal).toBe(FINANCE_FR2_EXPECTED_ADC_PRINCIPAL);
    expect(prep.requiredIamPermissions).toEqual(
      FINANCE_FR2_REQUIRED_OPERATOR_IAM_PERMISSIONS,
    );
  });

  it("cash remittance = gross − driverNet via calculator", () => {
    const calc = calculateFinanceFr2SettlementFromFr1Snapshot({
      snapshot: FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE,
      actorUserId: "actor",
    });
    expect(calc.reconciliationStatus).toBe("preconditions_ok");
    expect(calc.amountMinor).toBe("1500");
    expect(calc.claim.amountMinor).toBe("1500");
    expect(calc.mutatesFinanceSnapshot).toBe(false);
    expect(calc.paymentExecutionForbidden).toBe(true);
  });

  it("NO-GO when prior FR2 settlement exists", () => {
    const prep = prepareFinanceFr2SettlementPilot({
      priorFr2SettlementExists: true,
    });
    expect(prep.goNoGo).toBe("NO-GO");
    expect(prep.fr2PrepStatus).toBe("NO-GO");
  });

  it("prep refuses live arm; unarmed apply SKIP/REFUSED", async () => {
    expect(isFinanceFr2SettlementPilotApplyEnabled(undefined)).toBe(false);
    const gates = evaluateFinanceFr2LiveArmGates({
      env: process.env,
      mode: "preparation",
    });
    expect(gates.allowed).toBe(false);

    const prep = await runFinanceFr2SettlementPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
  });
});

describe("Finance FR2 Settlement V2 pilot apply (offline Fake)", () => {
  it("unarmed / preparation = 0 writes", async () => {
    const prep = await runFinanceFr2SettlementPilotApply({
      mode: "preparation",
    });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
    expect(prep.writeCounts).toEqual(FINANCE_FR2_ZERO_WRITE_COUNTS);

    const unarmed = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "" },
      executeApply: true,
      firestorePort: seedFr1CompletePort(),
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(unarmed.productionWrites).toBe(0);
    expect(["SKIPPED", "REFUSED_GATES"]).toContain(unarmed.status);
  });

  it("first apply = exactly 4 writes; FR1 snapshot untouched", async () => {
    const port = seedFr1CompletePort();
    const before = JSON.stringify(port.getFr1SnapshotRaw());
    const r = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
      nowUtc: "2026-09-13T22:00:00.000Z",
    });
    expect(r.status).toBe(FINANCE_FR2_SETTLEMENT_PILOT_PASS);
    expect(r.productionWrites).toBe(4);
    expect(r.writeCounts).toEqual(FINANCE_FR2_EXPECTED_WRITE_COUNTS);
    expect(r.settlementId).toBe(FINANCE_FR2_SETTLEMENT_DOC_ID);
    expect(financeFr2ApplyTotalWrites(port.counter)).toBe(4);
    expect(port.counter.snapshotWrites).toBe(0);
    expect(port.counter.paymentWrites).toBe(0);
    expect(port.counter.orderWrites).toBe(0);
    expect(JSON.stringify(port.getFr1SnapshotRaw())).toBe(before);
    expect(r.summary.verificationPass).toBe(true);
    expect(r.summary.forbiddenWritesZero).toBe(true);
    expect(r.summary.calculatedSettlement?.amountMinor).toBe("1500");
    expect(r.summary.calculatedSettlement?.direction).toBe(
      "DRIVER_PAYS_COMPANY",
    );
  });

  it("rerun = ALREADY_APPLIED with 0 writes", async () => {
    const port = seedFr1CompletePort();
    const first = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(first.status).toBe(FINANCE_FR2_SETTLEMENT_PILOT_PASS);

    const second = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(second.status).toBe("ALREADY_APPLIED");
    expect(second.productionWrites).toBe(0);
    expect(second.writeCounts).toEqual(FINANCE_FR2_ZERO_WRITE_COUNTS);
  });

  it("partial prior = CONFLICT_NO_GO", async () => {
    const port = seedFr1CompletePort();
    const calc = calculateFinanceFr2SettlementFromFr1Snapshot({
      snapshot: FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE,
      actorUserId: ACTOR.uid,
    });
    port.setSettlement(
      buildFinanceFr2SettlementDoc({
        calculated: calc,
        actorUid: ACTOR.uid,
        correlationId: "x",
        createdAtUtc: "2026-09-13T22:00:00.000Z",
        idempotencyKey: calc.idempotencyKeyPattern,
      }),
    );
    const r = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.status).toBe("CONFLICT_NO_GO");
    expect(r.productionWrites).toBe(0);
  });

  it("missing FR1 precondition = REFUSED_GATES", async () => {
    const port = createFakeFinanceFr2ApplyFirestorePort();
    const r = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.blockers).toContain("fr1_snapshot_or_idempotency_incomplete");
    expect(r.productionWrites).toBe(0);
  });

  it("RBAC deny = 0 writes", async () => {
    const r = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: seedFr1CompletePort(),
      actor: {
        uid: "x",
        role: "ops",
        permissions: ["finance:read"],
      },
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.blockers).toContain("rbac_denied_finance");
    expect(r.productionWrites).toBe(0);
  });

  it("preserves FR2 arm through sanitization; never write flags globally", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("tok");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }

    const liveCapture = captureFinanceFr2PilotOperatorLiveGates({
      FINANCE_FR2_SETTLEMENT_PILOT_APPLY: "1",
      FINANCE_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
      PRODUCTION_WRITE_ENABLED: "false",
      DRIVER_WRITE_ENABLED: "false",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: FINANCE_FR2_EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: FINANCE_FR2_EXPECTED_PROJECT_ID,
      SOURCE: "fr1_snapshot",
      FIREBASE_ID_TOKEN: "tok",
    });
    applyFinanceFr2PilotLiveWriteEnvironment({
      capturedGates: liveCapture,
      env,
    });
    expect(env.FINANCE_WRITE_ENABLED).toBe("true");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.SOURCE).toBe("fr1_snapshot");
  });

  it("consistent already-applied seed returns ALREADY_APPLIED", async () => {
    const port = seedFr1CompletePort();
    const calc = calculateFinanceFr2SettlementFromFr1Snapshot({
      snapshot: FINANCE_FR2_PREP_FR1_SNAPSHOT_FIXTURE,
      actorUserId: ACTOR.uid,
    });
    port.setSettlement(
      buildFinanceFr2SettlementDoc({
        calculated: calc,
        actorUid: ACTOR.uid,
        correlationId: "corr",
        createdAtUtc: "2026-09-13T22:00:00.000Z",
        idempotencyKey: calc.idempotencyKeyPattern,
      }),
    );
    port.setFr2Idempotency(
      buildFinanceFr2PilotIdempotencyDoc({
        actorUid: ACTOR.uid,
        correlationId: "corr",
        auditIntentId: "a1",
        auditResultId: "a2",
        createdAtUtc: "2026-09-13T22:00:00.000Z",
      }) as unknown as Record<string, unknown>,
    );
    const r = await runFinanceFr2SettlementPilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.status).toBe("ALREADY_APPLIED");
    expect(r.productionWrites).toBe(0);
  });
});
