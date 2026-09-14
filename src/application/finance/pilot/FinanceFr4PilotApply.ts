/**
 * FR4 Settlement Approval Pilot live apply — REAL operator-controlled 4-write path.
 *
 * Requires:
 * - FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY=1
 * - FINANCE_WRITE_ENABLED=true (independent; GLOBAL/PRODUCTION stay false)
 * - SOURCE=fr2_settlement_draft
 * - verified actor + settlements:approve RBAC
 * - ADC principal + IAM preflight (FR1 authorized_user tokeninfo pattern)
 * - FR2 draft settlement + FR2 idempotency complete
 * - dual control: approver ≠ creator
 * - no prior FR4 approval / FR4 idempotency
 *
 * Writes (exactly 4 on first apply):
 * 1. finance_audit_events INTENT (settlement.lock.intent)
 * 2. financial_settlements UPDATE (approval/lock fields only)
 * 3. admin_next_cw_idempotency create
 * 4. finance_audit_events RESULT (settlement.lock.result)
 *
 * Forbidden: second settlement create, order, finance_accounting_snapshots,
 * settlement_payments, payout, Drivers/Agents/Customers/Auth, amount/currency/
 * direction/source mutation.
 *
 * Rerun → ALREADY_APPLIED (0). Partial/conflict → NO-GO (no auto-repair).
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr4,
  calculateFinanceFr4ApprovalFromFr2Draft,
  type FinanceFr4CalculatedApproval,
} from "@/application/finance/pilot/FinanceFr4PilotCalculator";
import {
  FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR4_EXPECTED_WRITE_COUNTS,
  FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import {
  actorHasFinanceFr4Rbac,
  evaluateFinanceFr4LiveArmGates,
  type FinanceFr4OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr4PilotGates";
import {
  buildFinanceFr4PilotAuditIntentDoc,
  buildFinanceFr4PilotAuditResultDoc,
  buildFinanceFr4PilotIdempotencyDoc,
  isConsistentFinanceFr4PilotAppliedState,
  isFinanceFr4Fr2DraftPrecondition,
} from "@/application/finance/pilot/FinanceFr4PilotDocuments";
import { runFinanceFr4PilotIamPreflight } from "@/application/finance/pilot/FinanceFr4PilotIamPreflight";
import {
  emptyFinanceFr4ApplySafeSummary,
  type FinanceFr4ApplySafeSummary,
  type FinanceFr4CalculatedApprovalSummary,
} from "@/application/finance/pilot/FinanceFr4ApplySafeSummary";
import {
  financeFr4ApplyForbiddenWritesZero,
  financeFr4ApplyTotalWrites,
  type FinanceFr4ApplyActor,
  type FinanceFr4ApplyActorResolver,
  type FinanceFr4ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr4ApplyPorts";
import type {
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr4PilotApplyResult = {
  status:
    | "SKIPPED"
    | "REFUSED_PREP"
    | "REFUSED_GATES"
    | "IAM_PREFLIGHT_FAILED"
    | "ALREADY_APPLIED"
    | "CONFLICT_NO_GO"
    | "VERIFICATION_FAILED"
    | typeof FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS;
  productionWrites: number;
  writeCounts:
    | typeof FINANCE_FR4_ZERO_WRITE_COUNTS
    | typeof FINANCE_FR4_EXPECTED_WRITE_COUNTS
    | typeof FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS
    | {
        financial_settlements: number;
        finance_audit_events: number;
        admin_next_cw_idempotency: number;
        finance_accounting_snapshots: number;
        order: number;
        settlement_payments: number;
        drivers: number;
        agents: number;
        customers: number;
        totalProductionWrites: number;
      };
  blockers: string[];
  settlementId: string | null;
  message: string;
  summary: FinanceFr4ApplySafeSummary;
};

function toApprovalSummary(
  calculated: FinanceFr4CalculatedApproval,
): FinanceFr4CalculatedApprovalSummary {
  return {
    settlementId: calculated.settlementId,
    exactTransition: calculated.exactTransition,
    fromStatus: calculated.fromStatus,
    toStatus: calculated.toStatus,
    opsApprovalLabel: calculated.opsApprovalLabel,
    currency: calculated.currency,
    direction: calculated.direction,
    amountMinor: calculated.amountMinor,
    paidConfirmedMinor: calculated.paidConfirmedMinor,
    outstandingMinor: calculated.outstandingMinor,
    sourceAccountingSnapshotId: calculated.sourceAccountingSnapshotId,
    mutatesFinanceSnapshot: false,
    mutatesSettlementAmounts: false,
    paymentExecutionForbidden: true,
    dualControlPass: calculated.dualControlPass,
  };
}

function writeCountsFromPort(
  port: FinanceFr4ApplyFirestorePort | undefined,
  alreadyApplied: boolean,
): FinanceFr4PilotApplyResult["writeCounts"] {
  if (alreadyApplied || !port) {
    return alreadyApplied
      ? { ...FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS }
      : { ...FINANCE_FR4_ZERO_WRITE_COUNTS };
  }
  const c = port.counter;
  return {
    financial_settlements: c.settlementUpdates,
    finance_audit_events: c.auditIntentWrites + c.auditResultWrites,
    admin_next_cw_idempotency: c.idempotencyWrites,
    finance_accounting_snapshots: c.snapshotWrites,
    order: c.orderWrites,
    settlement_payments: c.paymentWrites,
    drivers: c.driverWrites,
    agents: c.agentWrites,
    customers: c.customerWrites,
    totalProductionWrites: financeFr4ApplyTotalWrites(c),
  };
}

function applyCounterToSummary(
  summary: FinanceFr4ApplySafeSummary,
  port: FinanceFr4ApplyFirestorePort | undefined,
): void {
  if (!port) return;
  const c = port.counter;
  summary.actualSettlementUpdates = c.settlementUpdates;
  summary.actualSettlementCreates = c.settlementCreates;
  summary.actualAuditIntentWrites = c.auditIntentWrites;
  summary.actualAuditResultWrites = c.auditResultWrites;
  summary.actualIdempotencyWrites = c.idempotencyWrites;
  summary.totalProductionWrites = financeFr4ApplyTotalWrites(c);
  summary.snapshotWrites = c.snapshotWrites;
  summary.orderWrites = c.orderWrites;
  summary.paymentWrites = c.paymentWrites;
  summary.driverWrites = c.driverWrites;
  summary.agentWrites = c.agentWrites;
  summary.customerWrites = c.customerWrites;
  summary.authWrites = c.authWrites;
  summary.forbiddenWritesZero = financeFr4ApplyForbiddenWritesZero(c);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function verifyPostApply(input: {
  port: FinanceFr4ApplyFirestorePort;
  auditIntentId: string;
  auditResultId: string;
  settlementBefore: Record<string, unknown>;
  fr1SnapshotBefore: Record<string, unknown> | null;
  fr2IdempotencyBefore: Record<string, unknown> | null;
  orderExistedBefore: boolean;
}): Promise<{ ok: boolean; denials: string[] }> {
  return (async () => {
    const denials: string[] = [];
    const settlement = await input.port.getSettlementDoc();
    const idem = await input.port.getFr4IdempotencyDoc();
    const intent = await input.port.getAuditDoc(input.auditIntentId);
    const result = await input.port.getAuditDoc(input.auditResultId);
    const fr1Snap = await input.port.getFr1SnapshotDoc();
    const fr2Idem = await input.port.getFr2IdempotencyDoc();
    const order = await input.port.getOrderDoc();

    if (
      !isConsistentFinanceFr4PilotAppliedState({
        settlement: settlement.data,
        fr4Idempotency: idem.data,
      })
    ) {
      denials.push("post_verify_settlement_or_idempotency_mismatch");
    }
    if (!intent.exists || intent.data?.action !== "settlement.lock.intent") {
      denials.push("post_verify_audit_intent_missing");
    }
    if (
      !result.exists ||
      result.data?.action !== "settlement.lock.result" ||
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

    // Immutable money / source fields
    const s = settlement.data;
    const before = input.settlementBefore;
    if (
      s &&
      (Number(s.amountMinor) !== Number(before.amountMinor) ||
        Number(s.paidConfirmedMinor) !== Number(before.paidConfirmedMinor) ||
        s.currency !== before.currency ||
        s.direction !== before.direction ||
        s.sourceAccountingSnapshotId !== before.sourceAccountingSnapshotId ||
        s.createdByUserId !== before.createdByUserId)
    ) {
      denials.push("post_verify_immutable_fields_mutated");
    }

    // FR1 snapshot must remain unchanged.
    if (!fr1Snap.exists) {
      denials.push("post_verify_fr1_snapshot_missing");
    } else if (
      input.fr1SnapshotBefore &&
      JSON.stringify(fr1Snap.data?.grossFareMinor) !==
        JSON.stringify(input.fr1SnapshotBefore.grossFareMinor)
    ) {
      denials.push("post_verify_fr1_snapshot_mutated");
    } else if (
      input.fr1SnapshotBefore &&
      JSON.stringify(fr1Snap.data?.driverNetMinor) !==
        JSON.stringify(input.fr1SnapshotBefore.driverNetMinor)
    ) {
      denials.push("post_verify_fr1_snapshot_mutated");
    }

    // FR2 idempotency must remain unchanged.
    if (
      input.fr2IdempotencyBefore &&
      JSON.stringify(fr2Idem.data) !==
        JSON.stringify(input.fr2IdempotencyBefore)
    ) {
      denials.push("post_verify_fr2_idempotency_mutated");
    }

    if (order.exists !== input.orderExistedBefore) {
      denials.push("post_verify_order_collection_changed");
    }
    if (!financeFr4ApplyForbiddenWritesZero(input.port.counter)) {
      denials.push("post_verify_forbidden_writes_nonzero");
    }
    if (input.port.counter.settlementCreates !== 0) {
      denials.push("post_verify_second_settlement_create_forbidden");
    }
    if (financeFr4ApplyTotalWrites(input.port.counter) !== 4) {
      denials.push(
        `post_verify_write_count!=4_got_${financeFr4ApplyTotalWrites(input.port.counter)}`,
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
export async function runFinanceFr4SettlementApprovalPilotApply(input: {
  mode: "preparation" | "live_apply";
  env?: FinanceFr4OperatorGateEnv;
  executeApply?: boolean;
  firestorePort?: FinanceFr4ApplyFirestorePort;
  actorResolver?: FinanceFr4ApplyActorResolver;
  actor?: FinanceFr4ApplyActor | null;
  firebaseIdToken?: string | null;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  skipIamPreflight?: boolean;
  nowUtc?: string;
}): Promise<FinanceFr4PilotApplyResult> {
  const env = input.env ?? process.env;
  const harnessArmed =
    env.FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_APPLY === "1";
  const gates = evaluateFinanceFr4LiveArmGates({
    env,
    mode: input.mode,
  });

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_PREP",
      denials: ["preparation_mode"],
      blocker: "preparation_mode_no_live_write",
    });
    return {
      status: "REFUSED_PREP",
      productionWrites: 0,
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      message:
        "FR4 Settlement Approval pilot apply refused — preparation mode; FINANCE_WRITE_ENABLED must stay false; no Production write",
      summary,
    };
  }

  if (!gates.allowed) {
    const status = harnessArmed ? "REFUSED_GATES" : "SKIPPED";
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: status,
      denials: gates.blockers,
      blocker: gates.blockers[0] ?? "live_arm_gates_incomplete",
    });
    return {
      status,
      productionWrites: 0,
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      message:
        "FR4 Settlement Approval pilot apply refused — live arm gates incomplete",
      summary,
    };
  }

  let actor: FinanceFr4ApplyActor | null = input.actor ?? null;
  if (!actor) {
    const token =
      input.firebaseIdToken?.trim() || env.FIREBASE_ID_TOKEN?.trim() || "";
    if (!token) {
      const summary = emptyFinanceFr4ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["FIREBASE_ID_TOKEN_missing"],
        blocker: "FIREBASE_ID_TOKEN_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
        blockers: ["FIREBASE_ID_TOKEN_missing"],
        settlementId: null,
        message: "FR4 pilot apply refused — verified actor token required",
        summary,
      };
    }
    if (!input.actorResolver) {
      const summary = emptyFinanceFr4ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["actor_resolver_missing"],
        blocker: "actor_resolver_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
        blockers: ["actor_resolver_missing"],
        settlementId: null,
        message: "FR4 pilot apply refused — actor resolver required",
        summary,
      };
    }
    const resolved = await input.actorResolver.resolve(token);
    if (!resolved.ok) {
      const summary = emptyFinanceFr4ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: [`actor_verify_failed:${resolved.reason}`],
        blocker: `actor_verify_failed:${resolved.reason}`,
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
        blockers: [`actor_verify_failed:${resolved.reason}`],
        settlementId: null,
        message: "FR4 pilot apply refused — actor verification failed",
        summary,
      };
    }
    actor = resolved.actor;
  }

  const permissions = actor.permissions as FinancePermission[];
  if (!actorHasFinanceFr4Rbac(permissions)) {
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["rbac_denied_settlements_approve"],
      blocker: "rbac_denied_settlements_approve",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: ["rbac_denied_settlements_approve"],
      settlementId: null,
      message: "FR4 pilot apply refused — settlements:approve RBAC denied",
      summary,
    };
  }

  let iamCredentialType: FinanceFr4ApplySafeSummary["adcCredentialType"] = null;
  let iamResolvedPrincipal: string | null = null;
  let iamPrincipalVerification: FinanceFr4ApplySafeSummary["adcPrincipalVerification"] =
    null;

  if (!input.skipIamPreflight) {
    const iam = await runFinanceFr4PilotIamPreflight({
      projectId: gates.projectId ?? undefined,
      permissionTester: input.permissionTester,
      principalResolver: input.principalResolver,
    });
    iamCredentialType = iam.adcCredentialType;
    iamResolvedPrincipal = iam.resolvedAdcPrincipal;
    iamPrincipalVerification = iam.adcPrincipalVerification;
    if (!iam.ok) {
      const summary = emptyFinanceFr4ApplySafeSummary({
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
        writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
        blockers: [iam.code],
        settlementId: null,
        message: iam.message,
        summary,
      };
    }
  }

  const stampIam = (summary: FinanceFr4ApplySafeSummary): void => {
    summary.adcCredentialType = iamCredentialType;
    summary.resolvedAdcPrincipal = iamResolvedPrincipal;
    summary.adcPrincipalVerification = iamPrincipalVerification;
  };

  if (!input.firestorePort || input.executeApply !== true) {
    const summary = emptyFinanceFr4ApplySafeSummary({
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
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: ["execute_apply_or_ports_missing"],
      settlementId: null,
      message:
        "FR4 live write adapter ready but executeApply/ports not provided — no mutation",
      summary,
    };
  }

  const port = input.firestorePort;

  const fr1SnapBefore = await port.getFr1SnapshotDoc();
  const fr2IdemBefore = await port.getFr2IdempotencyDoc();
  const settlementBefore = await port.getSettlementDoc();
  const fr4IdemBefore = await port.getFr4IdempotencyDoc();
  const orderBefore = await port.getOrderDoc();

  const bothExist = settlementBefore.exists && fr4IdemBefore.exists;
  const neitherFr4 =
    settlementBefore.exists &&
    settlementBefore.data?.status === "draft" &&
    !fr4IdemBefore.exists;
  const alreadyLockedConsistent =
    settlementBefore.exists &&
    fr4IdemBefore.exists &&
    isConsistentFinanceFr4PilotAppliedState({
      settlement: settlementBefore.data,
      fr4Idempotency: fr4IdemBefore.data,
    });

  if (alreadyLockedConsistent || bothExist) {
    if (
      isConsistentFinanceFr4PilotAppliedState({
        settlement: settlementBefore.data,
        fr4Idempotency: fr4IdemBefore.data,
      })
    ) {
      const summary = emptyFinanceFr4ApplySafeSummary({
        harnessArmed,
        overallStatus: "ALREADY_APPLIED",
        denials: [],
        blocker: null,
      });
      summary.actorVerified = true;
      summary.actorRole = actor.role;
      summary.fr2SettlementVerified = true;
      stampIam(summary);
      summary.alreadyApplied = true;
      summary.verificationPass = true;
      summary.fc01PolicyVersion =
        PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
      applyCounterToSummary(summary, port);
      return {
        status: "ALREADY_APPLIED",
        productionWrites: 0,
        writeCounts: FINANCE_FR4_ALREADY_APPLIED_WRITE_COUNTS,
        blockers: [],
        settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
        message: "ALREADY_APPLIED — 0 additional writes",
        summary,
      };
    }
    const summary = emptyFinanceFr4ApplySafeSummary({
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
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: ["partial_or_conflicting_prior_state"],
      settlementId: null,
      message: "CONFLICT_NO_GO — prior state inconsistent; no auto-repair",
      summary,
    };
  }

  if (fr4IdemBefore.exists && !settlementBefore.exists) {
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_prior_idempotency_without_settlement"],
      blocker: "partial_prior_idempotency_without_settlement",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: ["partial_prior_idempotency_without_settlement"],
      settlementId: null,
      message: "CONFLICT_NO_GO — partial prior state; no auto-repair",
      summary,
    };
  }

  if (
    !isFinanceFr4Fr2DraftPrecondition({
      settlement: settlementBefore.data,
      fr2Idempotency: fr2IdemBefore.data,
    })
  ) {
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["fr2_settlement_draft_or_idempotency_incomplete"],
      blocker: "fr2_settlement_draft_or_idempotency_incomplete",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["fr2_settlement_draft_or_idempotency_incomplete"],
      settlementId: null,
      message:
        "FR4 refused — FR2 Settlement V2 draft + FR2 idempotency must be complete first",
      summary,
    };
  }

  if (!neitherFr4) {
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["unexpected_settlement_or_fr4_state"],
      blocker: "unexpected_settlement_or_fr4_state",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR4_ZERO_WRITE_COUNTS,
      blockers: ["unexpected_settlement_or_fr4_state"],
      settlementId: null,
      message: "CONFLICT_NO_GO — unexpected prior state; no auto-repair",
      summary,
    };
  }

  const calculated = calculateFinanceFr4ApprovalFromFr2Draft({
    settlement: settlementBefore.data!,
    approverUid: actor.uid,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr4(calculated);
  if (
    lockedDenials.length > 0 ||
    calculated.reconciliationStatus !== "preconditions_ok"
  ) {
    const denials = [...lockedDenials, ...calculated.reconciliationBlockers];
    const summary = emptyFinanceFr4ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials,
      blocker: denials[0] ?? "approval_calc_blocked",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr2SettlementVerified = true;
    summary.calculatedApproval = toApprovalSummary(calculated);
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
      message: "FR4 refused — approval transition blocked (dual control / fields)",
      summary,
    };
  }

  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const correlationId = generateId("fr4corr");
  const auditIntentId = generateId("fr4audit_intent");
  const auditResultId = generateId("fr4audit_result");
  const idempotencyKeyPattern = calculated.idempotencyKeyPattern;
  const approvalPatch = {
    ...calculated.approvalPatch,
    approvedAt: nowUtc,
    lockedAtUtc: nowUtc,
    updatedAtUtc: nowUtc,
    approvalCorrelationId: correlationId,
    approvedBy: actor.uid,
    lockedByUserId: actor.uid,
  };

  const summaryBase = emptyFinanceFr4ApplySafeSummary({
    harnessArmed,
    overallStatus: FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
  });
  summaryBase.applyAttempted = true;
  summaryBase.actorVerified = true;
  summaryBase.actorRole = actor.role;
  summaryBase.fr2SettlementVerified = true;
  summaryBase.calculatedApproval = toApprovalSummary(calculated);
  summaryBase.fc01PolicyVersion =
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
  stampIam(summaryBase);

  const intentCreate = await port.createAuditDoc(
    auditIntentId,
    buildFinanceFr4PilotAuditIntentDoc({
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
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: null,
      message: intentCreate.message,
      summary: summaryBase,
    };
  }

  const settlementUpdate = await port.updateSettlementApproval(approvalPatch);
  if (!settlementUpdate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`settlement_${settlementUpdate.code}`];
    summaryBase.blocker = `settlement_${settlementUpdate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
      message: settlementUpdate.message,
      summary: summaryBase,
    };
  }

  const idemCreate = await port.createFr4IdempotencyDoc(
    buildFinanceFr4PilotIdempotencyDoc({
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
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
      message: idemCreate.message,
      summary: summaryBase,
    };
  }

  const resultCreate = await port.createAuditDoc(
    auditResultId,
    buildFinanceFr4PilotAuditResultDoc({
      id: auditResultId,
      actorUid: actor.uid,
      correlationId,
      idempotencyKey: idempotencyKeyPattern,
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
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
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
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
    fr2IdempotencyBefore: fr2IdemBefore.data,
    orderExistedBefore: orderBefore.exists,
  });

  applyCounterToSummary(summaryBase, port);
  summaryBase.verificationPass = verified.ok;
  summaryBase.forbiddenWritesZero = financeFr4ApplyForbiddenWritesZero(
    port.counter,
  );

  if (!verified.ok) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = verified.denials;
    summaryBase.blocker = verified.denials[0] ?? "verification_failed";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: verified.denials,
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
      message: "FR4 writes completed but post-write verification failed",
      summary: summaryBase,
    };
  }

  if (financeFr4ApplyTotalWrites(port.counter) !== 4) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = ["exact_write_count_not_4"];
    summaryBase.blocker = "exact_write_count_not_4";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr4ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["exact_write_count_not_4"],
      settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
      message: "FR4 write count mismatch",
      summary: summaryBase,
    };
  }

  summaryBase.overallStatus = FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS;
  return {
    status: FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS,
    productionWrites: 4,
    writeCounts: { ...FINANCE_FR4_EXPECTED_WRITE_COUNTS },
    blockers: [],
    settlementId: FINANCE_FR4_SETTLEMENT_DOC_ID,
    message:
      "FINANCE_FR4_SETTLEMENT_APPROVAL_PILOT_PASS — exactly 4 Production Finance writes (1 update + 2 audit + 1 idempotency)",
    summary: summaryBase,
  };
}
