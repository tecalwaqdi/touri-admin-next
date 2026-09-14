/**
 * FR6 adjustment pilot apply — append-only create+approve (atomic approved doc).
 * Write order:
 * 1. finance_audit_events INTENT
 * 2. finance_adjustments CREATE (approved)
 * 3. admin_next_cw_idempotency CREATE
 * 4. finance_audit_events RESULT
 *
 * Never mutates FR1 snapshot / settlement / payment / order.
 * Settled payment retained. Refund/chargeback not in this live path.
 */

import {
  FINANCE_FR6_ADJUSTMENT_PILOT_PASS,
  FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS,
  FINANCE_FR6_EXPECTED_WRITE_COUNTS,
  FINANCE_FR6_ZERO_WRITE_COUNTS,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import {
  actorHasFinanceFr6ApproveRbac,
  actorHasFinanceFr6CreateRbac,
  evaluateFinanceFr6LiveArmGates,
  type FinanceFr6OperatorGateEnv,
} from "@/application/finance/pilot/FinanceFr6PilotGates";
import {
  buildFinanceFr6AdjustmentDoc,
  buildFinanceFr6PilotAuditIntentDoc,
  buildFinanceFr6PilotAuditResultDoc,
  buildFinanceFr6PilotIdempotencyDoc,
  isConsistentFinanceFr6PilotAppliedState,
  isFinanceFr6Fr5SettledPrecondition,
} from "@/application/finance/pilot/FinanceFr6PilotDocuments";
import { runFinanceFr6PilotIamPreflight } from "@/application/finance/pilot/FinanceFr6PilotIamPreflight";
import {
  emptyFinanceFr6ApplySafeSummary,
  type FinanceFr6ApplySafeSummary,
} from "@/application/finance/pilot/FinanceFr6ApplySafeSummary";
import {
  financeFr6ApplyForbiddenWritesZero,
  financeFr6ApplyTotalWrites,
  type FinanceFr6ApplyActor,
  type FinanceFr6ApplyActorResolver,
  type FinanceFr6ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr6ApplyPorts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

export type FinanceFr6PilotApplyResult = {
  status:
    | "PREP_SKIP"
    | "GATE_BLOCKED"
    | "APPLIED"
    | "ALREADY_APPLIED"
    | "CONFLICT_NO_GO"
    | "IAM_DENIED"
    | "RBAC_DENIED"
    | "ACTOR_DENIED";
  passMarker: typeof FINANCE_FR6_ADJUSTMENT_PILOT_PASS | null;
  productionWrites: number;
  writeCounts:
    | typeof FINANCE_FR6_ZERO_WRITE_COUNTS
    | typeof FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS
    | typeof FINANCE_FR6_EXPECTED_WRITE_COUNTS
    | {
        finance_adjustments: number;
        finance_audit_events: number;
        admin_next_cw_idempotency: number;
        financial_settlements: number;
        settlement_payments: number;
        finance_accounting_snapshots: number;
        finance_refund_accounting: number;
        finance_chargeback_accounting: number;
        order: number;
        drivers: number;
        agents: number;
        customers: number;
        totalProductionWrites: number;
      };
  summary: FinanceFr6ApplySafeSummary;
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function countsFromPort(
  port: FinanceFr6ApplyFirestorePort | undefined,
): FinanceFr6PilotApplyResult["writeCounts"] {
  if (!port) return { ...FINANCE_FR6_ZERO_WRITE_COUNTS };
  const c = port.getWriteCounter();
  return {
    finance_adjustments: c.adjustmentCreates + c.adjustmentUpdates,
    finance_audit_events: c.auditIntentWrites + c.auditResultWrites,
    admin_next_cw_idempotency: c.idempotencyWrites,
    financial_settlements: c.settlementWrites,
    settlement_payments: c.paymentWrites,
    finance_accounting_snapshots: c.snapshotWrites,
    finance_refund_accounting: c.refundWrites,
    finance_chargeback_accounting: c.chargebackWrites,
    order: c.orderWrites,
    drivers: c.driverWrites,
    agents: c.agentWrites,
    customers: c.customerWrites,
    totalProductionWrites: financeFr6ApplyTotalWrites(c),
  };
}

export async function runFinanceFr6AdjustmentPilotApply(input: {
  mode: "preparation" | "live_apply";
  env?: FinanceFr6OperatorGateEnv;
  firestorePort?: FinanceFr6ApplyFirestorePort;
  actorResolver?: FinanceFr6ApplyActorResolver;
  /** Preparer actor (finance:adjust). */
  actor?: FinanceFr6ApplyActor | null;
  /** Approver actor (finance:adjust_approve) — must differ from preparer. */
  approverActor?: FinanceFr6ApplyActor | null;
  skipIamPreflight?: boolean;
  testIamPermissions?: () => Promise<readonly string[]>;
  resolvePrincipal?: () => Promise<{
    credentialType: string;
    principalEmail: string;
  }>;
}): Promise<FinanceFr6PilotApplyResult> {
  const env = input.env ?? process.env;
  const gates = evaluateFinanceFr6LiveArmGates({
    env,
    mode: input.mode,
  });

  if (input.mode === "preparation") {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "PREP_SKIP",
      message: "FR6 preparation mode — no live writes",
      denials: gates.blockers,
    });
    return {
      status: "PREP_SKIP",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }

  if (!gates.allowed) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "GATE_BLOCKED",
      message: "FR6 live arm gates blocked",
      denials: gates.blockers,
      blocker: gates.blockers[0] ?? "gate_blocked",
    });
    return {
      status: "GATE_BLOCKED",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }

  let preparer: FinanceFr6ApplyActor | null = input.actor ?? null;
  const idToken = (env.FIREBASE_ID_TOKEN ?? "").trim();
  if (!preparer && input.actorResolver) {
    if (!idToken) {
      const summary = emptyFinanceFr6ApplySafeSummary({
        overallStatus: "ACTOR_DENIED",
        message: "missing FIREBASE_ID_TOKEN",
        denials: ["invalid_or_missing_actor_token"],
        blocker: "invalid_or_missing_actor_token",
      });
      return {
        status: "ACTOR_DENIED",
        passMarker: null,
        productionWrites: 0,
        writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
        summary,
      };
    }
    preparer = await input.actorResolver.resolve({ idToken });
  }
  if (!preparer) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "ACTOR_DENIED",
      message: "actor unresolved",
      denials: ["invalid_or_missing_actor_token"],
      blocker: "invalid_or_missing_actor_token",
    });
    return {
      status: "ACTOR_DENIED",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }

  const approver: FinanceFr6ApplyActor | null =
    input.approverActor ??
    ({
      uid: "finance_fr6_adjust_approver_actor",
      role: "finance_approver",
      permissions: ["finance:read", "finance:adjust_approve"],
    } satisfies FinanceFr6ApplyActor);

  const prepPerms = preparer.permissions as FinancePermission[];
  const apprPerms = approver.permissions as FinancePermission[];
  if (
    !actorHasFinanceFr6CreateRbac(prepPerms) ||
    !actorHasFinanceFr6ApproveRbac(apprPerms)
  ) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "RBAC_DENIED",
      message: "FR6 RBAC denied",
      denials: ["rbac_denied"],
      blocker: "rbac_denied",
    });
    return {
      status: "RBAC_DENIED",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }
  if (preparer.uid === approver.uid) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "RBAC_DENIED",
      message: "SoD violation preparer==approver",
      denials: ["dual_control_violation"],
      blocker: "dual_control_violation",
    });
    return {
      status: "RBAC_DENIED",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }

  let iamCredentialType: string | null = null;
  let iamPrincipalVerification: string | null = null;
  if (!input.skipIamPreflight) {
    const iam = await runFinanceFr6PilotIamPreflight({
      testIamPermissions: input.testIamPermissions,
      resolvePrincipal: input.resolvePrincipal,
    });
    if (!iam.ok) {
      const summary = emptyFinanceFr6ApplySafeSummary({
        overallStatus: "IAM_DENIED",
        message: iam.message,
        denials: [iam.code === "WRONG_ADC_PRINCIPAL" ? "wrong_adc_principal" : iam.code],
        blocker: iam.code,
      });
      summary.adcCredentialType = iam.credentialType;
      summary.adcPrincipalVerification = iam.principalEmail;
      return {
        status: "IAM_DENIED",
        passMarker: null,
        productionWrites: 0,
        writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
        summary,
      };
    }
    iamCredentialType = iam.credentialType;
    iamPrincipalVerification = iam.principalEmail;
  }

  const port = input.firestorePort;
  if (!port) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "GATE_BLOCKED",
      message: "firestore port required",
      denials: ["missing_firestore_port"],
      blocker: "missing_firestore_port",
    });
    return {
      status: "GATE_BLOCKED",
      passMarker: null,
      productionWrites: 0,
      writeCounts: { ...FINANCE_FR6_ZERO_WRITE_COUNTS },
      summary,
    };
  }

  const stampIam = (summary: FinanceFr6ApplySafeSummary): void => {
    summary.adcCredentialType = iamCredentialType;
    summary.adcPrincipalVerification = iamPrincipalVerification;
  };

  const [settlementSnap, paymentSnap, snapshotSnap, adjustmentSnap, idemSnap] =
    await Promise.all([
      port.getSettlementDoc(),
      port.getPaymentDoc(),
      port.getFr1SnapshotDoc(),
      port.getAdjustmentDoc(),
      port.getFr6IdempotencyDoc(),
    ]);

  if (
    !isFinanceFr6Fr5SettledPrecondition({
      settlement: settlementSnap.data,
      payment: paymentSnap.data,
    })
  ) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: "FR5 settled precondition failed",
      denials: ["fr5_settled_precondition_failed"],
      blocker: "fr5_settled_precondition_failed",
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: 0,
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  if (idemSnap.exists || adjustmentSnap.exists) {
    const consistent = isConsistentFinanceFr6PilotAppliedState({
      adjustment: adjustmentSnap.data,
      settlement: settlementSnap.data,
      snapshot: snapshotSnap.data,
    });
    if (consistent && idemSnap.exists) {
      const summary = emptyFinanceFr6ApplySafeSummary({
        overallStatus: "ALREADY_APPLIED",
        message: "FR6 adjustment already applied — 0 writes",
      });
      summary.writeCounts = { ...FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS };
      stampIam(summary);
      return {
        status: "ALREADY_APPLIED",
        passMarker: FINANCE_FR6_ADJUSTMENT_PILOT_PASS,
        productionWrites: 0,
        writeCounts: { ...FINANCE_FR6_ALREADY_APPLIED_WRITE_COUNTS },
        summary,
      };
    }
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: "Partial/conflict FR6 state — no auto-repair",
      denials: ["idempotency_conflict"],
      blocker: "idempotency_conflict",
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: 0,
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const now = new Date().toISOString();
  const correlationId = `fr6_${preparer.uid}`;
  const stableIdemKey = `${preparer.uid}|adjustment.create_approve|finance_adjustments|test_adminnext_finance_fr6_adjustment_001|finance_fr6_adjustment_pilot_v1`;

  const auditIntentId = generateId("fr6audit_intent");
  const auditResultId = generateId("fr6audit_result");

  const intentCreate = await port.createAuditDoc(
    auditIntentId,
    buildFinanceFr6PilotAuditIntentDoc({
      id: auditIntentId,
      actorUserId: preparer.uid,
      correlationId,
      idempotencyKey: stableIdemKey,
      atUtc: now,
    }),
  );
  if (!intentCreate.ok) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: intentCreate.message,
      denials: [`audit_intent_${intentCreate.code}`],
      blocker: `audit_intent_${intentCreate.code}`,
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: financeFr6ApplyTotalWrites(port.getWriteCounter()),
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const adjCreate = await port.createAdjustmentDoc(
    buildFinanceFr6AdjustmentDoc({
      createdByUserId: preparer.uid,
      approvedByUserId: approver.uid,
      correlationId,
      idempotencyKey: stableIdemKey,
      createdAtUtc: now,
      approvedAtUtc: now,
    }),
  );
  if (!adjCreate.ok) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: adjCreate.message,
      denials: [`adjustment_${adjCreate.code}`],
      blocker: `adjustment_${adjCreate.code}`,
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: financeFr6ApplyTotalWrites(port.getWriteCounter()),
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const idemCreate = await port.createIdempotencyDoc(
    buildFinanceFr6PilotIdempotencyDoc({
      actorUserId: preparer.uid,
      approverUserId: approver.uid,
      correlationId,
      auditIntentId,
      auditResultId,
      atUtc: now,
    }),
  );
  if (!idemCreate.ok) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: idemCreate.message,
      denials: [`idempotency_${idemCreate.code}`],
      blocker: `idempotency_${idemCreate.code}`,
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: financeFr6ApplyTotalWrites(port.getWriteCounter()),
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const resultCreate = await port.createAuditDoc(
    auditResultId,
    buildFinanceFr6PilotAuditResultDoc({
      id: auditResultId,
      actorUserId: preparer.uid,
      correlationId,
      idempotencyKey: stableIdemKey,
      atUtc: now,
      outcome: "applied",
    }),
  );
  if (!resultCreate.ok) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: resultCreate.message,
      denials: [`audit_result_${resultCreate.code}`],
      blocker: `audit_result_${resultCreate.code}`,
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: financeFr6ApplyTotalWrites(port.getWriteCounter()),
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const c = port.getWriteCounter();
  if (!financeFr6ApplyForbiddenWritesZero(c)) {
    const summary = emptyFinanceFr6ApplySafeSummary({
      overallStatus: "CONFLICT_NO_GO",
      message: "forbidden collection write detected",
      denials: ["forbidden_write"],
      blocker: "forbidden_write",
    });
    stampIam(summary);
    return {
      status: "CONFLICT_NO_GO",
      passMarker: null,
      productionWrites: financeFr6ApplyTotalWrites(c),
      writeCounts: countsFromPort(port),
      summary,
    };
  }

  const writeCounts = countsFromPort(port);
  const summary = emptyFinanceFr6ApplySafeSummary({
    overallStatus: "APPLIED",
    message: "FR6 append-only adjustment applied",
  });
  summary.productionWrites = writeCounts.totalProductionWrites;
  summary.writeCounts = writeCounts;
  summary.expectedWrites = FINANCE_FR6_EXPECTED_WRITE_COUNTS;
  stampIam(summary);

  return {
    status: "APPLIED",
    passMarker: FINANCE_FR6_ADJUSTMENT_PILOT_PASS,
    productionWrites: writeCounts.totalProductionWrites,
    writeCounts,
    summary,
  };
}
