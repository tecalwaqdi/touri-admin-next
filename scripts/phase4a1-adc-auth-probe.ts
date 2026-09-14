/**
 * Ephemeral ADC Auth Client + fingerprint probe (no Firestore data queries).
 * Always disables Production Read before exit.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out: Record<string, unknown> = {
  step: "adc_auth_client_probe",
  status: "UNKNOWN",
  projectId: null,
  authClientReady: false,
  firestoreDataQueries: 0,
  errorCode: null,
  errorSafe: null,
};

const PROJECT_ID = "tutorial-multi-language-70gx4j";
const prev = { ...process.env };
mkdirSync(".local/phase4a1-live", { recursive: true });

async function main() {
  try {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.APP_ENV = "production";
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.AUTH_MODE = "verified_token";
    process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
    process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
    process.env.EXPECTED_ENVIRONMENT = "production";
    process.env.PRODUCTION_READ_MODE = "shadow";
    process.env.PRODUCTION_READ_ENABLED = "false";
    process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
    process.env.FULL_PII_SHADOW_ENABLED = "false";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    process.env.FINANCE_WRITE_ENABLED = "false";
    process.env.DRIVER_WRITE_ENABLED = "false";
    process.env.AGENT_WRITE_ENABLED = "false";
    process.env.PRODUCTION_READ_OBSERVABILITY_SINK = "file_ndjson";
    process.env.PRODUCTION_READ_OBSERVABILITY_FILE = join(
      process.cwd(),
      ".local/phase4a1-live/probe-obs.ndjson",
    );

    const { resetEnvCache, loadEnv } = await import("../src/config/env");
    resetEnvCache();
    const env = loadEnv();

    const { ApplicationDefaultProductionCredentialProvider } = await import(
      "../src/infrastructure/production/credentials/ProductionCredentialProvider"
    );
    const { FirebaseAdminFactory } = await import(
      "../src/infrastructure/production/firebase/FirebaseAdminFactory"
    );
    const { createProductionReadObservability } = await import(
      "../src/infrastructure/production/ObservabilityEvents"
    );
    FirebaseAdminFactory.resetSingletonForTests();

    const obs = createProductionReadObservability({
      sink: "file_ndjson",
      filePath: process.env.PRODUCTION_READ_OBSERVABILITY_FILE,
    });

    const factory = new FirebaseAdminFactory({
      env: {
        APP_ENV: env.APP_ENV,
        AUTH_MODE: env.AUTH_MODE,
        PRODUCTION_READ_ENABLED: env.PRODUCTION_READ_ENABLED,
        PRODUCTION_READ_MODE: env.PRODUCTION_READ_MODE,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
        DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
        AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
        EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
        EXPECTED_ENVIRONMENT: env.EXPECTED_ENVIRONMENT,
      },
      credentialProvider: new ApplicationDefaultProductionCredentialProvider(
        PROJECT_ID,
      ),
      observability: obs,
    });

    const authClient = await factory.getAuthClient();
    out.authClientReady = typeof authClient.verifyIdToken === "function";

    let killOk = false;
    try {
      await factory.getApp();
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : null;
      killOk = code === "PRODUCTION_READ_DISABLED";
      if (!killOk) out.errorCode = code ?? "UNKNOWN";
    }
    out.killSwitchDeniedGetAppWhileDisabled = killOk;

    process.env.PRODUCTION_READ_ENABLED = "true";
    process.env.PRODUCTION_READ_MODE = "shadow";
    process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "countries";
    resetEnvCache();
    const env2 = loadEnv();
    const { assertLiveShadowStartupOrThrow } = await import(
      "../src/infrastructure/production/ops/LiveShadowStartupGuard"
    );
    assertLiveShadowStartupOrThrow(env2);

    FirebaseAdminFactory.resetSingletonForTests();
    const factory2 = new FirebaseAdminFactory({
      env: {
        APP_ENV: env2.APP_ENV,
        AUTH_MODE: env2.AUTH_MODE,
        PRODUCTION_READ_ENABLED: env2.PRODUCTION_READ_ENABLED,
        PRODUCTION_READ_MODE: env2.PRODUCTION_READ_MODE,
        PRODUCTION_WRITE_ENABLED: env2.PRODUCTION_WRITE_ENABLED,
        GLOBAL_PRODUCTION_WRITE_ENABLED: env2.GLOBAL_PRODUCTION_WRITE_ENABLED,
        FINANCE_WRITE_ENABLED: env2.FINANCE_WRITE_ENABLED,
        DRIVER_WRITE_ENABLED: env2.DRIVER_WRITE_ENABLED,
        AGENT_WRITE_ENABLED: env2.AGENT_WRITE_ENABLED,
        EXPECTED_PROJECT_ID: env2.EXPECTED_PROJECT_ID,
        EXPECTED_ENVIRONMENT: env2.EXPECTED_ENVIRONMENT,
      },
      credentialProvider: new ApplicationDefaultProductionCredentialProvider(
        PROJECT_ID,
      ),
      observability: obs,
    });
    const app = await factory2.getApp();
    out.projectId = app.projectId;
    if (app.projectId !== PROJECT_ID) {
      out.status = "FAIL";
      out.errorCode = "PROJECT_FINGERPRINT_MISMATCH";
      return;
    }

    let invalidDenied = false;
    try {
      await authClient.verifyIdToken("not-a-real-token", true);
    } catch {
      invalidDenied = true;
    }
    out.invalidTokenDenied = invalidDenied;

    out.status =
      out.authClientReady && killOk && out.projectId === PROJECT_ID && invalidDenied
        ? "PASS"
        : "FAIL";
  } catch (e: unknown) {
    out.status = "FAIL";
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : e instanceof Error
          ? e.name
          : "ERROR";
    out.errorCode = code;
    const msg = e instanceof Error ? e.message : String(e);
    out.errorSafe = /private_key|BEGIN PRIVATE|eyJ/.test(msg)
      ? "redacted"
      : msg.slice(0, 240);
  } finally {
    process.env.PRODUCTION_READ_ENABLED = "false";
    process.env.PRODUCTION_READ_MODE = "disabled";
    process.env.LIVE_SHADOW_ALLOWED_RESOURCES = "";
    process.env.PRODUCTION_WRITE_ENABLED = "false";
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
    process.env.FINANCE_WRITE_ENABLED = "false";
    process.env.DRIVER_WRITE_ENABLED = "false";
    process.env.AGENT_WRITE_ENABLED = "false";
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
    writeFileSync(
      ".local/phase4a1-live/adc-auth-probe.json",
      `${JSON.stringify(out, null, 2)}\n`,
    );
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out));
  }
}

main();
