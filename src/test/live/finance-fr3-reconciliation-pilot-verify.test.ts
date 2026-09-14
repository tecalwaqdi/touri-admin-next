// @vitest-environment node
/**
 * Finance FR3 Reconciliation pilot — READ-ONLY live verification harness.
 * DEFAULT: SKIP unless FINANCE_FR3_RECON_PILOT_VERIFY=1.
 *
 * Reuses FR3 calculator/gates/constants + FR2 Production read adapters.
 * NEVER create/update/delete Firestore. NEVER arms FINANCE_WRITE_ENABLED.
 * NEVER mutates FR1 snapshot / FR2 settlement / order / payments.
 *
 * Operator (ONE live read session — not this task):
 *   FINANCE_FR3_RECON_PILOT_VERIFY=1 \
 *   FINANCE_WRITE_ENABLED=false \
 *   GLOBAL_PRODUCTION_WRITE_ENABLED=false \
 *   PRODUCTION_WRITE_ENABLED=false \
 *   DRIVER_WRITE_ENABLED=false \
 *   AGENT_WRITE_ENABLED=false \
 *   CUSTOMER_WRITE_ENABLED=false \
 *   EXPECTED_PROJECT_ID=tutorial-multi-language-70gx4j \
 *   GOOGLE_CLOUD_PROJECT=tutorial-multi-language-70gx4j \
 *   SOURCE=fr1_fr2_read_only \
 *   FIREBASE_ID_TOKEN='…' \
 *     npx vitest run src/test/live/finance-fr3-reconciliation-pilot-verify.test.ts
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { reconcileFinanceFr3SnapshotToSettlement } from "@/application/finance/pilot/FinanceFr3PilotCalculator";
import {
  evaluateFinanceFr3LiveVerifyGates,
  isFinanceFr3ReconPilotVerifyEnabled,
  type FinanceFr3OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr3PilotGates";
import {
  FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR3_EXPECTED_PROJECT_ID,
  FINANCE_FR3_PILOT_CLEANUP_COMMAND,
  FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  FINANCE_FR3_RECON_PILOT_PASS,
  FINANCE_FR3_RECON_PILOT_VERIFY_ENV,
  FINANCE_FR3_SETTLEMENT_DOC_ID,
  FINANCE_FR3_SOURCE_SNAPSHOT_ID,
  FINANCE_FR3_VERIFY_SAFE_SUMMARY_PATH,
  FINANCE_FR3_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr3PilotConstants";
import { FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS } from "@/application/finance/pilot/FinanceFr3PilotIamDerivation";
import { FINANCE_FR3_LOCKED_RECON_EXPECTATIONS } from "@/application/finance/pilot/FinanceFr3PilotDocuments";
import { createFirebaseFinanceFr2ApplyFirestorePort } from "@/application/finance/pilot/FinanceFr2ProductionWriteAdapters";
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

const LIVE = isFinanceFr3ReconPilotVerifyEnabled(
  process.env.FINANCE_FR3_RECON_PILOT_VERIFY,
);

/** Capture operator gates at module load — BEFORE beforeEach wipe. */
const OPERATOR_LIVE_GATES = {
  FINANCE_FR3_RECON_PILOT_VERIFY: process.env.FINANCE_FR3_RECON_PILOT_VERIFY,
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
} as const;

type FinanceFr3VerifySafeSummary = {
  overallStatus: string;
  harnessArmed: boolean;
  persistenceMode: "read_only_shadow";
  productionWrites: 0;
  productionReads: number;
  firestoreMutations: 0;
  settlementId: string | null;
  sourceAccountingSnapshotId: string | null;
  snapshotMatchesSettlement: boolean | null;
  currencyMatches: boolean | null;
  directionMatches: boolean | null;
  claimMatchesCommission: boolean | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  reconciliationStatus: "PASS" | "NO-GO" | null;
  reconciliationBlockers: string[];
  sourceIntegrityPass: boolean | null;
  idempotencyIntegrityPass: boolean | null;
  expectedAdcPrincipal: typeof FINANCE_FR3_EXPECTED_ADC_PRINCIPAL;
  resolvedAdcPrincipal: string | null;
  adcPrincipalVerification: "PASS" | "FAIL" | "SKIPPED";
  requiredIamPermissions: typeof FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS;
  writeCounts: typeof FINANCE_FR3_ZERO_WRITE_COUNTS;
  blocker: string | null;
  oneShotLiveReadCommand: string;
  cleanupCommand: string;
};

const reportDir = join(process.cwd(), ".local", "finance-fr3-pilot");
const reportPath = join(process.cwd(), FINANCE_FR3_VERIFY_SAFE_SUMMARY_PATH);

let report: FinanceFr3VerifySafeSummary = {
  overallStatus: LIVE ? "PENDING_OPERATOR" : "SKIPPED",
  harnessArmed: LIVE,
  persistenceMode: "read_only_shadow",
  productionWrites: 0,
  productionReads: 0,
  firestoreMutations: 0,
  settlementId: null,
  sourceAccountingSnapshotId: null,
  snapshotMatchesSettlement: null,
  currencyMatches: null,
  directionMatches: null,
  claimMatchesCommission: null,
  paidConfirmedMinor: null,
  outstandingMinor: null,
  reconciliationStatus: null,
  reconciliationBlockers: [],
  sourceIntegrityPass: null,
  idempotencyIntegrityPass: null,
  expectedAdcPrincipal: FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
  resolvedAdcPrincipal: null,
  adcPrincipalVerification: "SKIPPED",
  requiredIamPermissions: FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  writeCounts: { ...FINANCE_FR3_ZERO_WRITE_COUNTS },
  blocker: LIVE
    ? null
    : "PENDING_OPERATOR — FINANCE_FR3_RECON_PILOT_VERIFY!=1; live body not executed",
  oneShotLiveReadCommand: FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
  cleanupCommand: FINANCE_FR3_PILOT_CLEANUP_COMMAND,
};

function writeSafeReport(): void {
  mkdirSync(reportDir, { recursive: true });
  const safeForDisk: FinanceFr3VerifySafeSummary = {
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
  process.env.FINANCE_FR3_RECON_PILOT_VERIFY = "";
  process.env.FINANCE_FR1_PILOT_APPLY = "";
  process.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY = "";
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

/**
 * Re-apply operator live-read env. All write flags stay false.
 * Call ONLY when harness is armed.
 */
function applyFinanceFr3PilotLiveReadEnvironment(input: {
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
    env.EXPECTED_PROJECT_ID?.trim() || FINANCE_FR3_EXPECTED_PROJECT_ID;
  env.GOOGLE_CLOUD_PROJECT =
    env.GOOGLE_CLOUD_PROJECT?.trim() || FINANCE_FR3_EXPECTED_PROJECT_ID;

  env.FINANCE_FR3_RECON_PILOT_VERIFY =
    env.FINANCE_FR3_RECON_PILOT_VERIFY?.trim() || "1";
  env.FINANCE_WRITE_ENABLED = "false";
  env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  env.PRODUCTION_WRITE_ENABLED = "false";
  env.DRIVER_WRITE_ENABLED = "false";
  env.AGENT_WRITE_ENABLED = "false";
  env.CUSTOMER_WRITE_ENABLED = "false";
  env.SOURCE = "fr1_fr2_read_only";
  env.FINANCE_FR1_PILOT_APPLY = "";
  env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY = "";

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
): FinanceFr3OperatorGateEnv {
  return {
    FINANCE_FR3_RECON_PILOT_VERIFY: env.FINANCE_FR3_RECON_PILOT_VERIFY,
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

async function runFr3ReadOnlyIamPreflight(): Promise<{
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
      FINANCE_FR3_EXPECTED_PROJECT_ID,
    ).getCredentials();
  if (creds.projectId !== FINANCE_FR3_EXPECTED_PROJECT_ID) {
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
  if (!principalsMatchExact(resolved, FINANCE_FR3_EXPECTED_ADC_PRINCIPAL)) {
    return {
      ok: false,
      resolvedAdcPrincipal: resolved,
      adcPrincipalVerification: "FAIL",
      message: `ADC_PRINCIPAL_MISMATCH:expected=${FINANCE_FR3_EXPECTED_ADC_PRINCIPAL}`,
    };
  }

  const tester = await createDefaultFinanceFr1RegistryFixtureIamTester();
  const grantedRaw = await tester.testIamPermissions({
    projectId: FINANCE_FR3_EXPECTED_PROJECT_ID,
    permissions: FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
  });
  const missing = FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS.filter(
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

describe("Finance FR3 Reconciliation pilot verify harness (SKIP default; read-only when armed)", () => {
  afterAll(() => {
    disableWriteFlags();
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    try {
      writeSafeReport();
    } catch {
      /* ignore */
    }
  });

  it(
    "defaults SKIP; when armed runs FR1↔FR2 read-only reconciliation verify",
    async () => {
      expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);

      if (!LIVE) {
        const gates = evaluateFinanceFr3LiveVerifyGates({
          env: process.env,
          mode: "preparation",
        });
        expect(gates.allowed).toBe(false);
        expect(gates.expectedWrites.totalProductionWrites).toBe(0);
        report = {
          ...report,
          overallStatus: "PENDING_OPERATOR",
          harnessArmed: false,
          productionWrites: 0,
          firestoreMutations: 0,
          writeCounts: { ...FINANCE_FR3_ZERO_WRITE_COUNTS },
          blocker:
            "PENDING_OPERATOR — FINANCE_FR3_RECON_PILOT_VERIFY!=1; live body not executed",
        };
        writeSafeReport();
        return;
      }

      // Armed read-only path — write flags MUST remain false.
      const tokenBeforeEnv = process.env.FIREBASE_ID_TOKEN?.trim() ?? "";
      applyFinanceFr3PilotLiveReadEnvironment({
        capturedGates: OPERATOR_LIVE_GATES,
      });
      expect(process.env.FINANCE_FR3_RECON_PILOT_VERIFY).toBe("1");
      expect(process.env.FINANCE_WRITE_ENABLED).toBe("false");
      expect(process.env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.PRODUCTION_WRITE_ENABLED).toBe("false");
      expect(process.env.DRIVER_WRITE_ENABLED).toBe("false");
      expect(process.env.AGENT_WRITE_ENABLED).toBe("false");
      expect(process.env.CUSTOMER_WRITE_ENABLED).toBe("false");
      expect(process.env.SOURCE).toBe("fr1_fr2_read_only");
      expect(process.env.EXPECTED_PROJECT_ID).toBe(
        FINANCE_FR3_EXPECTED_PROJECT_ID,
      );
      expect(process.env.GOOGLE_CLOUD_PROJECT).toBe(
        FINANCE_FR3_EXPECTED_PROJECT_ID,
      );
      expect(process.env.FIREBASE_ID_TOKEN?.trim() ?? "").toBe(tokenBeforeEnv);
      expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
      expect(process.env.FINANCE_FR1_PILOT_APPLY).not.toBe("1");
      expect(process.env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY).not.toBe("1");

      const gateEnv = readGateEnv();
      const gates = evaluateFinanceFr3LiveVerifyGates({
        env: gateEnv,
        mode: "live_verify",
      });
      if (!gates.allowed) {
        report = {
          ...report,
          overallStatus: "REFUSED_GATES",
          harnessArmed: true,
          productionWrites: 0,
          firestoreMutations: 0,
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: gates.blockers,
          blocker: `REFUSED_GATES:${gates.blockers.join(",")}`,
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const iam = await runFr3ReadOnlyIamPreflight();
      report.resolvedAdcPrincipal = iam.resolvedAdcPrincipal;
      report.adcPrincipalVerification = iam.adcPrincipalVerification;
      if (!iam.ok) {
        report = {
          ...report,
          overallStatus: "IAM_PREFLIGHT_FAILED",
          productionWrites: 0,
          firestoreMutations: 0,
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: [iam.message],
          blocker: iam.message,
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const appEnv = loadEnv();
      expect(appEnv.FINANCE_WRITE_ENABLED).toBe(false);
      expect(appEnv.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
      expect(appEnv.PRODUCTION_WRITE_ENABLED).toBe(false);

      let actorPermissions: FinancePermission[] = ["finance:read"];
      let actorUserId = "finance_fr3_verify_actor";
      const token = tokenBeforeEnv || process.env.FIREBASE_ID_TOKEN?.trim() || "";
      if (!token) {
        report = {
          ...report,
          overallStatus: "TOKEN_MISSING",
          productionWrites: 0,
          firestoreMutations: 0,
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: ["FIREBASE_ID_TOKEN_missing"],
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
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: [auth.reason ?? "actor_resolve_failed"],
          blocker: auth.reason ?? "actor_resolve_failed",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }
      actorUserId = auth.identity.uid;
      actorPermissions = auth.identity.permissions as FinancePermission[];

      // Reuse FR2 Production adapter for reads only — never call create*.
      const port = await createFirebaseFinanceFr2ApplyFirestorePort({
        projectId: FINANCE_FR3_EXPECTED_PROJECT_ID,
      });

      const fr1Snap = await port.getFr1SnapshotDoc();
      const fr1Idem = await port.getFr1IdempotencyDoc();
      const fr2Sett = await port.getSettlementDoc();
      const fr2Idem = await port.getFr2IdempotencyDoc();

      const writesBefore = {
        settlement: port.counter.settlementWrites,
        auditIntent: port.counter.auditIntentWrites,
        auditResult: port.counter.auditResultWrites,
        idempotency: port.counter.idempotencyWrites,
      };
      expect(writesBefore).toEqual({
        settlement: 0,
        auditIntent: 0,
        auditResult: 0,
        idempotency: 0,
      });

      if (!fr1Snap.exists || !fr1Snap.data) {
        report = {
          ...report,
          overallStatus: "NO-GO",
          productionWrites: 0,
          productionReads: port.counter.productionReads,
          firestoreMutations: 0,
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: ["fr1_snapshot_missing"],
          sourceAccountingSnapshotId: FINANCE_FR3_SOURCE_SNAPSHOT_ID,
          settlementId: FINANCE_FR3_SETTLEMENT_DOC_ID,
          blocker: "fr1_snapshot_missing",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }
      if (!fr2Sett.exists || !fr2Sett.data) {
        report = {
          ...report,
          overallStatus: "NO-GO",
          productionWrites: 0,
          productionReads: port.counter.productionReads,
          firestoreMutations: 0,
          reconciliationStatus: "NO-GO",
          reconciliationBlockers: ["fr2_settlement_missing"],
          sourceAccountingSnapshotId: FINANCE_FR3_SOURCE_SNAPSHOT_ID,
          settlementId: FINANCE_FR3_SETTLEMENT_DOC_ID,
          blocker: "fr2_settlement_missing",
        };
        writeSafeReport();
        expect(report.productionWrites).toBe(0);
        return;
      }

      const recon = reconcileFinanceFr3SnapshotToSettlement({
        snapshot: fr1Snap.data,
        settlement: fr2Sett.data,
        fr1Idempotency: fr1Idem.exists ? fr1Idem.data : null,
        fr2Idempotency: fr2Idem.exists ? fr2Idem.data : null,
        actorUserId,
        actorPermissions,
      });

      const writesAfter = {
        settlement: port.counter.settlementWrites,
        auditIntent: port.counter.auditIntentWrites,
        auditResult: port.counter.auditResultWrites,
        idempotency: port.counter.idempotencyWrites,
      };
      expect(writesAfter).toEqual({
        settlement: 0,
        auditIntent: 0,
        auditResult: 0,
        idempotency: 0,
      });
      expect(recon.productionWrites).toBe(0);
      expect(recon.shadowOnly).toBe(true);

      const pass =
        recon.reconciliationStatus === "PASS" &&
        recon.snapshotMatchesSettlement === true &&
        recon.currencyMatches === true &&
        recon.directionMatches === true &&
        recon.claimMatchesCommission === true &&
        recon.paidConfirmedMinor === "0" &&
        recon.outstandingMinor === "1500" &&
        recon.sourceIntegrityPass === true &&
        recon.idempotencyIntegrityPass === true &&
        recon.reconciliationBlockers.length === 0;

      report = {
        overallStatus: pass
          ? FINANCE_FR3_RECON_PILOT_PASS
          : "NO-GO",
        harnessArmed: true,
        persistenceMode: "read_only_shadow",
        productionWrites: 0,
        productionReads: port.counter.productionReads,
        firestoreMutations: 0,
        settlementId: String(fr2Sett.data.id ?? FINANCE_FR3_SETTLEMENT_DOC_ID),
        sourceAccountingSnapshotId: String(
          fr2Sett.data.sourceAccountingSnapshotId ??
            FINANCE_FR3_SOURCE_SNAPSHOT_ID,
        ),
        snapshotMatchesSettlement: recon.snapshotMatchesSettlement,
        currencyMatches: recon.currencyMatches,
        directionMatches: recon.directionMatches,
        claimMatchesCommission: recon.claimMatchesCommission,
        paidConfirmedMinor: recon.paidConfirmedMinor,
        outstandingMinor: recon.outstandingMinor,
        reconciliationStatus: recon.reconciliationStatus,
        reconciliationBlockers: recon.reconciliationBlockers,
        sourceIntegrityPass: recon.sourceIntegrityPass,
        idempotencyIntegrityPass: recon.idempotencyIntegrityPass,
        expectedAdcPrincipal: FINANCE_FR3_EXPECTED_ADC_PRINCIPAL,
        resolvedAdcPrincipal: iam.resolvedAdcPrincipal,
        adcPrincipalVerification: iam.adcPrincipalVerification,
        requiredIamPermissions: FINANCE_FR3_REQUIRED_OPERATOR_IAM_PERMISSIONS,
        writeCounts: { ...FINANCE_FR3_ZERO_WRITE_COUNTS },
        blocker: pass
          ? null
          : `recon_NO-GO:${recon.reconciliationBlockers.join(",")}`,
        oneShotLiveReadCommand: FINANCE_FR3_PILOT_ONE_SHOT_LIVE_READ_COMMAND,
        cleanupCommand: FINANCE_FR3_PILOT_CLEANUP_COMMAND,
      };
      writeSafeReport();

      expect([
        FINANCE_FR3_RECON_PILOT_PASS,
        "NO-GO",
        "IAM_PREFLIGHT_FAILED",
        "REFUSED_GATES",
        "TOKEN_MISSING",
        "ACTOR_RESOLVE_FAILED",
      ]).toContain(report.overallStatus);
      expect(report.productionWrites).toBe(0);
      expect(report.firestoreMutations).toBe(0);
      expect(report.writeCounts.totalProductionWrites).toBe(0);

      if (report.overallStatus === FINANCE_FR3_RECON_PILOT_PASS) {
        expect(report.snapshotMatchesSettlement).toBe(
          FINANCE_FR3_LOCKED_RECON_EXPECTATIONS.snapshotMatchesSettlement,
        );
        expect(report.currencyMatches).toBe(true);
        expect(report.directionMatches).toBe(true);
        expect(report.claimMatchesCommission).toBe(true);
        expect(report.paidConfirmedMinor).toBe("0");
        expect(report.outstandingMinor).toBe("1500");
        expect(report.reconciliationStatus).toBe("PASS");
        expect(report.reconciliationBlockers).toEqual([]);
        expect(report.sourceIntegrityPass).toBe(true);
        expect(report.idempotencyIntegrityPass).toBe(true);
        expect(report.settlementId).toBe(FINANCE_FR3_SETTLEMENT_DOC_ID);
        expect(report.sourceAccountingSnapshotId).toBe(
          FINANCE_FR3_SOURCE_SNAPSHOT_ID,
        );
      }
    },
    180_000,
  );

  it("preserves FINANCE_FR3 verify arm through sanitization; never write flags", () => {
    const env: Record<string, string | undefined> = {
      FINANCE_FR3_RECON_PILOT_VERIFY: "1",
      FINANCE_WRITE_ENABLED: "true",
      DRIVER_WRITE_ENABLED: "true",
      GLOBAL_PRODUCTION_WRITE_ENABLED: "true",
      FIREBASE_ID_TOKEN: "tok",
    };
    const captured = captureOperatorHarnessEnv(env);
    applyOperatorHarnessEnvSanitization(captured, env);
    expect(env.FINANCE_FR3_RECON_PILOT_VERIFY).toBe("1");
    expect(env.FIREBASE_ID_TOKEN).toBe("tok");
    for (const key of OPERATOR_HARNESS_NEVER_PRESERVE_KEYS) {
      expect(env[key]).toBeUndefined();
    }
    void FINANCE_FR3_RECON_PILOT_VERIFY_ENV;
  });
});
