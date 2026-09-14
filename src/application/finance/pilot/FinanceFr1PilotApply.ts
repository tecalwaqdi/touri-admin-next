/**
 * FR1 Finance Pilot live apply — REAL operator-controlled 4-write path.
 *
 * Requires:
 * - FINANCE_FR1_PILOT_APPLY=1
 * - FINANCE_FR1_REGISTRY_PILOT=1
 * - FINANCE_WRITE_ENABLED=true (independent; GLOBAL/PRODUCTION stay false)
 * - SOURCE=registry
 * - verified actor + Finance RBAC
 * - ADC principal + IAM preflight
 * - approved registry fixture only (no real order docs)
 *
 * Writes (exactly 4 on first apply):
 * 1. finance_audit_events INTENT
 * 2. finance_accounting_snapshots create-only
 * 3. admin_next_cw_idempotency create
 * 4. finance_audit_events RESULT
 *
 * Rerun → ALREADY_APPLIED (0). Partial/conflict → NO-GO (no auto-repair).
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  calculateFinanceFr1PilotSnapshot,
  type FinanceFr1CalculatedSnapshot,
} from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import {
  FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR1_EXPECTED_WRITE_COUNTS,
  FINANCE_FR1_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  actorHasFinanceFr1Rbac,
  evaluateFinanceFr1LiveArmGates,
  type FinanceFr1OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr1PilotGates";
import {
  assertCalculatedMatchesLockedFixture,
  buildFinanceFr1PilotAuditIntentDoc,
  buildFinanceFr1PilotAuditResultDoc,
  buildFinanceFr1PilotIdempotencyDoc,
  buildFinanceFr1PilotSnapshotDoc,
  isConsistentFinanceFr1PilotAppliedState,
} from "@/application/finance/pilot/FinanceFr1PilotDocuments";
import { runFinanceFr1PilotIamPreflight } from "@/application/finance/pilot/FinanceFr1PilotIamPreflight";
import {
  mapRegistryFixtureToFinanceFr1Candidate,
} from "@/application/finance/pilot/FinanceFr1RegistryCanonicalInput";
import type { FinanceFr1SyntheticFixtureRegistryDoc } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureSchema";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  emptyFinanceFr1ApplySafeSummary,
  FINANCE_FR1_PILOT_PASS,
  type FinanceFr1ApplySafeSummary,
  type FinanceFr1CalculatedSnapshotSummary,
} from "@/application/finance/pilot/FinanceFr1ApplySafeSummary";
import {
  financeFr1ApplyForbiddenWritesZero,
  financeFr1ApplyTotalWrites,
  type FinanceFr1ApplyActor,
  type FinanceFr1ApplyActorResolver,
  type FinanceFr1ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr1ApplyPorts";
import type {
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr1PilotApplyResult = {
  status:
    | "SKIPPED"
    | "REFUSED_PREP"
    | "REFUSED_GATES"
    | "IAM_PREFLIGHT_FAILED"
    | "ALREADY_APPLIED"
    | "CONFLICT_NO_GO"
    | "VERIFICATION_FAILED"
    | typeof FINANCE_FR1_PILOT_PASS;
  productionWrites: number;
  writeCounts:
    | typeof FINANCE_FR1_ZERO_WRITE_COUNTS
    | typeof FINANCE_FR1_EXPECTED_WRITE_COUNTS
    | typeof FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS
    | {
        finance_accounting_snapshots: number;
        finance_audit_events: number;
        admin_next_cw_idempotency: number;
        order: number;
        financial_settlements: number;
        settlement_payments: number;
        drivers: number;
        agents: number;
        customers: number;
        totalProductionWrites: number;
      };
  blockers: string[];
  snapshotId: string | null;
  message: string;
  summary: FinanceFr1ApplySafeSummary;
};

function toSnapshotSummary(
  calculated: FinanceFr1CalculatedSnapshot,
): FinanceFr1CalculatedSnapshotSummary {
  return {
    orderId: calculated.orderId,
    currency: calculated.currency,
    paymentMethod: calculated.paymentMethod,
    grossFareMinor: calculated.grossFareMinor,
    eligibleRevenueMinor: calculated.eligibleRevenueMinor,
    commissionRatePercent: calculated.commissionRatePercent,
    commissionAmountMinor: calculated.commissionAmountPersistedMinor,
    driverDeductionsMinor: calculated.driverDeductionsMinor,
    driverNetMinor: calculated.driverNetMinor,
    historicalReRateForbidden: true,
    mutatesOrderMajors: false,
  };
}

function writeCountsFromPort(
  port: FinanceFr1ApplyFirestorePort | undefined,
  alreadyApplied: boolean,
): {
  finance_accounting_snapshots: number;
  finance_audit_events: number;
  admin_next_cw_idempotency: number;
  order: number;
  financial_settlements: number;
  settlement_payments: number;
  drivers: number;
  agents: number;
  customers: number;
  totalProductionWrites: number;
} {
  if (alreadyApplied || !port) {
    return alreadyApplied
      ? { ...FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS }
      : { ...FINANCE_FR1_ZERO_WRITE_COUNTS };
  }
  const c = port.counter;
  return {
    finance_accounting_snapshots: c.snapshotWrites,
    finance_audit_events: c.auditIntentWrites + c.auditResultWrites,
    admin_next_cw_idempotency: c.idempotencyWrites,
    order: c.orderWrites,
    financial_settlements: c.settlementWrites,
    settlement_payments: 0,
    drivers: c.driverWrites,
    agents: c.agentWrites,
    customers: c.customerWrites,
    totalProductionWrites: financeFr1ApplyTotalWrites(c),
  };
}

function applyCounterToSummary(
  summary: FinanceFr1ApplySafeSummary,
  port: FinanceFr1ApplyFirestorePort | undefined,
): void {
  if (!port) return;
  const c = port.counter;
  summary.actualSnapshotWrites = c.snapshotWrites;
  summary.actualAuditIntentWrites = c.auditIntentWrites;
  summary.actualAuditResultWrites = c.auditResultWrites;
  summary.actualIdempotencyWrites = c.idempotencyWrites;
  summary.totalProductionWrites = financeFr1ApplyTotalWrites(c);
  summary.orderWrites = c.orderWrites;
  summary.settlementWrites = c.settlementWrites;
  summary.driverWrites = c.driverWrites;
  summary.agentWrites = c.agentWrites;
  summary.customerWrites = c.customerWrites;
  summary.authWrites = c.authWrites;
  summary.forbiddenWritesZero = financeFr1ApplyForbiddenWritesZero(c);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function verifyPostApply(input: {
  port: FinanceFr1ApplyFirestorePort;
  auditIntentId: string;
  auditResultId: string;
  registryBefore: Record<string, unknown> | null;
  orderExistedBefore: boolean;
}): Promise<{ ok: boolean; denials: string[] }> {
  return (async () => {
    const denials: string[] = [];
    const snap = await input.port.getSnapshotDoc();
    const idem = await input.port.getIdempotencyDoc();
    const intent = await input.port.getAuditDoc(input.auditIntentId);
    const result = await input.port.getAuditDoc(input.auditResultId);
    const registry = await input.port.getRegistryDoc();
    const order = await input.port.getOrderDoc();

    if (!isConsistentFinanceFr1PilotAppliedState({
      snapshot: snap.data,
      idempotency: idem.data,
    })) {
      denials.push("post_verify_snapshot_or_idempotency_mismatch");
    }
    if (!intent.exists || intent.data?.action !== "snapshot.materialize.intent") {
      denials.push("post_verify_audit_intent_missing");
    }
    if (
      !result.exists ||
      result.data?.action !== "snapshot.materialize.result" ||
      result.data?.outcome !== "applied"
    ) {
      denials.push("post_verify_audit_result_missing");
    }
    if (
      idem.data &&
      (idem.data.auditIntentId !== input.auditIntentId ||
        idem.data.auditResultId !== input.auditResultId)
    ) {
      denials.push("post_verify_idempotency_audit_ids_mismatch");
    }
    // Fixture must remain unchanged (same key fields).
    if (!registry.exists) {
      denials.push("post_verify_registry_missing");
    } else if (
      input.registryBefore &&
      JSON.stringify(registry.data?.orderId) !==
        JSON.stringify(input.registryBefore.orderId)
    ) {
      denials.push("post_verify_registry_mutated");
    }
    if (order.exists !== input.orderExistedBefore) {
      denials.push("post_verify_order_collection_changed");
    }
    if (!financeFr1ApplyForbiddenWritesZero(input.port.counter)) {
      denials.push("post_verify_forbidden_writes_nonzero");
    }
    if (financeFr1ApplyTotalWrites(input.port.counter) !== 4) {
      denials.push(
        `post_verify_write_count!=4_got_${financeFr1ApplyTotalWrites(input.port.counter)}`,
      );
    }
    return { ok: denials.length === 0, denials };
  })();
}

/**
 * Live apply entry.
 * - preparation: never mutates
 * - live_apply without ports/execute: evaluates gates; refuses mutation
 * - live_apply with ports + executeApply: REAL 4-write path (fake or Firebase)
 */
export async function runFinanceFr1PilotApply(input: {
  mode: "preparation" | "live_apply";
  env?: FinanceFr1OperatorGateEnv;
  calculated?: FinanceFr1CalculatedSnapshot | null;
  priorSnapshotExists?: boolean;
  /** When true, execute writes after gates/IAM/actor/calc pass. */
  executeApply?: boolean;
  firestorePort?: FinanceFr1ApplyFirestorePort;
  actorResolver?: FinanceFr1ApplyActorResolver;
  /** Injected actor for offline tests (skips token resolver). */
  actor?: FinanceFr1ApplyActor | null;
  firebaseIdToken?: string | null;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  skipIamPreflight?: boolean;
  /** Injected registry doc for offline tests. */
  registryDoc?: FinanceFr1SyntheticFixtureRegistryDoc | null;
  nowUtc?: string;
}): Promise<FinanceFr1PilotApplyResult> {
  const env = input.env ?? process.env;
  const harnessArmed = env.FINANCE_FR1_PILOT_APPLY === "1";
  const gates = evaluateFinanceFr1LiveArmGates({
    env,
    mode: input.mode,
  });

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_PREP",
      denials: ["preparation_mode"],
      blocker: "preparation_mode_no_live_write",
    });
    return {
      status: "REFUSED_PREP",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      snapshotId: null,
      message:
        "FR1 pilot apply refused — preparation mode; FINANCE_WRITE_ENABLED must stay false; no Production write",
      summary,
    };
  }

  if (!gates.allowed) {
    const status = harnessArmed ? "REFUSED_GATES" : "SKIPPED";
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: status,
      denials: gates.blockers,
      blocker: gates.blockers[0] ?? "live_arm_gates_incomplete",
    });
    return {
      status,
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      snapshotId: null,
      message: "FR1 pilot apply refused — live arm gates incomplete",
      summary,
    };
  }

  // Actor
  let actor: FinanceFr1ApplyActor | null = input.actor ?? null;
  if (!actor) {
    const token =
      input.firebaseIdToken?.trim() ||
      env.FIREBASE_ID_TOKEN?.trim() ||
      "";
    if (!token) {
      const summary = emptyFinanceFr1ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["FIREBASE_ID_TOKEN_missing"],
        blocker: "FIREBASE_ID_TOKEN_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
        blockers: ["FIREBASE_ID_TOKEN_missing"],
        snapshotId: null,
        message: "FR1 pilot apply refused — verified actor token required",
        summary,
      };
    }
    if (!input.actorResolver) {
      const summary = emptyFinanceFr1ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["actor_resolver_missing"],
        blocker: "actor_resolver_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
        blockers: ["actor_resolver_missing"],
        snapshotId: null,
        message: "FR1 pilot apply refused — actor resolver required",
        summary,
      };
    }
    const resolved = await input.actorResolver.resolve(token);
    if (!resolved.ok) {
      const summary = emptyFinanceFr1ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: [`actor_verify_failed:${resolved.reason}`],
        blocker: `actor_verify_failed:${resolved.reason}`,
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
        blockers: [`actor_verify_failed:${resolved.reason}`],
        snapshotId: null,
        message: "FR1 pilot apply refused — actor verification failed",
        summary,
      };
    }
    actor = resolved.actor;
  }

  const permissions = actor.permissions as FinancePermission[];
  if (!actorHasFinanceFr1Rbac(permissions)) {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["rbac_denied_finance"],
      blocker: "rbac_denied_finance",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: ["rbac_denied_finance"],
      snapshotId: null,
      message: "FR1 pilot apply refused — Finance RBAC denied",
      summary,
    };
  }

  // IAM / ADC preflight (single call; fail closed)
  let iamCredentialType: FinanceFr1ApplySafeSummary["adcCredentialType"] = null;
  let iamResolvedPrincipal: string | null = null;
  let iamPrincipalVerification: FinanceFr1ApplySafeSummary["adcPrincipalVerification"] =
    null;

  if (!input.skipIamPreflight) {
    const iam = await runFinanceFr1PilotIamPreflight({
      projectId: gates.projectId ?? undefined,
      permissionTester: input.permissionTester,
      principalResolver: input.principalResolver,
    });
    iamCredentialType = iam.adcCredentialType;
    iamResolvedPrincipal = iam.resolvedAdcPrincipal;
    iamPrincipalVerification = iam.adcPrincipalVerification;
    if (!iam.ok) {
      const summary = emptyFinanceFr1ApplySafeSummary({
        harnessArmed,
        overallStatus: "IAM_PREFLIGHT_FAILED",
        denials: [iam.code, iam.message],
        blocker: iam.code,
      });
      summary.actorVerified = true;
      summary.actorRole = actor.role;
      summary.adcCredentialType = iam.adcCredentialType;
      summary.resolvedAdcPrincipal = iam.resolvedAdcPrincipal;
      summary.adcPrincipalVerification = iam.adcPrincipalVerification;
      return {
        status: "IAM_PREFLIGHT_FAILED",
        productionWrites: 0,
        writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
        blockers: [iam.code],
        snapshotId: null,
        message: iam.message,
        summary,
      };
    }
  }

  const stampIam = (summary: FinanceFr1ApplySafeSummary): void => {
    summary.adcCredentialType = iamCredentialType;
    summary.resolvedAdcPrincipal = iamResolvedPrincipal;
    summary.adcPrincipalVerification = iamPrincipalVerification;
  };

  // Without ports: structural gate pass only (no mutation).
  if (!input.firestorePort || input.executeApply !== true) {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["execute_apply_or_ports_missing"],
      blocker: "execute_apply_or_ports_missing",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: ["execute_apply_or_ports_missing"],
      snapshotId: null,
      message:
        "FR1 live write adapter ready but executeApply/ports not provided — no mutation",
      summary,
    };
  }

  const port = input.firestorePort;

  // Load registry fixture
  const registrySnap = await port.getRegistryDoc();
  if (!registrySnap.exists || !registrySnap.data) {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["registry_fixture_missing"],
      blocker: "registry_fixture_missing",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["registry_fixture_missing"],
      snapshotId: null,
      message: "FR1 pilot apply refused — registry fixture missing",
      summary,
    };
  }

  const registryDoc =
    input.registryDoc ??
    (registrySnap.data as unknown as FinanceFr1SyntheticFixtureRegistryDoc);

  let candidate;
  try {
    candidate = mapRegistryFixtureToFinanceFr1Candidate(registryDoc, {
      registryPilotFlag: env.FINANCE_FR1_REGISTRY_PILOT,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "registry_map_failed";
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: [`registry_map_failed:${msg}`],
      blocker: "registry_map_failed",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["registry_map_failed"],
      snapshotId: null,
      message: msg,
      summary,
    };
  }

  const calculated =
    input.calculated ??
    calculateFinanceFr1PilotSnapshot({
      order: candidate,
      actorUserId: actor.uid,
      discountFundingOwner: "company",
      asOfUtc: input.nowUtc ?? "2026-09-13T21:00:00.000Z",
    });

  const lockedDenials = assertCalculatedMatchesLockedFixture(calculated);
  if (lockedDenials.length > 0 || calculated.reconciliationStatus !== "preconditions_ok") {
    const denials = [
      ...lockedDenials,
      ...calculated.reconciliationBlockers,
    ];
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials,
      blocker: denials[0] ?? "snapshot_calc_blocked",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.registryFixtureVerified = true;
    summary.calculatedSnapshot = toSnapshotSummary(calculated);
    summary.fc01PolicyVersion =
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: denials,
      snapshotId: null,
      message: "FR1 pilot apply refused — calculated snapshot mismatch/blocked",
      summary,
    };
  }

  const snapBefore = await port.getSnapshotDoc();
  const idemBefore = await port.getIdempotencyDoc();
  const orderBefore = await port.getOrderDoc();

  const bothExist = snapBefore.exists && idemBefore.exists;
  const neitherExist = !snapBefore.exists && !idemBefore.exists;
  if (bothExist) {
    if (
      isConsistentFinanceFr1PilotAppliedState({
        snapshot: snapBefore.data,
        idempotency: idemBefore.data,
      })
    ) {
      const summary = emptyFinanceFr1ApplySafeSummary({
        harnessArmed,
        overallStatus: "ALREADY_APPLIED",
        denials: [],
        blocker: null,
      });
      summary.actorVerified = true;
      summary.actorRole = actor.role;
      summary.registryFixtureVerified = true;
      summary.calculatedSnapshot = toSnapshotSummary(calculated);
      stampIam(summary);
      summary.alreadyApplied = true;
      summary.verificationPass = true;
      summary.fc01PolicyVersion =
        PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
      applyCounterToSummary(summary, port);
      return {
        status: "ALREADY_APPLIED",
        productionWrites: 0,
        writeCounts: FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS,
        blockers: [],
        snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
        message: "ALREADY_APPLIED — 0 additional writes",
        summary,
      };
    }
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_or_conflicting_prior_state"],
      blocker: "partial_or_conflicting_prior_state",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.registryFixtureVerified = true;
    summary.calculatedSnapshot = toSnapshotSummary(calculated);
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: ["partial_or_conflicting_prior_state"],
      snapshotId: null,
      message: "CONFLICT_NO_GO — prior state inconsistent; no auto-repair",
      summary,
    };
  }
  if (!neitherExist) {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_prior_snapshot_or_idempotency"],
      blocker: "partial_prior_snapshot_or_idempotency",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.registryFixtureVerified = true;
    summary.calculatedSnapshot = toSnapshotSummary(calculated);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ZERO_WRITE_COUNTS,
      blockers: ["partial_prior_snapshot_or_idempotency"],
      snapshotId: null,
      message: "CONFLICT_NO_GO — partial prior state; no auto-repair",
      summary,
    };
  }

  if (input.priorSnapshotExists === true) {
    const summary = emptyFinanceFr1ApplySafeSummary({
      harnessArmed,
      overallStatus: "ALREADY_APPLIED",
      denials: [],
      blocker: null,
    });
    summary.alreadyApplied = true;
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    return {
      status: "ALREADY_APPLIED",
      productionWrites: 0,
      writeCounts: FINANCE_FR1_ALREADY_APPLIED_WRITE_COUNTS,
      blockers: [],
      snapshotId: calculated.orderId,
      message: "ALREADY_APPLIED — 0 additional writes",
      summary,
    };
  }

  // Execute 4 writes
  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const correlationId = generateId("fr1corr");
  const auditIntentId = generateId("fr1audit_intent");
  const auditResultId = generateId("fr1audit_result");
  const idempotencyKeyPattern = calculated.idempotencyKeyPattern;

  const summaryBase = emptyFinanceFr1ApplySafeSummary({
    harnessArmed,
    overallStatus: FINANCE_FR1_PILOT_PASS,
  });
  summaryBase.applyAttempted = true;
  summaryBase.actorVerified = true;
  summaryBase.actorRole = actor.role;
  summaryBase.registryFixtureVerified = true;
  summaryBase.calculatedSnapshot = toSnapshotSummary(calculated);
  summaryBase.fc01PolicyVersion =
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
  stampIam(summaryBase);

  const intentCreate = await port.createAuditDoc(
    auditIntentId,
    buildFinanceFr1PilotAuditIntentDoc({
      id: auditIntentId,
      actorUid: actor.uid,
      correlationId,
      idempotencyKey: idempotencyKeyPattern,
      atUtc: nowUtc,
    }),
  );
  if (!intentCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`audit_intent_${intentCreate.code}`];
    summaryBase.blocker = `audit_intent_${intentCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      snapshotId: null,
      message: intentCreate.message,
      summary: summaryBase,
    };
  }

  const snapCreate = await port.createSnapshotDoc(
    buildFinanceFr1PilotSnapshotDoc({
      calculated,
      actorUid: actor.uid,
      correlationId,
      createdAtUtc: nowUtc,
    }),
  );
  if (!snapCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`snapshot_${snapCreate.code}`];
    summaryBase.blocker = `snapshot_${snapCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      snapshotId: null,
      message: snapCreate.message,
      summary: summaryBase,
    };
  }

  const idemCreate = await port.createIdempotencyDoc(
    buildFinanceFr1PilotIdempotencyDoc({
      actorUid: actor.uid,
      correlationId,
      auditIntentId,
      auditResultId,
      createdAtUtc: nowUtc,
    }) as unknown as Record<string, unknown>,
  );
  if (!idemCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`idempotency_${idemCreate.code}`];
    summaryBase.blocker = `idempotency_${idemCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      message: idemCreate.message,
      summary: summaryBase,
    };
  }

  const resultCreate = await port.createAuditDoc(
    auditResultId,
    buildFinanceFr1PilotAuditResultDoc({
      id: auditResultId,
      actorUid: actor.uid,
      correlationId,
      idempotencyKey: idempotencyKeyPattern,
      snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      atUtc: nowUtc,
    }),
  );
  if (!resultCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`audit_result_${resultCreate.code}`];
    summaryBase.blocker = `audit_result_${resultCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      message: resultCreate.message,
      summary: summaryBase,
    };
  }

  const verified = await verifyPostApply({
    port,
    auditIntentId,
    auditResultId,
    registryBefore: registrySnap.data,
    orderExistedBefore: orderBefore.exists,
  });

  applyCounterToSummary(summaryBase, port);
  summaryBase.verificationPass = verified.ok;
  summaryBase.forbiddenWritesZero = financeFr1ApplyForbiddenWritesZero(
    port.counter,
  );

  if (!verified.ok) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = verified.denials;
    summaryBase.blocker = verified.denials[0] ?? "verification_failed";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: verified.denials,
      snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      message: "FR1 writes completed but post-write verification failed",
      summary: summaryBase,
    };
  }

  if (financeFr1ApplyTotalWrites(port.counter) !== 4) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = ["exact_write_count_not_4"];
    summaryBase.blocker = "exact_write_count_not_4";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr1ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["exact_write_count_not_4"],
      snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
      message: "FR1 write count mismatch",
      summary: summaryBase,
    };
  }

  summaryBase.overallStatus = FINANCE_FR1_PILOT_PASS;
  return {
    status: FINANCE_FR1_PILOT_PASS,
    productionWrites: 4,
    writeCounts: {
      ...FINANCE_FR1_EXPECTED_WRITE_COUNTS,
    },
    blockers: [],
    snapshotId: FINANCE_FR1_SYNTHETIC_ORDER_ID,
    message: "FINANCE_FR1_PILOT_PASS — exactly 4 Production Finance writes",
    summary: summaryBase,
  };
}
