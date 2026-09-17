/**
 * Phase 5L — minimal Production live-read contract regressions.
 * No live Production calls in this file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadEnv, resetEnvCache } from "@/config/env";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import {
  assertPhase5LLiveReadContract,
  assertPhase5LLiveProjectFingerprint,
  isPhase5LLiveReadContractSatisfied,
  PHASE_5L_EXPECTED_PROJECT_ID,
  PHASE_5L_LIVE_READ_CONTRACT,
  PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES,
  Phase5LLiveReadContractError,
} from "@/application/controlled-writes/pilot/Phase5LLiveReadContract";
import { applyPhase5LLiveReadEnvironment } from "@/test/helpers/phase5lLiveReadEnvironment";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_PRESERVE_KEYS,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import {
  buildPhase5LSuperAdminActor,
  runPhase5LDriverPilotDryRun,
} from "@/application/controlled-writes/pilot/Phase5LDriverPilotDryRun";
import { createPhase5KFakeReadOnlyPorts } from "@/application/controlled-writes/pilot/Phase5KFakePorts";
import { PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import type { Phase5KRegistrySourceResult } from "@/application/controlled-writes/pilot/Phase5KRegistrySource";

const REGISTRY_OK: Phase5KRegistrySourceResult = {
  ok: true,
  uid: "phase5l_read_contract_fixture_uid",
  logicalFixtureNameMatch: true,
  provisioningStatusMatch: true,
  status: "pilot_ready",
  registryPath: ".local/phase5j-fixture/registry.json",
};

afterEach(() => {
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
  process.env.APP_ENV = "development";
  process.env.AUTH_MODE = "mock";
  process.env.EXPECTED_PROJECT_ID = "";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.GOOGLE_CLOUD_PROJECT = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED = "false";
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  resetEnvCache();
});

describe("Phase 5L — minimal live read contract", () => {
  it("contract is drivers only; unrelated resources listed as not-read", () => {
    expect(PHASE_5L_LIVE_SHADOW_ALLOWED_RESOURCES).toBe("drivers");
    expect([...PHASE_5L_LIVE_READ_CONTRACT.resources]).toEqual(["drivers"]);
    expect([...PHASE_5L_LIVE_READ_CONTRACT.notRead]).toEqual([
      "trips",
      "countries",
      "cities",
      "agents",
      "customers",
      "landmarks",
    ]);
    expect(PHASE_5L_EXPECTED_PROJECT_ID).toBe(
      "tutorial-multi-language-70gx4j",
    );
  });

  it("missing Phase 5L read contract → fail closed", () => {
    expect(() => assertPhase5LLiveReadContract("")).toThrow(
      Phase5LLiveReadContractError,
    );
    expect(() => assertPhase5LLiveReadContract(undefined)).toThrow(
      /missing|fail closed/i,
    );
    expect(isPhase5LLiveReadContractSatisfied("")).toBe(false);
  });

  it("unrelated resources are not allowed", () => {
    expect(() => assertPhase5LLiveReadContract("trips")).toThrow(
      Phase5LLiveReadContractError,
    );
    expect(() => assertPhase5LLiveReadContract("countries")).toThrow(
      Phase5LLiveReadContractError,
    );
    expect(() =>
      assertPhase5LLiveReadContract(
        "drivers,trips,countries,cities,agents,customers,landmarks",
      ),
    ).toThrow(Phase5LLiveReadContractError);
    expect(() => assertPhase5LLiveReadContract("drivers,trips")).toThrow(
      Phase5LLiveReadContractError,
    );
    expect(isPhase5LLiveReadContractSatisfied("agents")).toBe(false);
  });

  it("correct minimal read contract → loadEnv PASS", () => {
    const obs = join(
      process.cwd(),
      ".local",
      "phase5l-read-contract-unit",
      "observability.ndjson",
    );
    applyPhase5LLiveReadEnvironment({ observabilityFilePath: obs });
    assertPhase5LLiveReadContract(process.env.LIVE_SHADOW_ALLOWED_RESOURCES);

    const env = loadEnv();
    expect(env.APP_ENV).toBe("production");
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.PRODUCTION_READ_ENABLED).toBe(true);
    expect(env.PRODUCTION_READ_MODE).toBe("shadow");
    expect(env.EXPECTED_PROJECT_ID).toBe(PHASE_5L_EXPECTED_PROJECT_ID);
    expect(env.EXPECTED_ENVIRONMENT).toBe("production");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("drivers");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(PHASE_5L_EXPECTED_PROJECT_ID);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(() => assertLiveShadowStartupOrThrow(env)).not.toThrow();
  });

  it("write flag true → loadEnv accepts (routes still fail closed until GLOBAL+PRODUCTION armed)", () => {
    const obs = join(
      process.cwd(),
      ".local",
      "phase5l-read-contract-unit",
      "observability.ndjson",
    );
    applyPhase5LLiveReadEnvironment({ observabilityFilePath: obs });
    process.env.DRIVER_WRITE_ENABLED = "true";
    resetEnvCache();
    expect(() => loadEnv()).not.toThrow();
    expect(loadEnv().DRIVER_WRITE_ENABLED).toBe(true);
  });

  it("wrong project → deny", () => {
    expect(() =>
      assertPhase5LLiveProjectFingerprint({
        EXPECTED_PROJECT_ID: "wrong-project-id",
        GOOGLE_CLOUD_PROJECT: "wrong-project-id",
      }),
    ).toThrow(Phase5LLiveReadContractError);
    expect(() =>
      assertPhase5LLiveProjectFingerprint({
        EXPECTED_PROJECT_ID: PHASE_5L_EXPECTED_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: "wrong-project-id",
      }),
    ).toThrow(/GOOGLE_CLOUD_PROJECT/);
    expect(() =>
      assertPhase5LLiveProjectFingerprint({
        EXPECTED_PROJECT_ID: PHASE_5L_EXPECTED_PROJECT_ID,
        GOOGLE_CLOUD_PROJECT: PHASE_5L_EXPECTED_PROJECT_ID,
      }),
    ).not.toThrow();
  });

  it("operator token survives sanitization", () => {
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain("FIREBASE_ID_TOKEN");
    expect(OPERATOR_HARNESS_PRESERVE_KEYS).toContain(
      "PHASE5L_DRIVER_PILOT_DRY_RUN",
    );
    const captured = captureOperatorHarnessEnv({
      PHASE5L_DRIVER_PILOT_DRY_RUN: "1",
      FIREBASE_ID_TOKEN: "phase5l_unit_token_value",
      PHASE5G_LIVE_SYNTHETIC_DRIVER_INVENTORY: undefined,
      PHASE5I_SYNTHETIC_DRIVER_PROVISION_DRY_RUN: undefined,
      PHASE5J_PROVISION_SYNTHETIC_DRIVER: undefined,
      PHASE5K_VERIFY_PROVISIONED_DRIVER_FIXTURE: undefined,
    });
    const env: Record<string, string | undefined> = {
      PHASE5L_DRIVER_PILOT_DRY_RUN: undefined,
      FIREBASE_ID_TOKEN: undefined,
      DRIVER_WRITE_ENABLED: "true",
    };
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.PHASE5L_DRIVER_PILOT_DRY_RUN).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("phase5l_unit_token_value");
    expect(env.DRIVER_WRITE_ENABLED).toBeUndefined();
  });

  it("applyPhase5LLiveReadEnvironment never clears FIREBASE_ID_TOKEN; rejects SA JSON path", () => {
    process.env.FIREBASE_ID_TOKEN = "phase5l_keep_me";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/sa.json";
    const obs = join(
      process.cwd(),
      ".local",
      "phase5l-read-contract-unit",
      "observability.ndjson",
    );
    applyPhase5LLiveReadEnvironment({ observabilityFilePath: obs });
    expect(process.env.FIREBASE_ID_TOKEN).toBe("phase5l_keep_me");
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(process.env.SYNTHETIC_AUTH_FIXTURE_WRITE_ENABLED).toBe("false");
  });

  it("active trip → deny; pending_review → plan needs_changes; writes=0", async () => {
    const busy = {
      ...(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
        string,
        unknown
      >),
      on_trip: true,
    };
    const busyPorts = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      firestoreData: busy,
      preconditionToken: "tok",
    });
    const busyResult = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports: busyPorts,
      registryOverride: REGISTRY_OK,
    });
    expect(busyResult.summary.overallStatus).toBe(
      "PHASE5L_DRIVER_PILOT_DRY_RUN_NO_GO",
    );
    expect(busyResult.summary.denials).toEqual(
      expect.arrayContaining(["DRIVER_HAS_ACTIVE_TRIP"]),
    );
    expect(busyResult.summary.productionWrites).toBe(0);
    expect(busyResult.summary.authWrites).toBe(0);
    expect(busyResult.summary.financeWrites).toBe(0);
    expect(busyResult.summary.tripWrites).toBe(0);

    const okPorts = createPhase5KFakeReadOnlyPorts({
      uid: REGISTRY_OK.uid,
      preconditionToken: "tok_ok",
    });
    const ok = await runPhase5LDriverPilotDryRun({
      harnessArmed: true,
      actor: buildPhase5LSuperAdminActor(),
      ports: okPorts,
      registryOverride: REGISTRY_OK,
    });
    expect(ok.summary.overallStatus).toBe("PHASE5L_DRIVER_PILOT_DRY_RUN_PASS");
    expect(ok.summary.currentState).toBe("pending_review");
    expect(ok.summary.plannedState).toBe("needs_changes");
    expect(ok.summary.productionWrites).toBe(0);
    expect(ok.summary.authWrites).toBe(0);
    expect(ok.summary.financeWrites).toBe(0);
    expect(ok.summary.tripWrites).toBe(0);
    expect(ok.productionApplyInvoked).toBe(false);
  });
});
