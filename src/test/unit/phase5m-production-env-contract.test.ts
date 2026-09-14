/**
 * Phase 5M — Production WRITE environment contract regressions.
 * No live Production calls / no Pilot apply in this file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import { isPhase5MDriverPilotApplyEnabled } from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import { evaluatePhase5MOperatorGates } from "@/application/controlled-writes/pilot/Phase5MOperatorGates";
import {
  assertPhase5MLiveProductionIdentity,
  assertPhase5MLiveProjectFingerprint,
  assertPhase5MLiveShadowResources,
  PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
  PHASE_5M_LIVE_WRITE_CONTRACT,
  Phase5MLiveWriteContractError,
} from "@/application/controlled-writes/pilot/Phase5MLiveWriteContract";
import {
  applyPhase5MLiveProductionWriteEnvironment,
  capturePhase5MOperatorLiveGates,
  envForPhase5MVerifiedActorResolution,
  loadPhase5MLiveProductionWriteEnv,
} from "@/test/helpers/phase5mOperatorLiveEnv";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { runPhase5MDriverPilotApply } from "@/application/controlled-writes/pilot/Phase5MDriverPilotApply";

function wipeToSafeDefaults(): void {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.AUTH_MODE = "mock";
  process.env.EXPECTED_PROJECT_ID = "";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.GOOGLE_CLOUD_PROJECT = "";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.CUSTOMER_AUTH_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  process.env.PHASE5M_DRIVER_PILOT_APPLY = "";
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  resetEnvCache();
}

afterEach(() => {
  wipeToSafeDefaults();
});

describe("Phase 5M — production write env contract", () => {
  it("no Phase5M flag → SKIP", async () => {
    expect(isPhase5MDriverPilotApplyEnabled(undefined)).toBe(false);
    expect(isPhase5MDriverPilotApplyEnabled("0")).toBe(false);
    const r = await runPhase5MDriverPilotApply({ harnessArmed: false });
    expect(r.summary.overallStatus).toBe("SKIPPED");
    expect(r.summary.productionWrites).toBe(0);
    expect(r.summary.applyAttempted).toBe(false);
  });

  it("armed + production env + valid write gates → loadEnv PASS", () => {
    wipeToSafeDefaults();
    // Simulate Vitest beforeEach wipe then armed restore.
    process.env.APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.FIREBASE_ID_TOKEN = "phase5m_unit_actor_token";

    const captured = capturePhase5MOperatorLiveGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "false",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
      FIREBASE_ID_TOKEN: "phase5m_unit_actor_token",
    });

    applyPhase5MLiveProductionWriteEnvironment({ capturedGates: captured });

    const env = loadPhase5MLiveProductionWriteEnv();
    expect(env.APP_ENV).toBe("production");
    expect(env.NODE_ENV).toBe("production");
    expect(env.EXPECTED_ENVIRONMENT).toBe("production");
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.EXPECTED_PROJECT_ID).toBe("tutorial-multi-language-70gx4j");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(true);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(true);
    expect(env.DRIVER_WRITE_ENABLED).toBe(true);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
    expect(env.CUSTOMER_WRITE_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe(
      PHASE_5M_LIVE_SHADOW_ALLOWED_RESOURCES,
    );
    expect(process.env.FIREBASE_ID_TOKEN).toBe("phase5m_unit_actor_token");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

    const gates = evaluatePhase5MOperatorGates();
    expect(gates.ok).toBe(true);

    const actorEnv = envForPhase5MVerifiedActorResolution(env);
    expect(actorEnv.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(actorEnv.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(true);
  });

  it("armed + development env → fail closed at loadEnv", () => {
    wipeToSafeDefaults();
    process.env.PHASE5M_DRIVER_PILOT_APPLY = "1";
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.APP_ENV = "development";
    process.env.EXPECTED_ENVIRONMENT = "development";
    process.env.AUTH_MODE = "mock";
    process.env.PRODUCTION_WRITE_ENABLED = "true";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "true";
    process.env.DRIVER_WRITE_ENABLED = "true";
    process.env.EXPECTED_PROJECT_ID = "tutorial-multi-language-70gx4j";
    resetEnvCache();
    expect(() => loadEnv()).toThrow(
      /forbidden in non-production|development startup/i,
    );
    expect(() =>
      assertPhase5MLiveProductionIdentity({
        NODE_ENV: "development",
        APP_ENV: "development",
        EXPECTED_ENVIRONMENT: "development",
      }),
    ).toThrow(Phase5MLiveWriteContractError);
  });

  it("wrong project → fail closed", () => {
    expect(() =>
      assertPhase5MLiveProjectFingerprint({
        EXPECTED_PROJECT_ID: "wrong-project",
        GOOGLE_CLOUD_PROJECT: "wrong-project",
      }),
    ).toThrow(Phase5MLiveWriteContractError);

    const gates = evaluatePhase5MOperatorGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "false",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "wrong-project",
      GOOGLE_CLOUD_PROJECT: "wrong-project",
    });
    expect(gates.ok).toBe(false);
    if (!gates.ok) expect(gates.code).toBe("PROJECT_ID_MISMATCH");
  });

  it("unrelated write domain true → fail closed", () => {
    const finance = evaluatePhase5MOperatorGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "false",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "true",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
    });
    expect(finance.ok).toBe(false);
    if (!finance.ok) {
      expect(finance.code).toBe("UNSAFE_WRITE_CONFIGURATION");
      expect(finance.unsafeTrue).toContain("FINANCE_WRITE_ENABLED");
    }

    const agent = evaluatePhase5MOperatorGates({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "true",
      CUSTOMER_WRITE_ENABLED: "false",
      CUSTOMER_AUTH_WRITE_ENABLED: "false",
      FINANCE_WRITE_ENABLED: "false",
      SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED: "false",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
    });
    expect(agent.ok).toBe(false);
    if (!agent.ok) expect(agent.unsafeTrue).toContain("AGENT_WRITE_ENABLED");
  });

  it("LIVE_SHADOW_ALLOWED_RESOURCES != drivers → fail closed", () => {
    expect(() => assertPhase5MLiveShadowResources("")).toThrow(
      Phase5MLiveWriteContractError,
    );
    expect(() => assertPhase5MLiveShadowResources("trips")).toThrow(
      Phase5MLiveWriteContractError,
    );
    expect(() =>
      assertPhase5MLiveShadowResources(
        "drivers,trips,countries,cities,agents,customers,landmarks",
      ),
    ).toThrow(Phase5MLiveWriteContractError);
    expect(() => assertPhase5MLiveShadowResources("drivers")).not.toThrow();
    expect(PHASE_5M_LIVE_WRITE_CONTRACT.allowedResourcesCsv).toBe("drivers");
  });

  it("operator token survives scoped sanitization", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain("FIREBASE_ID_TOKEN");
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5M_DRIVER_PILOT_APPLY",
    );
    const captured = captureOperatorHarnessEnv({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "phase5m_keep_token",
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: undefined,
      PHASE5L_DRIVER_PILOT_DRY_RUN: undefined,
    });
    const env: Record<string, string | undefined> = {
      PHASE5M_DRIVER_PILOT_APPLY: undefined,
      FIREBASE_ID_TOKEN: undefined,
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5M_DRIVER_PILOT_APPLY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5m_keep_token");
    expect(env.DRIVER_WRITE_ENABLED).toBeUndefined();
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBeUndefined();
  });

  it("normal test environment never retains write flags", () => {
    const captured = captureOperatorHarnessEnv({
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "tok",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      FINANCE_WRITE_ENABLED: "true",
    });
    const env: Record<string, string | undefined> = {
      PHASE5M_DRIVER_PILOT_APPLY: "1",
      FIREBASE_ID_TOKEN: "tok",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      PRODUCTION_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      FINANCE_WRITE_ENABLED: "true",
      AGENT_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    expect(env.PHASE5M_DRIVER_PILOT_APPLY).toBe("1");
  });

  it("apply helper never clears FIREBASE_ID_TOKEN; rejects SA JSON path", () => {
    process.env.FIREBASE_ID_TOKEN = "phase5m_keep_me";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/sa.json";
    applyPhase5MLiveProductionWriteEnvironment({
      capturedGates: {
        PHASE5M_DRIVER_PILOT_APPLY: "1",
        GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
        PRODUCTION_WRITE_ENABLED: "true",
        DRIVER_WRITE_ENABLED: "true",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        GOOGLE_CLOUD_PROJECT: "tutorial-multi-language-70gx4j",
      },
    });
    expect(process.env.FIREBASE_ID_TOKEN).toBe("phase5m_keep_me");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED).toBe("false");
  });
});
