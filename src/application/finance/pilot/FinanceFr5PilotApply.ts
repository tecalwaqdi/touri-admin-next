/**
 * FR5 Settlement Execution Pilot live apply — REAL operator-controlled 5-write path.
 *
 * Requires:
 * - FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY=1
 * - FINANCE_WRITE_ENABLED=true (independent; GLOBAL/PRODUCTION stay false)
 * - SOURCE=fr4_settlement_locked
 * - verified actor + settlements:execute RBAC
 * - ADC principal + IAM preflight
 * - FR4 locked settlement + FR4 idempotency complete
 * - SoD: executor ≠ preparer ≠ approver
 *
 * Writes (exactly 5 on first apply):
 * 1. finance_audit_events INTENT (payment.confirm.intent)
 * 2. financial_settlement_payments CREATE (confirmed collection record)
 * 3. financial_settlements UPDATE (paid/status/outstanding)
 * 4. admin_next_cw_idempotency create
 * 5. finance_audit_events RESULT (payment.confirm.result)
 *
 * Canonical V2: createPayment(pending)→confirmPayment(confirmed) executed atomically;
 * payment persisted once as confirmed (full 1500; no partial path).
 *
 * Forbidden: second settlement, order, snapshot, wallet, payout, bank/gateway invent.
 * Rerun → ALREADY_APPLIED (0). Partial/conflict → NO-GO (no auto-repair).
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr5,
  calculateFinanceFr5ExecutionFromFr4Locked,
  type FinanceFr5CalculatedExecution,
} from "@/application/finance/pilot/FinanceFr5PilotCalculator";
import {
  FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR5_EXPECTED_WRITE_COUNTS,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
  FINANCE_FR5_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  actorHasFinanceFr5Rbac,
  evaluateFinanceFr5LiveArmGates,
  type FinanceFr5OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr5PilotGates";
import {
  buildFinanceFr5PilotAuditIntentDoc,
  buildFinanceFr5PilotAuditResultDoc,
  buildFinanceFr5PilotIdempotencyDoc,
  isConsistentFinanceFr5PilotAppliedState,
  isFinanceFr5Fr4LockedPrecondition,
} from "@/application/finance/pilot/FinanceFr5PilotDocuments";
import { runFinanceFr5PilotIamPreflight } from "@/application/finance/pilot/FinanceFr5PilotIamPreflight";
import {
  emptyFinanceFr5ApplySafeSummary,
  type FinanceFr5ApplySafeSummary,
  type FinanceFr5CalculatedExecutionSummary,
} from "@/application/finance/pilot/FinanceFr5ApplySafeSummary";
import {
  financeFr5ApplyForbiddenWritesZero,
  financeFr5ApplyTotalWrites,
  type FinanceFr5ApplyActor,
  type FinanceFr5ApplyActorResolver,
  type FinanceFr5ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr5ApplyPorts";
import type {
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr5PilotApplyResult = {
  status:
    | "SKIPPED"
    | "REFUSED_PREP"
    | "REFUSED_GATES"
    | "IAM_PREFLIGHT_FAILED"
    | "ALREADY_APPLIED"
    | "CONFLICT_NO_GO"
    | "VERIFICATION_FAILED"
    | typeof FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS;
  productionWrites: number;
  writeCounts:
    | typeof FINANCE_FR5_ZERO_WRITE_COUNTS
    | typeof FINANCE_FR5_EXPECTED_WRITE_COUNTS
    | typeof FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS
    | {
        financial_settlements: number;
        settlement_payments: number;
        finance_audit_events: number;
        admin_next_cw_idempotency: number;
        finance_accounting_snapshots: number;
        order: number;
        drivers: number;
        agents: number;
        customers: number;
        totalProductionWrites: number;
      };
  blockers: string[];
  settlementId: string | null;
  paymentId: string | null;
  message: string;
  summary: FinanceFr5ApplySafeSummary;
};

function toExecutionSummary(
  calculated: FinanceFr5CalculatedExecution,
): FinanceFr5CalculatedExecutionSummary {
  return {
    settlementId: calculated.settlementId,
    paymentId: calculated.paymentId,
    exactTransition: calculated.exactTransition,
    exactExecutionDirection: calculated.exactExecutionDirection,
    fromStatus: calculated.fromStatus,
    toStatus: calculated.toStatus,
    paymentStatus: calculated.paymentStatus,
    currency: calculated.currency,
    direction: calculated.direction,
    amountMinor: calculated.amountMinor,
    paidConfirmedMinorAfter: calculated.paidConfirmedMinorAfter,
    outstandingMinorAfter: calculated.outstandingMinorAfter,
    mutatesFinanceSnapshot: false,
    walletTouched: false,
    payoutExecuted: false,
    sodPass: calculated.sodPass,
  };
}

function writeCountsFromPort(
  port: FinanceFr5ApplyFirestorePort | undefined,
  alreadyApplied: boolean,
): FinanceFr5PilotApplyResult["writeCounts"] {
  if (alreadyApplied || !port) {
    return alreadyApplied
      ? { ...FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS }
      : { ...FINANCE_FR5_ZERO_WRITE_COUNTS };
  }
  const c = port.counter;
  return {
    financial_settlements: c.settlementUpdates,
    settlement_payments: c.paymentCreates + c.paymentUpdates,
    finance_audit_events: c.auditIntentWrites + c.auditResultWrites,
    admin_next_cw_idempotency: c.idempotencyWrites,
    finance_accounting_snapshots: c.snapshotWrites,
    order: c.orderWrites,
    drivers: c.driverWrites,
    agents: c.agentWrites,
    customers: c.customerWrites,
    totalProductionWrites: financeFr5ApplyTotalWrites(c),
  };
}

function applyCounterToSummary(
  summary: FinanceFr5ApplySafeSummary,
  port: FinanceFr5ApplyFirestorePort | undefined,
): void {
  if (!port) return;
  const c = port.counter;
  summary.actualSettlementUpdates = c.settlementUpdates;
  summary.actualSettlementCreates = c.settlementCreates;
  summary.actualPaymentCreates = c.paymentCreates;
  summary.actualPaymentUpdates = c.paymentUpdates;
  summary.actualAuditIntentWrites = c.auditIntentWrites;
  summary.actualAuditResultWrites = c.auditResultWrites;
  summary.actualIdempotencyWrites = c.idempotencyWrites;
  summary.totalProductionWrites = financeFr5ApplyTotalWrites(c);
  summary.snapshotWrites = c.snapshotWrites;
  summary.orderWrites = c.orderWrites;
  summary.driverWrites = c.driverWrites;
  summary.agentWrites = c.agentWrites;
  summary.customerWrites = c.customerWrites;
  summary.authWrites = c.authWrites;
  summary.walletWrites = c.walletWrites;
  summary.payoutWrites = c.payoutWrites;
  summary.forbiddenWritesZero = financeFr5ApplyForbiddenWritesZero(c);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function verifyPostApply(input: {
  port: FinanceFr5ApplyFirestorePort;
  auditIntentId: string;
  auditResultId: string;
  settlementBefore: Record<string, unknown>;
  fr1SnapshotBefore: Record<string, unknown> | null;
  fr4IdempotencyBefore: Record<string, unknown> | null;
  orderExistedBefore: boolean;
}): Promise<{ ok: boolean; denials: string[] }> {
  return (async () => {
    const denials: string[] = [];
    const settlement = await input.port.getSettlementDoc();
    const payment = await input.port.getPaymentDoc();
    const idem = await input.port.getFr5IdempotencyDoc();
    const intent = await input.port.getAuditDoc(input.auditIntentId);
    const result = await input.port.getAuditDoc(input.auditResultId);
    const fr1Snap = await input.port.getFr1SnapshotDoc();
    const fr4Idem = await input.port.getFr4IdempotencyDoc();
    const order = await input.port.getOrderDoc();

    if (
      !isConsistentFinanceFr5PilotAppliedState({
        settlement: settlement.data,
        payment: payment.data,
        fr5Idempotency: idem.data,
      })
    ) {
      denials.push("post_verify_settlement_payment_or_idempotency_mismatch");
    }
    if (!intent.exists || intent.data?.action !== "payment.confirm.intent") {
      denials.push("post_verify_audit_intent_missing");
    }
    if (
      !result.exists ||
      result.data?.action !== "payment.confirm.result" ||
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

    const s = settlement.data;
    const before = input.settlementBefore;
    if (
      s &&
      (Number(s.amountMinor) !== Number(before.amountMinor) ||
        s.currency !== before.currency ||
        s.direction !== before.direction ||
        s.sourceAccountingSnapshotId !== before.sourceAccountingSnapshotId ||
        s.createdByUserId !== before.createdByUserId ||
        s.lockedByUserId !== before.lockedByUserId)
    ) {
      denials.push("post_verify_immutable_fields_mutated");
    }
    if (s && Number(s.paidConfirmedMinor) !== 1500) {
      denials.push("post_verify_paidConfirmed_not_1500");
    }
    if (s && Number(s.outstandingMinor ?? 0) !== 0) {
      denials.push("post_verify_outstanding_not_0");
    }

    if (!fr1Snap.exists) {
      denials.push("post_verify_fr1_snapshot_missing");
    } else if (
      input.fr1SnapshotBefore &&
      JSON.stringify(fr1Snap.data?.grossFareMinor) !==
        JSON.stringify(input.fr1SnapshotBefore.grossFareMinor)
    ) {
      denials.push("post_verify_fr1_snapshot_mutated");
    }

    if (
      input.fr4IdempotencyBefore &&
      JSON.stringify(fr4Idem.data) !==
        JSON.stringify(input.fr4IdempotencyBefore)
    ) {
      denials.push("post_verify_fr4_idempotency_mutated");
    }

    if (order.exists !== input.orderExistedBefore) {
      denials.push("post_verify_order_collection_changed");
    }
    if (!financeFr5ApplyForbiddenWritesZero(input.port.counter)) {
      denials.push("post_verify_forbidden_writes_nonzero");
    }
    if (input.port.counter.settlementCreates !== 0) {
      denials.push("post_verify_second_settlement_create_forbidden");
    }
    if (financeFr5ApplyTotalWrites(input.port.counter) !== 5) {
      denials.push(
        `post_verify_write_count!=5_got_${financeFr5ApplyTotalWrites(input.port.counter)}`,
      );
    }
    return { ok: denials.length === 0, denials };
  })();
}

export async function runFinanceFr5SettlementExecutionPilotApply(input: {
  mode: "preparation" | "live_apply";
  env?: FinanceFr5OperatorGateEnv;
  executeApply?: boolean;
  firestorePort?: FinanceFr5ApplyFirestorePort;
  actorResolver?: FinanceFr5ApplyActorResolver;
  actor?: FinanceFr5ApplyActor | null;
  firebaseIdToken?: string | null;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  skipIamPreflight?: boolean;
  nowUtc?: string;
}): Promise<FinanceFr5PilotApplyResult> {
  const env = input.env ?? process.env;
  const harnessArmed =
    env.FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_APPLY === "1";
  const gates = evaluateFinanceFr5LiveArmGates({
    env,
    mode: input.mode,
  });

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_PREP",
      denials: ["preparation_mode"],
      blocker: "preparation_mode_no_live_write",
    });
    return {
      status: "REFUSED_PREP",
      productionWrites: 0,
      writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      paymentId: null,
      message:
        "FR5 Settlement Execution pilot apply refused — preparation mode; FINANCE_WRITE_ENABLED must stay false; no Production write",
      summary,
    };
  }

  if (!gates.allowed) {
    const status = harnessArmed ? "REFUSED_GATES" : "SKIPPED";
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: status,
      denials: gates.blockers,
      blocker: gates.blockers[0] ?? "live_arm_gates_incomplete",
    });
    return {
      status,
      productionWrites: 0,
      writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      paymentId: null,
      message:
        "FR5 Settlement Execution pilot apply refused — live arm gates incomplete",
      summary,
    };
  }

  let actor: FinanceFr5ApplyActor | null = input.actor ?? null;
  if (!actor) {
    const token =
      input.firebaseIdToken?.trim() || env.FIREBASE_ID_TOKEN?.trim() || "";
    if (!token) {
      const summary = emptyFinanceFr5ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["FIREBASE_ID_TOKEN_missing"],
        blocker: "FIREBASE_ID_TOKEN_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
        blockers: ["FIREBASE_ID_TOKEN_missing"],
        settlementId: null,
        paymentId: null,
        message: "FR5 pilot apply refused — verified actor token required",
        summary,
      };
    }
    if (!input.actorResolver) {
      const summary = emptyFinanceFr5ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["actor_resolver_missing"],
        blocker: "actor_resolver_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
        blockers: ["actor_resolver_missing"],
        settlementId: null,
        paymentId: null,
        message: "FR5 pilot apply refused — actor resolver required",
        summary,
      };
    }
    const resolved = await input.actorResolver.resolve(token);
    if (!resolved.ok) {
      const summary = emptyFinanceFr5ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: [`actor_verify_failed:${resolved.reason}`],
        blocker: `actor_verify_failed:${resolved.reason}`,
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
        blockers: [`actor_verify_failed:${resolved.reason}`],
        settlementId: null,
        paymentId: null,
        message: "FR5 pilot apply refused — actor verification failed",
        summary,
      };
    }
    actor = resolved.actor;
  }

  const permissions = actor.permissions as FinancePermission[];
  if (!actorHasFinanceFr5Rbac(permissions)) {
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["rbac_denied_settlements_execute"],
      blocker: "rbac_denied_settlements_execute",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
      blockers: ["rbac_denied_settlements_execute"],
      settlementId: null,
      paymentId: null,
      message: "FR5 pilot apply refused — settlements:execute RBAC denied",
      summary,
    };
  }

  let iamCredentialType: FinanceFr5ApplySafeSummary["adcCredentialType"] = null;
  let iamResolvedPrincipal: string | null = null;
  let iamPrincipalVerification: FinanceFr5ApplySafeSummary["adcPrincipalVerification"] =
    null;

  if (!input.skipIamPreflight) {
    const iam = await runFinanceFr5PilotIamPreflight({
      projectId: gates.projectId ?? undefined,
      permissionTester: input.permissionTester,
      principalResolver: input.principalResolver,
    });
    iamCredentialType = iam.adcCredentialType;
    iamResolvedPrincipal = iam.resolvedAdcPrincipal;
    iamPrincipalVerification = iam.adcPrincipalVerification;
    if (!iam.ok) {
      const summary = emptyFinanceFr5ApplySafeSummary({
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
        writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
        blockers: [iam.code],
        settlementId: null,
        paymentId: null,
        message: iam.message,
        summary,
      };
    }
  }

  const stampIam = (summary: FinanceFr5ApplySafeSummary): void => {
    summary.adcCredentialType = iamCredentialType;
    summary.resolvedAdcPrincipal = iamResolvedPrincipal;
    summary.adcPrincipalVerification = iamPrincipalVerification;
  };

  if (!input.firestorePort || input.executeApply !== true) {
    const summary = emptyFinanceFr5ApplySafeSummary({
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
      writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
      blockers: ["execute_apply_or_ports_missing"],
      settlementId: null,
      paymentId: null,
      message:
        "FR5 live write adapter ready but executeApply/ports not provided — no mutation",
      summary,
    };
  }

  const port = input.firestorePort;

  const fr1SnapBefore = await port.getFr1SnapshotDoc();
  const fr4IdemBefore = await port.getFr4IdempotencyDoc();
  const settlementBefore = await port.getSettlementDoc();
  const paymentBefore = await port.getPaymentDoc();
  const fr5IdemBefore = await port.getFr5IdempotencyDoc();
  const orderBefore = await port.getOrderDoc();

  const alreadyConsistent =
    settlementBefore.exists &&
    paymentBefore.exists &&
    fr5IdemBefore.exists &&
    isConsistentFinanceFr5PilotAppliedState({
      settlement: settlementBefore.data,
      payment: paymentBefore.data,
      fr5Idempotency: fr5IdemBefore.data,
    });

  if (alreadyConsistent) {
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "ALREADY_APPLIED",
      denials: [],
      blocker: null,
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr4SettlementVerified = true;
    stampIam(summary);
    summary.alreadyApplied = true;
    summary.verificationPass = true;
    summary.fc01PolicyVersion =
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
    applyCounterToSummary(summary, port);
    return {
      status: "ALREADY_APPLIED",
      productionWrites: 0,
      writeCounts: FINANCE_FR5_ALREADY_APPLIED_WRITE_COUNTS,
      blockers: [],
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: "ALREADY_APPLIED — 0 additional writes",
      summary,
    };
  }

  const anyFr5Partial =
    fr5IdemBefore.exists ||
    paymentBefore.exists ||
    (settlementBefore.exists && settlementBefore.data?.status === "settled");
  if (anyFr5Partial) {
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_or_conflicting_prior_state"],
      blocker: "partial_or_conflicting_prior_state",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR5_ZERO_WRITE_COUNTS,
      blockers: ["partial_or_conflicting_prior_state"],
      settlementId: null,
      paymentId: null,
      message: "CONFLICT_NO_GO — prior state inconsistent; no auto-repair",
      summary,
    };
  }

  if (
    !isFinanceFr5Fr4LockedPrecondition({
      settlement: settlementBefore.data,
      fr4Idempotency: fr4IdemBefore.data,
    })
  ) {
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["fr4_settlement_locked_or_idempotency_incomplete"],
      blocker: "fr4_settlement_locked_or_idempotency_incomplete",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["fr4_settlement_locked_or_idempotency_incomplete"],
      settlementId: null,
      paymentId: null,
      message:
        "FR5 refused — FR4 locked Settlement V2 + FR4 idempotency must be complete first",
      summary,
    };
  }

  const calculated = calculateFinanceFr5ExecutionFromFr4Locked({
    settlement: settlementBefore.data!,
    executorUid: actor.uid,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr5(calculated);
  if (
    lockedDenials.length > 0 ||
    calculated.reconciliationStatus !== "preconditions_ok"
  ) {
    const denials = [...lockedDenials, ...calculated.reconciliationBlockers];
    const summary = emptyFinanceFr5ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials,
      blocker: denials[0] ?? "execution_calc_blocked",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr4SettlementVerified = true;
    summary.calculatedExecution = toExecutionSummary(calculated);
    summary.fc01PolicyVersion =
      PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: denials,
      settlementId: null,
      paymentId: null,
      message: "FR5 refused — execution transition blocked (SoD / fields)",
      summary,
    };
  }

  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const correlationId = generateId("fr5corr");
  const auditIntentId = generateId("fr5audit_intent");
  const auditResultId = generateId("fr5audit_result");
  const idempotencyKeyPattern = calculated.confirmIdempotencyKeyPattern;

  const settlementPatch = {
    ...calculated.settlementPatch,
    settledAt: nowUtc,
    lastPaymentAt: nowUtc,
    updatedAtUtc: nowUtc,
    settledBy: actor.uid,
  };
  const paymentDoc = {
    ...calculated.paymentDoc,
    createdAtUtc: nowUtc,
    confirmedAtUtc: nowUtc,
    correlationId,
    createdByUserId: actor.uid,
    confirmedByUserId: actor.uid,
  };

  const summaryBase = emptyFinanceFr5ApplySafeSummary({
    harnessArmed,
    overallStatus: FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
  });
  summaryBase.applyAttempted = true;
  summaryBase.actorVerified = true;
  summaryBase.actorRole = actor.role;
  summaryBase.fr4SettlementVerified = true;
  summaryBase.calculatedExecution = toExecutionSummary(calculated);
  summaryBase.fc01PolicyVersion =
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
  stampIam(summaryBase);

  const intentCreate = await port.createAuditDoc(
    auditIntentId,
    buildFinanceFr5PilotAuditIntentDoc({
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
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: null,
      paymentId: null,
      message: intentCreate.message,
      summary: summaryBase,
    };
  }

  const paymentCreate = await port.createPaymentDoc(paymentDoc);
  if (!paymentCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`payment_${paymentCreate.code}`];
    summaryBase.blocker = `payment_${paymentCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: null,
      message: paymentCreate.message,
      summary: summaryBase,
    };
  }

  const settlementUpdate = await port.updateSettlementExecution(settlementPatch);
  if (!settlementUpdate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`settlement_${settlementUpdate.code}`];
    summaryBase.blocker = `settlement_${settlementUpdate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: settlementUpdate.message,
      summary: summaryBase,
    };
  }

  const idemCreate = await port.createFr5IdempotencyDoc(
    buildFinanceFr5PilotIdempotencyDoc({
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
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: idemCreate.message,
      summary: summaryBase,
    };
  }

  const resultCreate = await port.createAuditDoc(
    auditResultId,
    buildFinanceFr5PilotAuditResultDoc({
      id: auditResultId,
      actorUid: actor.uid,
      correlationId,
      idempotencyKey: idempotencyKeyPattern,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
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
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: resultCreate.message,
      summary: summaryBase,
    };
  }

  const verified = await verifyPostApply({
    port,
    auditIntentId,
    auditResultId,
    settlementBefore: settlementBefore.data!,
    fr1SnapshotBefore: fr1SnapBefore.data,
    fr4IdempotencyBefore: fr4IdemBefore.data,
    orderExistedBefore: orderBefore.exists,
  });

  applyCounterToSummary(summaryBase, port);
  summaryBase.verificationPass = verified.ok;
  summaryBase.forbiddenWritesZero = financeFr5ApplyForbiddenWritesZero(
    port.counter,
  );

  if (!verified.ok) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = verified.denials;
    summaryBase.blocker = verified.denials[0] ?? "verification_failed";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: verified.denials,
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: "FR5 writes completed but post-write verification failed",
      summary: summaryBase,
    };
  }

  if (financeFr5ApplyTotalWrites(port.counter) !== 5) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = ["exact_write_count_not_5"];
    summaryBase.blocker = "exact_write_count_not_5";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr5ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["exact_write_count_not_5"],
      settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
      paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
      message: "FR5 write count mismatch",
      summary: summaryBase,
    };
  }

  summaryBase.overallStatus = FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS;
  return {
    status: FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS,
    productionWrites: 5,
    writeCounts: { ...FINANCE_FR5_EXPECTED_WRITE_COUNTS },
    blockers: [],
    settlementId: FINANCE_FR5_SETTLEMENT_DOC_ID,
    paymentId: FINANCE_FR5_PAYMENT_DOC_ID,
    message:
      "FINANCE_FR5_SETTLEMENT_EXECUTION_PILOT_PASS — locked→settled full collection; 5 writes",
    summary: summaryBase,
  };
}
