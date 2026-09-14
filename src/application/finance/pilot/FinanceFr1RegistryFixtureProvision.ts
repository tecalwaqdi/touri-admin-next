/**
 * FR1 isolated registry fixture — REAL create-only provision orchestrator.
 *
 * preparation / dry-run / unarmed → 0 writes.
 * live_create + all gates + IAM/ADC + ports → create registry + idempotency (total 2).
 * Never writes order/, Settlement V2, finance_accounting_snapshots, Auth, domain surfaces.
 */

import {
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
  FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import { FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import {
  evaluateFinanceFr1SyntheticFixtureCreateGate,
  type FinanceFr1SyntheticFixtureCreateGateResult,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureCreateSemantics";
import type { FinanceFr1OperatorGateEnv } from "@/application/finance/pilot/FinanceFr1PilotGates";
import { assessFinanceFr1RegistryFixtureExistence } from "@/application/finance/pilot/FinanceFr1RegistryFixtureConsistency";
import {
  buildFinanceFr1RegistryFixtureIdempotencyDoc,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureIdempotencyDoc";
import {
  runFinanceFr1RegistryFixtureIamPreflight,
  type FinanceFr1RegistryFixtureIamPreflightResult,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureIamPreflight";
import type {
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureFirestorePort,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";
import {
  applyFinanceFr1AdcPrincipalSafeSummaryFields,
  emptyFinanceFr1RegistryFixtureProvisionSafeSummary,
  type FinanceFr1RegistryFixtureProvisionSafeSummary,
} from "@/application/finance/pilot/FinanceFr1RegistryFixtureProvisionSummary";

export type FinanceFr1RegistryFixtureProvisionResult = {
  status:
    | "SKIPPED"
    | "REFUSED_PREP"
    | "REFUSED_GATES"
    | "IAM_PREFLIGHT_FAILED"
    | "FIXTURE_ALREADY_EXISTS"
    | "CONFLICT_NO_GO"
    | "VERIFICATION_FAILED"
    | "CREATED"
    | typeof FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS;
  productionWrites: number;
  writeCounts: {
    order: number;
    admin_next_finance_fr1_order_fixtures: number;
    finance_accounting_snapshots: number;
    finance_audit_events: number;
    admin_next_cw_idempotency: number;
    financial_settlements: number;
    settlement_payments: number;
    drivers: number;
    agents: number;
    customers: number;
    user: number;
    triggerSideEffectWrites: number;
    totalProductionWrites: number;
  };
  gate: FinanceFr1SyntheticFixtureCreateGateResult;
  iam?: FinanceFr1RegistryFixtureIamPreflightResult;
  registryPath: string;
  idempotencyPath: string;
  expectedAdcPrincipal: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL;
  requiredIam: typeof FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM;
  summary: FinanceFr1RegistryFixtureProvisionSafeSummary;
  message: string;
};

const ZERO_COUNTS = {
  order: 0 as const,
  admin_next_finance_fr1_order_fixtures: 0 as const,
  finance_accounting_snapshots: 0 as const,
  finance_audit_events: 0 as const,
  admin_next_cw_idempotency: 0 as const,
  financial_settlements: 0 as const,
  settlement_payments: 0 as const,
  drivers: 0 as const,
  agents: 0 as const,
  customers: 0 as const,
  user: 0 as const,
  triggerSideEffectWrites: 0 as const,
  totalProductionWrites: 0 as const,
};

function readTarget(env: FinanceFr1OperatorGateEnv): "registry" | "order" {
  return env.TARGET === "registry" ? "registry" : "order";
}

function readDocumentId(env: FinanceFr1OperatorGateEnv): string {
  return (
    env.DOCUMENT_ID?.trim() ||
    FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID
  );
}

function readIdempotencyKey(env: FinanceFr1OperatorGateEnv): string {
  return (
    env.IDEMPOTENCY_KEY?.trim() ||
    FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY
  );
}

function forbiddenZero(
  port: FinanceFr1RegistryFixtureFirestorePort | undefined,
): boolean {
  if (!port) return true;
  const f = port.forbiddenTouchCounts();
  return Object.values(f).every((n) => n === 0);
}

/**
 * Provision entry.
 * - preparation: never mutates
 * - live_create without ports: evaluates gates/existence; refuses mutation (no ADC)
 * - live_create with ports: REAL create-only path (offline fake or Firebase)
 */
export async function runFinanceFr1RegistryFixtureProvision(input: {
  mode: "preparation" | "live_create";
  env?: FinanceFr1OperatorGateEnv;
  /** When true, skip existence probe via ports and force already-exists gate. */
  documentAlreadyExists?: boolean;
  firestorePort?: FinanceFr1RegistryFixtureFirestorePort;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  /** Skip live IAM/ADC network when using injected offline fakes. */
  skipIamPreflight?: boolean;
  nowUtc?: string;
}): Promise<FinanceFr1RegistryFixtureProvisionResult> {
  const env = input.env ?? process.env;
  const harnessArmed = env[FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV] === "1";
  const writeFlagsAllFalse =
    env.DRIVER_WRITE_ENABLED !== "true" &&
    env.AGENT_WRITE_ENABLED !== "true" &&
    env.CUSTOMER_WRITE_ENABLED !== "true" &&
    env.GLOBAL_PRODUCTION_WRITE_ENABLED !== "true" &&
    env.PRODUCTION_WRITE_ENABLED !== "true";

  const target = readTarget(env);
  const documentId = readDocumentId(env);
  const idempotencyKey = readIdempotencyKey(env);
  const projectId =
    env.EXPECTED_PROJECT_ID?.trim() ||
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    "";

  const registryPath = `${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID}`;
  const idempotencyPath = `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY}`;

  const gate = evaluateFinanceFr1SyntheticFixtureCreateGate({
    FINANCE_FR1_CREATE_SYNTHETIC_ORDER_FIXTURE:
      env[FINANCE_FR1_SYNTHETIC_FIXTURE_CREATE_ENV],
    target,
    projectId: projectId || undefined,
    documentId,
    idempotencyKey,
    documentAlreadyExists: input.documentAlreadyExists === true,
    financeWriteEnabled: env.FINANCE_WRITE_ENABLED === "true",
    writeFlagsAllFalse,
    settlementV2Requested: false,
  });

  const base = {
    gate,
    registryPath,
    idempotencyPath,
    expectedAdcPrincipal: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_ADC_PRINCIPAL,
    requiredIam: FINANCE_FR1_SYNTHETIC_FIXTURE_REQUIRED_IAM,
  };

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_PREP",
      denials: ["preparation_mode"],
      blocker: "preparation_mode_no_mutation",
    });
    return {
      status: "REFUSED_PREP",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_PREPARATION,
      ...base,
      summary,
      message:
        "Registry fixture provision refused — preparation mode; Production writes=0",
    };
  }

  if (!gate.ok) {
    const status =
      gate.code === "FIXTURE_ALREADY_EXISTS"
        ? "FIXTURE_ALREADY_EXISTS"
        : harnessArmed
          ? "REFUSED_GATES"
          : "SKIPPED";
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: status,
      denials: [gate.code],
      blocker: gate.code,
    });
    if (status === "FIXTURE_ALREADY_EXISTS") {
      summary.fixtureAlreadyExists = true;
    }
    return {
      status,
      productionWrites: 0,
      writeCounts: ZERO_COUNTS,
      ...base,
      summary,
      message: gate.message,
    };
  }

  // Existence probe via ports when available.
  if (input.firestorePort) {
    const registrySnap = await input.firestorePort.getRegistryDoc();
    const idemSnap = await input.firestorePort.getIdempotencyDoc();
    const existence = assessFinanceFr1RegistryFixtureExistence({
      registryData: registrySnap.data,
      idempotencyData: idemSnap.data,
    });

    if (existence.kind === "consistent_both_exist") {
      const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
        harnessArmed,
        overallStatus: "FIXTURE_ALREADY_EXISTS",
        denials: [],
        blocker: null,
      });
      summary.fixtureAlreadyExists = true;
      summary.verificationPass = true;
      summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
      return {
        status: "FIXTURE_ALREADY_EXISTS",
        productionWrites: 0,
        writeCounts: ZERO_COUNTS,
        ...base,
        summary,
        message: "FIXTURE_ALREADY_EXISTS — consistent pair; 0 writes",
      };
    }

    if (existence.kind === "conflict") {
      const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
        harnessArmed,
        overallStatus: "CONFLICT_NO_GO",
        denials: [existence.reason],
        blocker: `conflict_${existence.reason}`,
      });
      summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
      return {
        status: "CONFLICT_NO_GO",
        productionWrites: 0,
        writeCounts: ZERO_COUNTS,
        ...base,
        summary,
        message: `CONFLICT_NO_GO — ${existence.reason}; 0 writes; never auto-repair`,
      };
    }
  } else if (input.documentAlreadyExists === true) {
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: "FIXTURE_ALREADY_EXISTS",
    });
    summary.fixtureAlreadyExists = true;
    return {
      status: "FIXTURE_ALREADY_EXISTS",
      productionWrites: 0,
      writeCounts: ZERO_COUNTS,
      ...base,
      summary,
      message: "FIXTURE_ALREADY_EXISTS — 0 writes (create-only, no overwrite)",
    };
  }

  // Without ports: structural gates open but no ADC mutation in this call.
  if (!input.firestorePort) {
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["firestore_port_not_provided"],
      blocker: "firestore_port_not_provided",
    });
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: ZERO_COUNTS,
      ...base,
      summary,
      message:
        "Registry create gates open but firestorePort not provided — no Production mutation",
    };
  }

  let iam: FinanceFr1RegistryFixtureIamPreflightResult | undefined;
  if (!input.skipIamPreflight) {
    iam = await runFinanceFr1RegistryFixtureIamPreflight({
      projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
      permissionTester: input.permissionTester,
      principalResolver: input.principalResolver,
    });
    if (!iam.ok) {
      const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
        harnessArmed,
        overallStatus: "IAM_PREFLIGHT_FAILED",
        denials: [iam.code],
        blocker: iam.code,
      });
      applyFinanceFr1AdcPrincipalSafeSummaryFields(summary, iam);
      return {
        status: "IAM_PREFLIGHT_FAILED",
        productionWrites: 0,
        writeCounts: ZERO_COUNTS,
        ...base,
        iam,
        summary,
        message: iam.message,
      };
    }
  } else {
    // Offline fake path: still require injected principal/IAM fakes to pass if provided.
    if (input.permissionTester || input.principalResolver) {
      iam = await runFinanceFr1RegistryFixtureIamPreflight({
        projectId: FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
        permissionTester: input.permissionTester,
        principalResolver: input.principalResolver,
      });
      if (!iam.ok) {
        const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
          harnessArmed,
          overallStatus: "IAM_PREFLIGHT_FAILED",
          denials: [iam.code],
          blocker: iam.code,
        });
        applyFinanceFr1AdcPrincipalSafeSummaryFields(summary, iam);
        return {
          status: "IAM_PREFLIGHT_FAILED",
          productionWrites: 0,
          writeCounts: ZERO_COUNTS,
          ...base,
          iam,
          summary,
          message: iam.message,
        };
      }
    }
  }

  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const registryPayload = {
    ...FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC,
  } as unknown as Record<string, unknown>;
  const idemPayload = buildFinanceFr1RegistryFixtureIdempotencyDoc(
    nowUtc,
  ) as unknown as Record<string, unknown>;

  const regCreate = await input.firestorePort.createRegistryDoc(registryPayload);
  if (!regCreate.ok) {
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus:
        regCreate.code === "ALREADY_EXISTS"
          ? "CONFLICT_NO_GO"
          : "REFUSED_GATES",
      denials: [regCreate.code],
      blocker: regCreate.message,
    });
    summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
    return {
      status:
        regCreate.code === "ALREADY_EXISTS" ? "CONFLICT_NO_GO" : "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: ZERO_COUNTS,
      ...base,
      iam,
      summary,
      message: `registry create refused: ${regCreate.message}`,
    };
  }

  const idemCreate =
    await input.firestorePort.createIdempotencyDoc(idemPayload);
  if (!idemCreate.ok) {
    // Partial: registry created, idempotency failed — NO-GO, never auto-repair.
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_registry_without_idempotency", idemCreate.code],
      blocker: "partial_after_registry_create",
    });
    summary.actualCreate = true;
    summary.fixtureCreated = true;
    summary.actualRegistryWrites = 1;
    summary.totalProductionWrites = 1;
    summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 1,
      writeCounts: {
        ...ZERO_COUNTS,
        admin_next_finance_fr1_order_fixtures: 1,
        totalProductionWrites: 1,
      },
      ...base,
      iam,
      summary,
      message:
        "CONFLICT_NO_GO — registry created but idempotency create failed; never auto-repair",
    };
  }

  // Post-write re-read verify.
  const registryAfter = await input.firestorePort.getRegistryDoc();
  const idemAfter = await input.firestorePort.getIdempotencyDoc();
  const verified = assessFinanceFr1RegistryFixtureExistence({
    registryData: registryAfter.data,
    idempotencyData: idemAfter.data,
  });

  if (verified.kind !== "consistent_both_exist") {
    const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
      harnessArmed,
      overallStatus: "VERIFICATION_FAILED",
      denials: [
        verified.kind === "conflict" ? verified.reason : "post_write_absent",
      ],
      blocker: "post_write_verification_failed",
    });
    summary.actualCreate = true;
    summary.fixtureCreated = true;
    summary.idempotencyCreated = true;
    summary.actualRegistryWrites = 1;
    summary.actualIdempotencyWrites = 1;
    summary.totalProductionWrites = 2;
    summary.verificationPass = false;
    summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: 2,
      writeCounts: FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
      ...base,
      iam,
      summary,
      message: "Post-write verification failed",
    };
  }

  const summary = emptyFinanceFr1RegistryFixtureProvisionSafeSummary({
    harnessArmed,
    overallStatus: FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
    denials: [],
    blocker: null,
  });
  summary.actualCreate = true;
  summary.fixtureCreated = true;
  summary.idempotencyCreated = true;
  summary.actualRegistryWrites = 1;
  summary.actualIdempotencyWrites = 1;
  summary.totalProductionWrites = 2;
  summary.verificationPass = true;
  summary.forbiddenWritesZero = forbiddenZero(input.firestorePort);
  if (iam?.ok) {
    applyFinanceFr1AdcPrincipalSafeSummaryFields(summary, iam);
  }

  return {
    status: FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
    productionWrites: 2,
    writeCounts: FINANCE_FR1_SYNTHETIC_FIXTURE_WRITE_COUNTS_REGISTRY_CREATE,
    ...base,
    iam,
    summary,
    message: FINANCE_FR1_REGISTRY_FIXTURE_PROVISION_PASS,
  };
}
