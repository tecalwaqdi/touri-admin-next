/**
 * FR2 Settlement V2 Pilot live apply — REAL operator-controlled 4-write path.
 *
 * Requires:
 * - FINANCE_FR2_SETTLEMENT_PILOT_APPLY=1
 * - FINANCE_WRITE_ENABLED=true (independent; GLOBAL/PRODUCTION stay false)
 * - SOURCE=fr1_snapshot
 * - verified actor + Finance RBAC
 * - ADC principal + IAM preflight (FR1 authorized_user tokeninfo pattern)
 * - FR1 snapshot + FR1 idempotency complete
 * - no prior FR2 settlement / FR2 idempotency
 *
 * Writes (exactly 4 on first apply):
 * 1. finance_audit_events INTENT
 * 2. financial_settlements create-only draft
 * 3. admin_next_cw_idempotency create
 * 4. finance_audit_events RESULT
 *
 * Forbidden: order, finance_accounting_snapshots mutation, payments, payout,
 * Drivers/Agents/Customers/Auth, refund, chargeback.
 *
 * Rerun → ALREADY_APPLIED (0). Partial/conflict → NO-GO (no auto-repair).
 */

import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT } from "@/domain/finance/v2/policies/PlatformCommissionPolicy";
import {
  assertCalculatedMatchesLockedFr2,
  calculateFinanceFr2SettlementFromFr1Snapshot,
  type FinanceFr2CalculatedSettlement,
} from "@/application/finance/pilot/FinanceFr2PilotCalculator";
import {
  FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR2_EXPECTED_WRITE_COUNTS,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SETTLEMENT_PILOT_PASS,
  FINANCE_FR2_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import {
  actorHasFinanceFr2Rbac,
  evaluateFinanceFr2LiveArmGates,
  type FinanceFr2OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr2PilotGates";
import {
  buildFinanceFr2PilotAuditIntentDoc,
  buildFinanceFr2PilotAuditResultDoc,
  buildFinanceFr2PilotIdempotencyDoc,
  buildFinanceFr2SettlementDoc,
  isConsistentFinanceFr2PilotAppliedState,
  isFr1PilotPreconditionComplete,
} from "@/application/finance/pilot/FinanceFr2PilotDocuments";
import { runFinanceFr2PilotIamPreflight } from "@/application/finance/pilot/FinanceFr2PilotIamPreflight";
import {
  emptyFinanceFr2ApplySafeSummary,
  type FinanceFr2ApplySafeSummary,
  type FinanceFr2CalculatedSettlementSummary,
} from "@/application/finance/pilot/FinanceFr2ApplySafeSummary";
import {
  financeFr2ApplyForbiddenWritesZero,
  financeFr2ApplyTotalWrites,
  type FinanceFr2ApplyActor,
  type FinanceFr2ApplyActorResolver,
  type FinanceFr2ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr2ApplyPorts";
import type {
  FinanceFr1RegistryFixtureAdcPrincipalResolver,
  FinanceFr1RegistryFixtureIamPermissionTester,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export type FinanceFr2PilotApplyResult = {
  status:
    | "SKIPPED"
    | "REFUSED_PREP"
    | "REFUSED_GATES"
    | "IAM_PREFLIGHT_FAILED"
    | "ALREADY_APPLIED"
    | "CONFLICT_NO_GO"
    | "VERIFICATION_FAILED"
    | typeof FINANCE_FR2_SETTLEMENT_PILOT_PASS;
  productionWrites: number;
  writeCounts:
    | typeof FINANCE_FR2_ZERO_WRITE_COUNTS
    | typeof FINANCE_FR2_EXPECTED_WRITE_COUNTS
    | typeof FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS
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
  summary: FinanceFr2ApplySafeSummary;
};

function toSettlementSummary(
  calculated: FinanceFr2CalculatedSettlement,
): FinanceFr2CalculatedSettlementSummary {
  return {
    settlementId: calculated.settlementId,
    sourceAccountingSnapshotId: calculated.sourceAccountingSnapshotId,
    currency: calculated.currency,
    paymentMethod: calculated.paymentMethod,
    direction: calculated.direction,
    status: calculated.status,
    amountMinor: calculated.amountMinor,
    claimAmountMinor: calculated.claim.amountMinor,
    fr1GrossFareMinor: calculated.fr1GrossFareMinor,
    fr1CommissionMinor: calculated.fr1CommissionMinor,
    fr1DriverNetMinor: calculated.fr1DriverNetMinor,
    agentSettlementCreated: false,
    mutatesFinanceSnapshot: false,
    paymentExecutionForbidden: true,
  };
}

function writeCountsFromPort(
  port: FinanceFr2ApplyFirestorePort | undefined,
  alreadyApplied: boolean,
): FinanceFr2PilotApplyResult["writeCounts"] {
  if (alreadyApplied || !port) {
    return alreadyApplied
      ? { ...FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS }
      : { ...FINANCE_FR2_ZERO_WRITE_COUNTS };
  }
  const c = port.counter;
  return {
    financial_settlements: c.settlementWrites,
    finance_audit_events: c.auditIntentWrites + c.auditResultWrites,
    admin_next_cw_idempotency: c.idempotencyWrites,
    finance_accounting_snapshots: c.snapshotWrites,
    order: c.orderWrites,
    settlement_payments: c.paymentWrites,
    drivers: c.driverWrites,
    agents: c.agentWrites,
    customers: c.customerWrites,
    totalProductionWrites: financeFr2ApplyTotalWrites(c),
  };
}

function applyCounterToSummary(
  summary: FinanceFr2ApplySafeSummary,
  port: FinanceFr2ApplyFirestorePort | undefined,
): void {
  if (!port) return;
  const c = port.counter;
  summary.actualSettlementWrites = c.settlementWrites;
  summary.actualAuditIntentWrites = c.auditIntentWrites;
  summary.actualAuditResultWrites = c.auditResultWrites;
  summary.actualIdempotencyWrites = c.idempotencyWrites;
  summary.totalProductionWrites = financeFr2ApplyTotalWrites(c);
  summary.snapshotWrites = c.snapshotWrites;
  summary.orderWrites = c.orderWrites;
  summary.paymentWrites = c.paymentWrites;
  summary.driverWrites = c.driverWrites;
  summary.agentWrites = c.agentWrites;
  summary.customerWrites = c.customerWrites;
  summary.authWrites = c.authWrites;
  summary.forbiddenWritesZero = financeFr2ApplyForbiddenWritesZero(c);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function verifyPostApply(input: {
  port: FinanceFr2ApplyFirestorePort;
  auditIntentId: string;
  auditResultId: string;
  fr1SnapshotBefore: Record<string, unknown> | null;
  orderExistedBefore: boolean;
}): Promise<{ ok: boolean; denials: string[] }> {
  return (async () => {
    const denials: string[] = [];
    const settlement = await input.port.getSettlementDoc();
    const idem = await input.port.getFr2IdempotencyDoc();
    const intent = await input.port.getAuditDoc(input.auditIntentId);
    const result = await input.port.getAuditDoc(input.auditResultId);
    const fr1Snap = await input.port.getFr1SnapshotDoc();
    const order = await input.port.getOrderDoc();

    if (
      !isConsistentFinanceFr2PilotAppliedState({
        settlement: settlement.data,
        idempotency: idem.data,
      })
    ) {
      denials.push("post_verify_settlement_or_idempotency_mismatch");
    }
    if (!intent.exists || intent.data?.action !== "settlement.create.intent") {
      denials.push("post_verify_audit_intent_missing");
    }
    if (
      !result.exists ||
      result.data?.action !== "settlement.create.result" ||
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
    if (order.exists !== input.orderExistedBefore) {
      denials.push("post_verify_order_collection_changed");
    }
    if (!financeFr2ApplyForbiddenWritesZero(input.port.counter)) {
      denials.push("post_verify_forbidden_writes_nonzero");
    }
    if (financeFr2ApplyTotalWrites(input.port.counter) !== 4) {
      denials.push(
        `post_verify_write_count!=4_got_${financeFr2ApplyTotalWrites(input.port.counter)}`,
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
export async function runFinanceFr2SettlementPilotApply(input: {
  mode: "preparation" | "live_apply";
  env?: FinanceFr2OperatorGateEnv;
  executeApply?: boolean;
  firestorePort?: FinanceFr2ApplyFirestorePort;
  actorResolver?: FinanceFr2ApplyActorResolver;
  actor?: FinanceFr2ApplyActor | null;
  firebaseIdToken?: string | null;
  permissionTester?: FinanceFr1RegistryFixtureIamPermissionTester;
  principalResolver?: FinanceFr1RegistryFixtureAdcPrincipalResolver;
  skipIamPreflight?: boolean;
  nowUtc?: string;
}): Promise<FinanceFr2PilotApplyResult> {
  const env = input.env ?? process.env;
  const harnessArmed = env.FINANCE_FR2_SETTLEMENT_PILOT_APPLY === "1";
  const gates = evaluateFinanceFr2LiveArmGates({
    env,
    mode: input.mode,
  });

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_PREP",
      denials: ["preparation_mode"],
      blocker: "preparation_mode_no_live_write",
    });
    return {
      status: "REFUSED_PREP",
      productionWrites: 0,
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      message:
        "FR2 Settlement V2 pilot apply refused — preparation mode; FINANCE_WRITE_ENABLED must stay false; no Production write",
      summary,
    };
  }

  if (!gates.allowed) {
    const status = harnessArmed ? "REFUSED_GATES" : "SKIPPED";
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: status,
      denials: gates.blockers,
      blocker: gates.blockers[0] ?? "live_arm_gates_incomplete",
    });
    return {
      status,
      productionWrites: 0,
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: gates.blockers,
      settlementId: null,
      message: "FR2 Settlement V2 pilot apply refused — live arm gates incomplete",
      summary,
    };
  }

  let actor: FinanceFr2ApplyActor | null = input.actor ?? null;
  if (!actor) {
    const token =
      input.firebaseIdToken?.trim() ||
      env.FIREBASE_ID_TOKEN?.trim() ||
      "";
    if (!token) {
      const summary = emptyFinanceFr2ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["FIREBASE_ID_TOKEN_missing"],
        blocker: "FIREBASE_ID_TOKEN_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
        blockers: ["FIREBASE_ID_TOKEN_missing"],
        settlementId: null,
        message: "FR2 pilot apply refused — verified actor token required",
        summary,
      };
    }
    if (!input.actorResolver) {
      const summary = emptyFinanceFr2ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: ["actor_resolver_missing"],
        blocker: "actor_resolver_missing",
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
        blockers: ["actor_resolver_missing"],
        settlementId: null,
        message: "FR2 pilot apply refused — actor resolver required",
        summary,
      };
    }
    const resolved = await input.actorResolver.resolve(token);
    if (!resolved.ok) {
      const summary = emptyFinanceFr2ApplySafeSummary({
        harnessArmed,
        overallStatus: "REFUSED_GATES",
        denials: [`actor_verify_failed:${resolved.reason}`],
        blocker: `actor_verify_failed:${resolved.reason}`,
      });
      return {
        status: "REFUSED_GATES",
        productionWrites: 0,
        writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
        blockers: [`actor_verify_failed:${resolved.reason}`],
        settlementId: null,
        message: "FR2 pilot apply refused — actor verification failed",
        summary,
      };
    }
    actor = resolved.actor;
  }

  const permissions = actor.permissions as FinancePermission[];
  if (!actorHasFinanceFr2Rbac(permissions)) {
    const summary = emptyFinanceFr2ApplySafeSummary({
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
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: ["rbac_denied_finance"],
      settlementId: null,
      message: "FR2 pilot apply refused — Finance RBAC denied",
      summary,
    };
  }

  let iamCredentialType: FinanceFr2ApplySafeSummary["adcCredentialType"] = null;
  let iamResolvedPrincipal: string | null = null;
  let iamPrincipalVerification: FinanceFr2ApplySafeSummary["adcPrincipalVerification"] =
    null;

  if (!input.skipIamPreflight) {
    const iam = await runFinanceFr2PilotIamPreflight({
      projectId: gates.projectId ?? undefined,
      permissionTester: input.permissionTester,
      principalResolver: input.principalResolver,
    });
    iamCredentialType = iam.adcCredentialType;
    iamResolvedPrincipal = iam.resolvedAdcPrincipal;
    iamPrincipalVerification = iam.adcPrincipalVerification;
    if (!iam.ok) {
      const summary = emptyFinanceFr2ApplySafeSummary({
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
        writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
        blockers: [iam.code],
        settlementId: null,
        message: iam.message,
        summary,
      };
    }
  }

  const stampIam = (summary: FinanceFr2ApplySafeSummary): void => {
    summary.adcCredentialType = iamCredentialType;
    summary.resolvedAdcPrincipal = iamResolvedPrincipal;
    summary.adcPrincipalVerification = iamPrincipalVerification;
  };

  if (!input.firestorePort || input.executeApply !== true) {
    const summary = emptyFinanceFr2ApplySafeSummary({
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
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: ["execute_apply_or_ports_missing"],
      settlementId: null,
      message:
        "FR2 live write adapter ready but executeApply/ports not provided — no mutation",
      summary,
    };
  }

  const port = input.firestorePort;

  const fr1SnapBefore = await port.getFr1SnapshotDoc();
  const fr1IdemBefore = await port.getFr1IdempotencyDoc();
  const orderBefore = await port.getOrderDoc();

  if (
    !isFr1PilotPreconditionComplete({
      snapshot: fr1SnapBefore.data,
      fr1Idempotency: fr1IdemBefore.data,
    })
  ) {
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials: ["fr1_snapshot_or_idempotency_incomplete"],
      blocker: "fr1_snapshot_or_idempotency_incomplete",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "REFUSED_GATES",
      productionWrites: 0,
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["fr1_snapshot_or_idempotency_incomplete"],
      settlementId: null,
      message:
        "FR2 refused — FR1 finance snapshot + idempotency must be complete first",
      summary,
    };
  }

  const calculated = calculateFinanceFr2SettlementFromFr1Snapshot({
    snapshot: fr1SnapBefore.data ?? {},
    actorUserId: actor.uid,
  });
  const lockedDenials = assertCalculatedMatchesLockedFr2(calculated);
  if (
    lockedDenials.length > 0 ||
    calculated.reconciliationStatus !== "preconditions_ok"
  ) {
    const denials = [...lockedDenials, ...calculated.reconciliationBlockers];
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: "REFUSED_GATES",
      denials,
      blocker: denials[0] ?? "settlement_calc_blocked",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr1SnapshotVerified = true;
    summary.calculatedSettlement = toSettlementSummary(calculated);
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
      message: "FR2 refused — calculated settlement mismatch/blocked",
      summary,
    };
  }

  const settlementBefore = await port.getSettlementDoc();
  const fr2IdemBefore = await port.getFr2IdempotencyDoc();

  const bothExist = settlementBefore.exists && fr2IdemBefore.exists;
  const neitherExist = !settlementBefore.exists && !fr2IdemBefore.exists;
  if (bothExist) {
    if (
      isConsistentFinanceFr2PilotAppliedState({
        settlement: settlementBefore.data,
        idempotency: fr2IdemBefore.data,
      })
    ) {
      const summary = emptyFinanceFr2ApplySafeSummary({
        harnessArmed,
        overallStatus: "ALREADY_APPLIED",
        denials: [],
        blocker: null,
      });
      summary.actorVerified = true;
      summary.actorRole = actor.role;
      summary.fr1SnapshotVerified = true;
      summary.calculatedSettlement = toSettlementSummary(calculated);
      stampIam(summary);
      summary.alreadyApplied = true;
      summary.verificationPass = true;
      summary.fc01PolicyVersion =
        PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
      applyCounterToSummary(summary, port);
      return {
        status: "ALREADY_APPLIED",
        productionWrites: 0,
        writeCounts: FINANCE_FR2_ALREADY_APPLIED_WRITE_COUNTS,
        blockers: [],
        settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
        message: "ALREADY_APPLIED — 0 additional writes",
        summary,
      };
    }
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_or_conflicting_prior_state"],
      blocker: "partial_or_conflicting_prior_state",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr1SnapshotVerified = true;
    summary.calculatedSettlement = toSettlementSummary(calculated);
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: ["partial_or_conflicting_prior_state"],
      settlementId: null,
      message: "CONFLICT_NO_GO — prior state inconsistent; no auto-repair",
      summary,
    };
  }
  if (!neitherExist) {
    const summary = emptyFinanceFr2ApplySafeSummary({
      harnessArmed,
      overallStatus: "CONFLICT_NO_GO",
      denials: ["partial_prior_settlement_or_idempotency"],
      blocker: "partial_prior_settlement_or_idempotency",
    });
    summary.actorVerified = true;
    summary.actorRole = actor.role;
    summary.fr1SnapshotVerified = true;
    summary.calculatedSettlement = toSettlementSummary(calculated);
    stampIam(summary);
    applyCounterToSummary(summary, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: 0,
      writeCounts: FINANCE_FR2_ZERO_WRITE_COUNTS,
      blockers: ["partial_prior_settlement_or_idempotency"],
      settlementId: null,
      message: "CONFLICT_NO_GO — partial prior state; no auto-repair",
      summary,
    };
  }

  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const correlationId = generateId("fr2corr");
  const auditIntentId = generateId("fr2audit_intent");
  const auditResultId = generateId("fr2audit_result");
  const idempotencyKeyPattern = calculated.idempotencyKeyPattern;

  const summaryBase = emptyFinanceFr2ApplySafeSummary({
    harnessArmed,
    overallStatus: FINANCE_FR2_SETTLEMENT_PILOT_PASS,
  });
  summaryBase.applyAttempted = true;
  summaryBase.actorVerified = true;
  summaryBase.actorRole = actor.role;
  summaryBase.fr1SnapshotVerified = true;
  summaryBase.calculatedSettlement = toSettlementSummary(calculated);
  summaryBase.fc01PolicyVersion =
    PLATFORM_COMMISSION_POLICY_APPROVED_15_PERCENT.version;
  stampIam(summaryBase);

  const intentCreate = await port.createAuditDoc(
    auditIntentId,
    buildFinanceFr2PilotAuditIntentDoc({
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
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: null,
      message: intentCreate.message,
      summary: summaryBase,
    };
  }

  const settlementCreate = await port.createSettlementDoc(
    buildFinanceFr2SettlementDoc({
      calculated,
      actorUid: actor.uid,
      correlationId,
      createdAtUtc: nowUtc,
      idempotencyKey: idempotencyKeyPattern,
    }),
  );
  if (!settlementCreate.ok) {
    summaryBase.overallStatus = "CONFLICT_NO_GO";
    summaryBase.denials = [`settlement_${settlementCreate.code}`];
    summaryBase.blocker = `settlement_${settlementCreate.code}`;
    applyCounterToSummary(summaryBase, port);
    return {
      status: "CONFLICT_NO_GO",
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: null,
      message: settlementCreate.message,
      summary: summaryBase,
    };
  }

  const idemCreate = await port.createFr2IdempotencyDoc(
    buildFinanceFr2PilotIdempotencyDoc({
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
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
      message: idemCreate.message,
      summary: summaryBase,
    };
  }

  const resultCreate = await port.createAuditDoc(
    auditResultId,
    buildFinanceFr2PilotAuditResultDoc({
      id: auditResultId,
      actorUid: actor.uid,
      correlationId,
      idempotencyKey: idempotencyKeyPattern,
      settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
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
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: summaryBase.denials,
      settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
      message: resultCreate.message,
      summary: summaryBase,
    };
  }

  const verified = await verifyPostApply({
    port,
    auditIntentId,
    auditResultId,
    fr1SnapshotBefore: fr1SnapBefore.data,
    orderExistedBefore: orderBefore.exists,
  });

  applyCounterToSummary(summaryBase, port);
  summaryBase.verificationPass = verified.ok;
  summaryBase.forbiddenWritesZero = financeFr2ApplyForbiddenWritesZero(
    port.counter,
  );

  if (!verified.ok) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = verified.denials;
    summaryBase.blocker = verified.denials[0] ?? "verification_failed";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: verified.denials,
      settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
      message: "FR2 writes completed but post-write verification failed",
      summary: summaryBase,
    };
  }

  if (financeFr2ApplyTotalWrites(port.counter) !== 4) {
    summaryBase.overallStatus = "VERIFICATION_FAILED";
    summaryBase.denials = ["exact_write_count_not_4"];
    summaryBase.blocker = "exact_write_count_not_4";
    return {
      status: "VERIFICATION_FAILED",
      productionWrites: financeFr2ApplyTotalWrites(port.counter),
      writeCounts: writeCountsFromPort(port, false),
      blockers: ["exact_write_count_not_4"],
      settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
      message: "FR2 write count mismatch",
      summary: summaryBase,
    };
  }

  summaryBase.overallStatus = FINANCE_FR2_SETTLEMENT_PILOT_PASS;
  return {
    status: FINANCE_FR2_SETTLEMENT_PILOT_PASS,
    productionWrites: 4,
    writeCounts: { ...FINANCE_FR2_EXPECTED_WRITE_COUNTS },
    blockers: [],
    settlementId: FINANCE_FR2_SETTLEMENT_DOC_ID,
    message:
      "FINANCE_FR2_SETTLEMENT_PILOT_PASS — exactly 4 Production Finance writes",
    summary: summaryBase,
  };
}
