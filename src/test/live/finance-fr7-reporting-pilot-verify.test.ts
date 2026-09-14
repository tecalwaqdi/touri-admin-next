// @vitest-environment node
/**
 * Finance FR7 Reporting pilot — READ-ONLY live verification harness.
 * DEFAULT: SKIP unless FINANCE_FR7_REPORTING_PILOT_VERIFY=1.
 *
 * NEVER create/update/delete Firestore. NEVER arms FINANCE_WRITE_ENABLED.
 * NEVER mutates FR1–FR6 docs. totalProductionWrites must remain 0.
 *
 * Operator (ONE live read session — not this task):
 *   FINANCE_FR7_REPORTING_PILOT_VERIFY=1 \
 *   FINANCE_WRITE_ENABLED=false \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   SOURCE=fr1_fr6_read_only \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/finance-fr7-reporting-pilot-verify.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { verifyFinanceFr7GoldenReporting } from "@/application/finance/pilot/FinanceFr7PilotCalculator";
import {
  evaluateFinanceFr7LiveVerifyGates,
  isFinanceFr7ReportingPilotVerifyEnabled,
  type FinanceFr7OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr7PilotGates";
import {
  FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR7_EXPECTED_PROJECT_ID,
  FINANCE_FR7_PILOT_CLEANUP_COMMAND,
  FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  FINANCE_FR7_REPORTING_PILOT_PASS,
  FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV,
  FINANCE_FR7_SETTLEMENT_DOC_ID,
  FINANCE_FR7_SOURCE_SNAPSHOT_ID,
  FINANCE_FR7_VERIFY_SAFE_SUMMARY_PATH,
  FINANCE_FR7_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr7PilotIamDerivation";
import { createFirebaseFinanceFr7ReadOnlyFirestorePort } from "@/application/finance/pilot/FinanceFr7ReadOnlyFirestorePort";
import {
  createDefaultFinanceFr1RegistryFixtureAdcPrincipalResolver,
  createDefaultFinanceFr1RegistryFixtureIamTester,
  principalsMatchExact,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureIamPreflight";
import {
  applyOperatorHarnessEnvSanitization,
  captureOperatorHarnessEnv,
  OPERATOR_HARNESS_NEVER_PRESERVE_KEYS,
  type OperatorHarnessEnvMap,
} from "@/test/helpers/operatorHarnessEnvPreservation";
import { loadEnv, resetEnvCache, type AppEnvConfig } from "@/config/env";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";

const LIVE = isFinanceFr7ReportingPilotVerifyEnabled(
  process.env.FINANCE_FR7_REPORTING_PILOT_VERIFY,
);

const OPERATOR_LIVE_GATES = {
  FINANCE_FR7_REPORTING_PILOT_VERIFY:
    process.env.FINANCE_FR7_REPORTING_PILOT_VERIFY,
  FINANCE_WRITE_ENABLED: process.env.FINANCE_WRITE_ENABLED,
  GLOBAL_PRODUCTION_WRITE_ENABLED:
    process.env.GLOBAL_PRODUCTION_WRITE_ENABLED,
  PRODUCTION_WRITE_ENABLED: process.env.PRODUCTION_WRITE_ENABLED,
  DRIVER_WRITE_ENABLED: process.env.DRIVER_WRITE_ENABLED,
  AGENT_WRITE_ENABLED: process.env.AGENT_WRITE_ENABLED,
  CUSTOMER_WRITE_ENABLED: process.env.CUSTOMER_WRITE_ENABLED,
  EXPECTED_PROJECT_ID: process.env.EXPECTED_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  SOURCE: process.env.SOURCE,
  FIREBASE_ID_TOKEN: process.env.FIREBASE_ID_TOKEN,
  FINANCE_FR1_PILOT_APPLY: process.env.FINANCE_FR1_PILOT_APPLY,
  FINANCE_FR2_SETTLEMENT_PILOT_APPLY:
    process.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY:
    process.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY:
    process.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY,
  FINANCE_FR6_ADJUSTMENT_PILOT_APPLY:
    process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY,
} as const;

type FinanceFr7VerifySafeSummary = {
  overallStatus: string;
  harnessArmed: boolean;
  persistenceMode: "read_only_computed_models";
  productionWrites: 0;
  productionReads: number;
  firestoreMutations: 0;
  settlementId: string | null;
  sourceAccountingSnapshotId: string | null;
  currency: string | null;
  grossFareMinor: string | null;
  companyCommissionMinor: string | null;
  driverNetMinor: string | null;
  settlementAmountMinor: string | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  settlementStatus: string | null;
  reconciliationStatus: string | null;
  fr6AdjustmentMonetaryEffect: boolean | null;
  fr6SignedCompanyClaimImpactMinor: string | null;
  goldenMatch: boolean | null;
  expectedAdcPrincipal: typeof FINANCE_FR7_EXPECTED_ADC_PRINCIPAL;
  resolvedAdcPrincipal: string | null;
  adcPrincipalVerification: "PASS" | "FAIL" | "SKIPPED";
  requiredIamPermissions: typeof FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  writeCounts: typeof FINANCE_FR7_ZERO_WRITE_COUNTS;
  blocker: string | null;
  oneShotLiveReadCommand: string;
  cleanupCommand: string;
};

const reportDir = join(process.cwd(), ".local", "finance-fr7-pilot");
const reportPath = join(process.cwd(), FINANCE_FR7_VERIFY_SAFE_SUMMARY_PATH);

let report: FinanceFr7VerifySafeSummary = {
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
  harnessArmed: LIVE,
  persistenceMode: "read_only_computed_models",
  productionWrites: 0,
  productionReads: 0,
  firestoreMutations: 0,
  settlementId: null,
  sourceAccountingSnapshotId: null,
  currency: null,
  grossFareMinor: null,
  companyCommissionMinor: null,
  driverNetMinor: null,
  settlementAmountMinor: null,
  paidConfirmedMinor: null,
  outstandingMinor: null,
  settlementStatus: null,
  reconciliationStatus: null,
  fr6AdjustmentMonetaryEffect: null,
  fr6SignedCompanyClaimImpactMinor: null,
  goldenMatch: null,
  expectedAdcPrincipal: FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
  resolvedAdcPrincipal: null,
  adcPrincipalVerification: "SKIPPED",
  requiredIamPermissions: FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  writeCounts: { ...FINANCE_FR7_ZERO_WRITE_COUNTS },
  blocker: LIVE
    ? null
    : "PENDING_OPERATOR — FINANCE_FR7_REPORTING_PILOT_VERIFY!=1; live body not executed",
  oneShotLiveReadCommand: FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  cleanupCommand: FINANCE_FR7_PILOT_CLEANUP_COMMAND,
};

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const safeForDisk: FinanceFr7VerifySafeSummary = {
    ...report,
    oneShotLiveReadCommand: report.oneShotLiveReadCommand.replaceAll(
      "FIREBASE_ID_TOKEN",
      "[ID_TOKEN_ENV]",
    ),
    cleanupCommand: report.cleanupCommand.replaceAll(
      "FIREBASE_ID_TOKEN",
      "[ID_TOKEN_ENV]",
    ),
  };
  const serialized = JSON.stringify(safeForDisk, null, 2);
  expect(serialized).not.toMatch(/password|private_key|BEGIN PRIVATE/i);
  expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  expect(serialized).not.toMatch(/FIREBASE_ID_TOKEN/);
  writeFileSync(reportPath, serialized);
}

function disableWriteFlags(): void {
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.FINANCE_FR7_REPORTING_PILOT_VERIFY = "";
  process.env.FINANCE_FR1_PILOT_APPLY = "";
  process.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY = "";
  process.env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY = "";
  process.env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY = "";
  process.env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY = "";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.CUSTOMER_WRITE_ENABLED = "false";
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.AUTH_MODE = "mock";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.SOURCE = "";
  Object.assign(process.env, { NODE_ENV: "test" });
  resetEnvCache();
}

function applyFinanceFr7PilotLiveReadEnvironment(input: {
  capturedGates: typeof OPERATOR_LIVE_GATES;
  env?: OperatorHarnessEnvMap;
}): void {
  const env = input.env ?? process.env;
  const token = env.FIREBASE_ID_TOKEN;

  for (const [key, value] of Object.entries(input.capturedGates)) {
    if (value === undefined || value === "") continue;
    env[key] = value;
  }

  Object.assign(env, { NODE_ENV: "production" });
  env.APP_ENV = "production";
  env.NEXT_PUBLIC_APP_ENV = "production";
  env.EXPECTED_ENVIRONMENT = "production";
  env.AUTH_MODE = "verified_token";

  env.EXPECTED_PROJECT_ID =
    env.EXPECTED_PROJECT_ID?.trim() || FINANCE_FR7_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT =
    env.GOOGLE_CLOUD_PROJECT?.trim() || FINANCE_FR7_EXPECTED_PROJECT_ID;

  env.FINANCE_FR7_REPORTING_PILOT_VERIFY =
    env.FINANCE_FR7_REPORTING_PILOT_VERIFY?.trim() || "1";
  env.FINANCE_WRITE_ENABLED = "false";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  env.PRODUCTION_WRITE_ENABLED = "false";
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.SOURCE = "fr1_fr6_read_only";
  env.FINANCE_FR1_PILOT_APPLY = "";
  env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY = "";
  env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY = "";
  env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY = "";
  env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY = "";

  env.PRODUCTION_READ_ENABLED = "false";
  env.PRODUCTION_READ_MODE = "disabled";
  env.FULL_PII_SHADOW_ENABLED = "false";
  env.LIVE_SHADOW_ALLOWED_RESOURCES = "";

  delete env.GOOGLE_APPLICATION_CREDENTIALS;

  if (token !== undefined) {
    env.FIREBASE_ID_TOKEN = token;
  }

  resetEnvCache();
  resetProductionAuthSingletonsForTests();
}

function readGateEnv(
  env: OperatorHarnessEnvMap = process.env,
): FinanceFr7OperatorGateEnv {
  return {
    FINANCE_FR7_REPORTING_PILOT_VERIFY: env.FINANCE_FR7_REPORTING_PILOT_VERIFY,
    FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
    CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
    EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
    GOOGLE_CLOUD_PROJECT: env.GOOGLE_CLOUD_PROJECT,
    SOURCE: env.SOURCE,
    FIREBASE_ID_TOKEN: env.FIREBASE_ID_TOKEN,
    FINANCE_FR1_PILOT_APPLY: env.FINANCE_FR1_PILOT_APPLY,
    FINANCE_FR2_SETTLEMENT_PILOT_APPLY: env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY,
    FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY:
      env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY,
    FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY:
      env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY,
    FINANCE_FR6_ADJUSTMENT_PILOT_APPLY: env.FINANCE_FR6_ADJUSTMENT_PILOT_APPLY,
  };
}

function envForVerifiedActorResolution(env: AppEnvConfig): AppEnvConfig {
  return {
    ...env,
    PRODUCTION_WRITE_ENABLED: false,
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    AGENT_WRITE_ENABLED: false,
    CUSTOMER_WRITE_ENABLED: false,
    FINANCE_WRITE_ENABLED: false,
  };
}

async function runFr7ReadOnlyIamPreflight(): Promise<{
  ok: boolean;
  resolvedAdcPrincipal: string | null;
  adcPrincipalVerification: "PASS" | "FAIL";
  message: string;
}> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return {
      ok: false,
      resolvedAdcPrincipal: null,
      adcPrincipalVerification: "FAIL",
      message:
        "GOOGLE_APPLICATION_CREDENTIALS must be unset — ADC only; no SA keys",
    };
  }

  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      FINANCE_FR7_EXPECTED_PROJECT_ID,
    ).getCredentials();
  if (creds.projectId !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
    return {
      ok: false,
      resolvedAdcPrincipal: null,
      adcPrincipalVerification: "FAIL",
      message: "PROJECT_MISMATCH",
    };
  }

  const resolver =
    await createDefaultFinanceFr1RegistryFixtureAdcPrincipalResolver();
  const resolution = await resolver.resolvePrincipal();
  const resolved = resolution.principalEmail;
  if (!principalsMatchExact(resolved, FINANCE_FR7_EXPECTED_ADC_PRINCIPAL)) {
    return {
      ok: false,
      resolvedAdcPrincipal: resolved,
      adcPrincipalVerification: "FAIL",
      message: `ADC_PRINCIPAL_MISMATCH:expected=${FINANCE_FR7_EXPECTED_ADC_PRINCIPAL};got=${resolved}`,
    };
  }

  const tester = await createDefaultFinanceFr1RegistryFixtureIamTester();
  const grantedRaw = await tester.testIamPermissions({
    projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
    permissions: FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  });
  const missing = FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter(
    (p) => !grantedRaw.includes(p),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      resolvedAdcPrincipal: resolved,
      adcPrincipalVerification: "PASS",
      message: `IAM_PREFLIGHT_FAILED missing=${missing.join(",")}`,
    };
  }

  return {
    ok: true,
    resolvedAdcPrincipal: resolved!,
    adcPrincipalVerification: "PASS",
    message: "IAM_PREFLIGHT_PASS",
  };
}

describe("Finance FR7 Reporting pilot live verify (read-only)", () => {
  it("defaults to SKIP and never writes", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    expect(FINANCE_FR7_ZERO_WRITE_COUNTS.totalProductionWrites).toBe(0);
    if (!LIVE) {
      expect(report.overallStatus).toBe("SKIPPED");
      expect(report.productionWrites).toBe(0);
      writeSafeReport();
    }
  });

  it.runIf(LIVE)(
    "live read-only verify of FR1→FR6 golden reporting chain",
    async () => {
      const tokenBeforeEnv =
        OPERATOR_LIVE_GATES.FIREBASE_ID_TOKEN?.trim() ?? "";

      applyFinanceFr7PilotLiveReadEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });

      expect(process.env[FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV]).toBe("1");
      expect(process.env.FINANCE_WRITE_ENABLED).toBe("false");
      expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.AGENT_WRITE_ENABLED).toBe("false");
      expect(process.env.CUSTOMER_WRITE_ENABLED).toBe("false");
      expect(process.env.EXPECTED_PROJECT_ID).toBe(
        FINANCE_FR7_EXPECTED_PROJECT_ID,
      );
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(
        FINANCE_FR7_EXPECTED_PROJECT_ID,
      );
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();

      const gates = evaluateFinanceFr7LiveVerifyGates({
        env: readGateEnv(),
        mode: "live_verify",
      });
      if (!gates.allowed) {
        report = {
          ...report,
          overallStatus: "REFUSED_GATES",
          harnessArmed: true,
          productionWrites: 0,
          firestoreMutations: 0,
          blocker: `REFUSED_GATES:${gates.blockers.join(",")}`,
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const iam = await runFr7ReadOnlyIamPreflight();
      report.resolvedAdcPrincipal = iam.resolvedAdcPrincipal;
      report.adcPrincipalVerification = iam.adcPrincipalVerification;
      if (!iam.ok) {
        report = {
          ...report,
          overallStatus: "IAM_PREFLIGHT_FAILED",
          productionWrites: 0,
          firestoreMutations: 0,
          blocker: iam.message,
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const appEnv = loadEnv();
      expect(appEnv.FINANCE_WRITE_ENABLED).toBe(false);

      const token =
        tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
      if (!token) {
        report = {
          ...report,
          overallStatus: "TOKEN_MISSING",
          productionWrites: 0,
          firestoreMutations: 0,
          blocker: "FIREBASE_ID_TOKEN_missing",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const auth = await resolveProductionVerifiedActor(
        token,
        envForVerifiedActorResolution(appEnv),
      );
      if (!auth.ok) {
        report = {
          ...report,
          overallStatus: "ACTOR_RESOLVE_FAILED",
          productionWrites: 0,
          firestoreMutations: 0,
          blocker: auth.reason ?? "actor_resolve_failed",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const actorPermissions = auth.identity
        .permissions as FinancePermission[];

      const port = await createFirebaseFinanceFr7ReadOnlyFirestorePort({
        projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      });

      const snap = await port.getFr1SnapshotDoc();
      const sett = await port.getSettlementDoc();
      const pay = await port.getPaymentDoc();
      const adj = await port.getAdjustmentDoc();
      const counter = port.getCounter();

      expect(counter.productionWrites).toBe(0);
      expect(counter.firestoreMutations).toBe(0);

      if (!snap.exists || !snap.data) {
        report = {
          ...report,
          overallStatus: "NO-GO",
          productionWrites: 0,
          productionReads: counter.productionReads,
          firestoreMutations: 0,
          sourceAccountingSnapshotId: FINANCE_FR7_SOURCE_SNAPSHOT_ID,
          settlementId: FINANCE_FR7_SETTLEMENT_DOC_ID,
          blocker: "fr1_snapshot_missing",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }
      if (!sett.exists || !sett.data) {
        report = {
          ...report,
          overallStatus: "NO-GO",
          productionWrites: 0,
          productionReads: counter.productionReads,
          firestoreMutations: 0,
          sourceAccountingSnapshotId: FINANCE_FR7_SOURCE_SNAPSHOT_ID,
          settlementId: FINANCE_FR7_SETTLEMENT_DOC_ID,
          blocker: "fr2_settlement_missing",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const verified = verifyFinanceFr7GoldenReporting({
        snapshot: snap.data,
        settlement: sett.data,
        payment: pay.exists ? pay.data : null,
        adjustment: adj.exists ? adj.data : null,
        actorPermissions,
        useOfflineFixture: false,
      });

      expect(verified.productionWrites).toBe(0);
      expect(port.getCounter().productionWrites).toBe(0);
      expect(port.getCounter().firestoreMutations).toBe(0);

      const pass = verified.reportingStatus === "PASS" && verified.goldenMatch;

      report = {
        overallStatus: pass ? FINANCE_FR7_REPORTING_PILOT_PASS : "NO-GO",
        harnessArmed: true,
        persistenceMode: "read_only_computed_models",
        productionWrites: 0,
        productionReads: port.getCounter().productionReads,
        firestoreMutations: 0,
        settlementId: String(sett.data.id ?? FINANCE_FR7_SETTLEMENT_DOC_ID),
        sourceAccountingSnapshotId: String(
          sett.data.sourceAccountingSnapshotId ??
            FINANCE_FR7_SOURCE_SNAPSHOT_ID,
        ),
        currency: verified.currency,
        grossFareMinor: verified.grossFareMinor,
        companyCommissionMinor: verified.companyCommissionMinor,
        driverNetMinor: verified.driverNetMinor,
        settlementAmountMinor: verified.settlementAmountMinor,
        paidConfirmedMinor: verified.paidConfirmedMinor,
        outstandingMinor: verified.outstandingMinor,
        settlementStatus: verified.settlementStatus,
        reconciliationStatus: verified.reconciliationStatus,
        fr6AdjustmentMonetaryEffect: verified.fr6AdjustmentMonetaryEffect,
        fr6SignedCompanyClaimImpactMinor:
          verified.fr6SignedCompanyClaimImpactMinor,
        goldenMatch: verified.goldenMatch,
        expectedAdcPrincipal: FINANCE_FR7_EXPECTED_ADC_PRINCIPAL,
        resolvedAdcPrincipal: iam.resolvedAdcPrincipal,
        adcPrincipalVerification: iam.adcPrincipalVerification,
        requiredIamPermissions: FINANCE_FR7_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        writeCounts: { ...FINANCE_FR7_ZERO_WRITE_COUNTS },
        blocker: pass
          ? null
          : verified.blockers.join(",") || "golden_mismatch",
        oneShotLiveReadCommand: FINANCE_FR7_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
        cleanupCommand: FINANCE_FR7_PILOT_CLEANUP_COMMAND,
      };
      writeSafeReport();

      expect(report.productionWrites).toBe(0);
      expect(report.firestoreMutations).toBe(0);
      expect(pass).toBe(true);
    },
    180_000,
  );

  it("preserves FINANCE_FR7 verify arm through sanitization; never write flags", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR7_REPORTING_PILOT_VERIFY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR7_REPORTING_PILOT_VERIFY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("tok");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    void FINANCE_FR7_REPORTING_PILOT_VERIFY_ENV;
  });

  afterAll(() => {
    disableWriteFlags();
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });
});
