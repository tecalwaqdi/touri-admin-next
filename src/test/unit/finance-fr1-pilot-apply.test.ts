/**
 * FR1 Finance Pilot live apply — offline Fake regression tests.
 * Production writes = 0 in this suite (Fake ports only).
 */

import { describe, expect, it } from "vitest";
import { runFinanceFr1PilotApply } from "@/application/finance/pilot/FinanceFr1PilotApply";
import {
  createFakeFinanceFr1ApplyFirestorePort,
  financeFr1ApplyTotalWrites,
} from "@/application/finance/pilot/FinanceFr1ApplyPorts";
import {
  FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_PILOT_PASS,
  FINANCE_FR1_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import { FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr1PilotIamDerivation";
import { evaluateFinanceFr1LiveArmGates } from "@/application/finance/pilot/FinanceFr1PilotGates";
import {
  buildFinanceFr1PilotIdempotencyDoc,
  buildFinanceFr1PilotSnapshotDoc,
} from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { calculateFinanceFr1PilotSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  applyFinanceFr1PilotLiveWriteEnvironment,
  captureFinanceFr1PilotOperatorLiveGates,
} from "@/test/helpers/financeFr1PilotOperatorLiveEnv";

const PASS_GATES = {
  FINANCE_FR1_PILOT_APPLY: "1",
  FINANCE_FR1_REGISTRY_PILOT: "1",
  FINANCE_WRITE_ENABLED: "true",
  GLOBAL_PRODUCTION_WRITE_ENABLED: "false",
  PRODUCTION_WRITE_ENABLED: "false",
  DRIVER_WRITE_ENABLED: "false",
  AGENT_WRITE_ENABLED: "false",
  CUSTOMER_WRITE_ENABLED: "false",
  EXPECTED_PROJECT_ID: FINANCE_FR1_EXPECTED_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: FINANCE_FR1_EXPECTED_PROJECT_ID,
  SOURCE: "registry",
  FIREBASE_ID_TOKEN: "unit-test-token-not-a-jwt",
} as const;

const ACTOR = {
  uid: "finance_fr1_unit_actor",
  role: "super_admin",
  permissions: ["finance:read", "settlements:prepare"],
};

const IAM_PASS = {
  async testIamPermissions() {
    return [...FINANCE_FR1_REQUIRED_OPERATOR_IAM_PERMISSIONS];
  },
};

const PRINCIPAL_PASS = {
  async resolvePrincipal() {
    return {
      credentialType: "authorized_user" as const,
      principalEmail: FINANCE_FR1_EXPECTED_ADC_PRINCIPAL,
    };
  },
};

function seedPort() {
  return createFakeFinanceFr1ApplyFirestorePort({
    registry: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC as unknown as Record<
      string,
      unknown
    >,
  });
}

describe("Finance FR1 pilot apply (offline Fake)", () => {
  it("unarmed / preparation = 0 writes", async () => {
    const prep = await runFinanceFr1PilotApply({ mode: "preparation" });
    expect(prep.status).toBe("REFUSED_PREP");
    expect(prep.productionWrites).toBe(0);
    expect(prep.writeCounts).toEqual(FINANCE_FR1_ZERO_WRITE_COUNTS);

    const unarmed = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_FR1_PILOT_APPLY: "" },
      executeApply: true,
      firestorePort: seedPort(),
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(unarmed.productionWrites).toBe(0);
    expect(["SKIPPED", "REFUSED_GATES"]).toContain(unarmed.status);
  });

  it("armed but missing token = 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FIREBASE_ID_TOKEN: "" },
      executeApply: true,
      firestorePort: seedPort(),
      actor: null,
      firebaseIdToken: "",
      skipIamPreflight: true,
      actorResolver: {
        async resolve() {
          return { ok: false, reason: "TOKEN_MISSING" };
        },
      },
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers.join(",")).toMatch(/TOKEN|token/i);
  });

  it("registry flag missing = 0 writes", async () => {
    const gates = evaluateFinanceFr1LiveArmGates({
      env: { ...PASS_GATES, FINANCE_FR1_REGISTRY_PILOT: "" },
      mode: "live_apply",
    });
    expect(gates.allowed).toBe(false);
    expect(gates.blockers).toContain("FINANCE_FR1_REGISTRY_PILOT!=1");

    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_FR1_REGISTRY_PILOT: "" },
      executeApply: true,
      firestorePort: seedPort(),
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.productionWrites).toBe(0);
  });

  it("finance flag false = 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: { ...PASS_GATES, FINANCE_WRITE_ENABLED: "false" },
      executeApply: true,
      firestorePort: seedPort(),
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
  });

  it("wrong project = 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: {
        ...PASS_GATES,
        EXPECTED_PROJECT_ID: "wrong-project",
        GOOGLE_CLOUD_PROJECT: "wrong-project",
      },
      executeApply: true,
      firestorePort: seedPort(),
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.productionWrites).toBe(0);
  });

  it("wrong ADC principal = 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: seedPort(),
      actor: ACTOR,
      permissionTester: IAM_PASS,
      principalResolver: {
        async resolvePrincipal() {
          return {
            credentialType: "authorized_user",
            principalEmail: "wrong@example.com",
          };
        },
      },
    });
    expect(r.status).toBe("IAM_PREFLIGHT_FAILED");
    expect(r.productionWrites).toBe(0);
    expect(r.summary.adcPrincipalVerification).toBe("FAIL");
    expect(r.blockers).toContain("ADC_PRINCIPAL_MISMATCH");
  });

  it("RBAC denial = 0 writes", async () => {
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: seedPort(),
      actor: {
        uid: "viewer",
        role: "reporting_viewer",
        permissions: ["finance:read"],
      },
      skipIamPreflight: true,
    });
    expect(r.status).toBe("REFUSED_GATES");
    expect(r.productionWrites).toBe(0);
    expect(r.blockers).toContain("rbac_denied_finance");
  });

  it("fixture conflict / partial prior = 0 writes", async () => {
    const port = seedPort();
    const calculated = calculateFinanceFr1PilotSnapshot({
      order: {
        documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        data: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC.orderPayload as unknown as Record<
          string,
          unknown
        >,
      },
      actorUserId: ACTOR.uid,
      discountFundingOwner: "company",
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });
    port.setSnapshot(
      buildFinanceFr1PilotSnapshotDoc({
        calculated,
        actorUid: ACTOR.uid,
        correlationId: "c1",
        createdAtUtc: "2026-09-13T21:00:00.000Z",
      }),
    );
    // idempotency missing → partial conflict
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
      permissionTester: IAM_PASS,
      principalResolver: PRINCIPAL_PASS,
    });
    expect(r.status).toBe("CONFLICT_NO_GO");
    expect(r.productionWrites).toBe(0);
  });

  it("already applied = 0 writes", async () => {
    const port = seedPort();
    const calculated = calculateFinanceFr1PilotSnapshot({
      order: {
        documentId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        data: FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC.orderPayload as unknown as Record<
          string,
          unknown
        >,
      },
      actorUserId: ACTOR.uid,
      discountFundingOwner: "company",
      asOfUtc: "2026-09-13T21:00:00.000Z",
    });
    port.setSnapshot(
      buildFinanceFr1PilotSnapshotDoc({
        calculated,
        actorUid: ACTOR.uid,
        correlationId: "c1",
        createdAtUtc: "2026-09-13T21:00:00.000Z",
      }),
    );
    port.setIdempotency(
      buildFinanceFr1PilotIdempotencyDoc({
        actorUid: ACTOR.uid,
        correlationId: "c1",
        auditIntentId: "intent_1",
        auditResultId: "result_1",
        createdAtUtc: "2026-09-13T21:00:00.000Z",
      }) as unknown as Record<string, unknown>,
    );

    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(r.status).toBe("ALREADY_APPLIED");
    expect(r.productionWrites).toBe(0);
    expect(r.summary.alreadyApplied).toBe(true);
  });

  it("successful live adapter simulation = exactly 4 writes; forbidden untouched", async () => {
    const port = seedPort();
    const r = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
      nowUtc: "2026-09-13T21:00:00.000Z",
    });

    expect(r.status).toBe(FINANCE_FR1_PILOT_PASS);
    expect(r.productionWrites).toBe(4);
    expect(r.writeCounts).toEqual(FINANCE_FR1_EXPECTED_WRITE_COUNTS);
    expect(r.summary.actualSnapshotWrites).toBe(1);
    expect(r.summary.actualAuditIntentWrites).toBe(1);
    expect(r.summary.actualAuditResultWrites).toBe(1);
    expect(r.summary.actualIdempotencyWrites).toBe(1);
    expect(financeFr1ApplyTotalWrites(port.counter)).toBe(4);
    expect(r.summary.forbiddenWritesZero).toBe(true);
    expect(r.summary.orderWrites).toBe(0);
    expect(r.summary.settlementWrites).toBe(0);
    expect(r.summary.driverWrites).toBe(0);
    expect(r.summary.agentWrites).toBe(0);
    expect(r.summary.customerWrites).toBe(0);
    expect(r.summary.authWrites).toBe(0);
    expect(r.summary.verificationPass).toBe(true);
    expect(r.summary.calculatedSnapshot?.grossFareMinor).toBe("10000");
    expect(r.summary.calculatedSnapshot?.commissionAmountMinor).toBe("1500");
    expect(r.summary.calculatedSnapshot?.driverNetMinor).toBe("8500");
    expect(r.summary.calculatedSnapshot?.driverDeductionsMinor).toBe("1500");
    expect(r.summary.overallStatus).toBe(FINANCE_FR1_PILOT_PASS);

    // Rerun → ALREADY_APPLIED
    const again = await runFinanceFr1PilotApply({
      mode: "live_apply",
      env: PASS_GATES,
      executeApply: true,
      firestorePort: port,
      actor: ACTOR,
      skipIamPreflight: true,
    });
    expect(again.status).toBe("ALREADY_APPLIED");
    expect(again.productionWrites).toBe(0);
  });

  it("GLOBAL/PRODUCTION write must stay false for independent Finance gate", () => {
    expect(
      evaluateFinanceFr1LiveArmGates({
        env: { ...PASS_GATES, GLOBAL_PRODUCTION_WRITE_ENABLED: "true" },
        mode: "live_apply",
      }).allowed,
    ).toBe(false);
    expect(
      evaluateFinanceFr1LiveArmGates({
        env: { ...PASS_GATES, PRODUCTION_WRITE_ENABLED: "true" },
        mode: "live_apply",
      }).allowed,
    ).toBe(false);
    expect(
      evaluateFinanceFr1LiveArmGates({
        env: PASS_GATES,
        mode: "live_apply",
      }).allowed,
    ).toBe(true);
  });

  it("Phase5G-style arm preserved; write flags cleared globally; live capture restores", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR1_PILOT_APPLY: "1",
      FINANCE_FR1_REGISTRY_PILOT: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      SOURCE: "registry",
      EXPECTED_PROJECT_ID: FINANCE_FR1_EXPECTED_PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: FINANCE_FR1_EXPECTED_PROJECT_ID,
    };
    const capturedHarness = captureOperatorHarnessEnv(env);
    const liveCapture = captureFinanceFr1PilotOperatorLiveGates(env);
    applyOperatorHarnessEnvSanitization(capturedHarness, env);
    expect(env.FINANCE_FR1_PILOT_APPLY).toBe("1");
    expect(env.FINANCE_FR1_REGISTRY_PILOT).toBe("1");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    applyFinanceFr1PilotLiveWriteEnvironment({
      capturedGates: liveCapture,
      env,
    });
    expect(env.FINANCE_WRITE_ENABLED).toBe("true");
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
    expect(env.DRIVER_WRITE_ENABLED).toBe("false");
    expect(env.SOURCE).toBe("registry");
  });
});
