/**
 * Finance forward correctness — auto-snapshot QA fixture flow + display isolation.
 */

import { describe, expect, it } from "vitest";
import { createOfflineFakeFinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { createFakeAccountingSnapshotMaterializePorts } from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import {
  FinanceForwardAutoSnapshotService,
  FINANCE_DQ_MAJORS_INCONSISTENT_ACTION,
} from "@/application/finance/materialize/FinanceForwardAutoSnapshotService";
import {
  classifyTripFinanceDisplayState,
} from "@/domain/finance/TripFinanceDisplayState";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";
import { collectFinanceForwardDiagnostics } from "@/application/finance/reporting/FinanceForwardDiagnostics";
import { buildDashboardSummary } from "@/domain/finance/reporting/FinanceReportingAggregator";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";

const ACTOR = {
  userId: "admin_forward",
  role: "super_admin",
  permissions: [
    "settlements:prepare",
    "settlements:create",
    "finance:read",
  ] as string[],
  countryIds: null as string[] | null,
};

function qaEligibleOrder(overrides: Record<string, unknown> = {}) {
  return {
    status_code: "completed",
    PaymentMethod: "Cash",
    payment_status: "cash_collected",
    currency: "SAR",
    country_id: "saudi_arabia",
    total_mndob2: 100,
    total_app: 15,
    total_vat: 0,
    total_mndob: 85,
    total: 100,
    driver_id: "drv_qa_1",
    ...overrides,
  };
}

describe("FinanceForwardAutoSnapshotService QA flow", () => {
  it("completed → cash_collected → majors → snapshot once; retry no duplicate", async () => {
    const orderId = "demo_fin_forward_auto_001";
    const ports = createFakeAccountingSnapshotMaterializePorts({
      orders: { [orderId]: qaEligibleOrder() },
    });
    const gate = createOfflineFakeFinanceWriteGate();
    const service = new FinanceForwardAutoSnapshotService(ports, gate);

    const first = await service.finalizeOrder({
      actor: ACTOR,
      orderId,
      dryRun: false,
      correlationId: "corr_forward_1",
      includeQaFixtures: true,
    });
    expect(first.outcome).toBe("created");
    expect(first.snapshotId).toBe(orderId);
    expect(first.productionWrites).toBeGreaterThan(0);
    expect(first.orderMutations).toBe(0);
    expect(first.settlementWrites).toBe(0);

    const snap = await ports.read.getSnapshot(orderId);
    expect(snap.exists).toBe(true);

    const retry = await service.finalizeOrder({
      actor: ACTOR,
      orderId,
      dryRun: false,
      correlationId: "corr_forward_2",
      includeQaFixtures: true,
    });
    expect(retry.outcome).toBe("already_materialized");
    expect(retry.productionWrites).toBe(0);

    const dash = buildDashboardSummary({
      bundle: {
        ...buildFinanceFr7GoldenSourceBundle(),
        snapshots: [
          {
            id: orderId,
            orderId,
            countryId: "saudi_arabia",
            currency: "SAR",
            paymentMethod: "cash",
            grossFareMinor: 10000n,
            eligibleRevenueMinor: 10000n,
            commissionAmountPersistedMinor: 1500n,
            vatAmountMinor: 0n,
            driverDeductionsMinor: 1500n,
            driverNetMinor: 8500n,
            gatewayFeeMinor: 0n,
            driverId: "drv_qa_1",
            agentId: null,
            agentShareMinor: null,
            agentAttributionStatus: "missing",
            lifecycleCompleted: true,
            createdAtUtc: new Date().toISOString(),
            commissionRatePercent: null,
          },
        ],
      },
    });
    expect(dash.company.grossBookingValue.availability).toBe("available");
    expect(dash.certifiedSnapshotCount).toBe(1);
  });

  it("fail-closed inconsistency → DQ audit, no snapshot", async () => {
    const orderId = "demo_fin_forward_conflict_001";
    const audits: Array<{ id: string; data: Record<string, unknown> }> = [];
    const base = createFakeAccountingSnapshotMaterializePorts({
      orders: {
        [orderId]: qaEligibleOrder({
          total_mndob2: 50,
          total_app: 10,
          total_vat: 5,
          total_mndob: 43, // expected 35
        }),
      },
    });
    const ports = {
      read: base.read,
      write: {
        ...base.write,
        async createAudit(id: string, data: Record<string, unknown>) {
          audits.push({ id, data });
          return base.write.createAudit(id, data);
        },
      },
    };
    const service = new FinanceForwardAutoSnapshotService(
      ports,
      createOfflineFakeFinanceWriteGate(),
    );
    const result = await service.finalizeOrder({
      actor: ACTOR,
      orderId,
      dryRun: false,
      correlationId: "corr_dq",
      includeQaFixtures: true,
    });
    expect(result.outcome).toBe("inconsistent_dq_alerted");
    expect(result.dqAlertCreated).toBe(true);
    expect(result.snapshotId).toBeNull();
    const snap = await ports.read.getSnapshot(orderId);
    expect(snap.exists).toBe(false);
    expect(audits[0]?.data.action).toBe(FINANCE_DQ_MAJORS_INCONSISTENT_ACTION);
  });
});

describe("TripFinanceDisplayState + i18n", () => {
  it("labels historical incomplete and conflict in Arabic", () => {
    expect(presentFinanceTerm("historicalFinancialIncomplete", "ar")).toBe(
      "بيانات مالية تاريخية غير مكتملة",
    );
    expect(presentFinanceTerm("historicalFinancialConflict", "ar")).toBe(
      "تعارض مالي تاريخي",
    );
  });

  it("classifies incomplete vs conflict without inventing zeros", () => {
    const incomplete = classifyTripFinanceDisplayState({
      orderId: "ord_inc",
      data: {
        status_code: "completed",
        PaymentMethod: "Cash",
        payment_status: "cash_collected",
        currency: "SAR",
        country_id: "saudi_arabia",
        total_app: 15,
        total_vat: 0,
      },
    });
    expect(incomplete.state).toBe("historical_incomplete");
    expect(incomplete.excludeFromCertifiedTotals).toBe(true);

    const conflict = classifyTripFinanceDisplayState({
      orderId: "ord_cf",
      data: qaEligibleOrder({
        total_mndob2: 50,
        total_app: 10,
        total_vat: 5,
        total_mndob: 43,
      }),
    });
    expect(conflict.state).toBe("historical_conflict");
    expect(conflict.excludeFromSettlementV2).toBe(true);
  });
});

describe("FinanceForwardDiagnostics isolation", () => {
  it("counts incomplete/conflict/pending without mixing into certified money", async () => {
    const orders = [
      {
        id: "real_ok",
        data: qaEligibleOrder({ production_financial: true }),
      },
      {
        id: "real_incomplete",
        data: {
          status_code: "cancelled_by_driver",
          PaymentMethod: "Cash",
          payment_status: "pending_cash",
          currency: "SAR",
          country_id: "saudi_arabia",
          total_app: 7.5,
          total_vat: 0,
        },
      },
      {
        id: "real_conflict",
        data: qaEligibleOrder({
          total_mndob2: 42.5,
          total_app: 7.5,
          total_vat: 0,
          total_mndob: 43,
        }),
      },
      {
        id: "real_pending",
        data: qaEligibleOrder({
          payment_status: "pending_cash",
          production_financial: true,
        }),
      },
    ];
    const snapshots = new Set<string>(["real_ok"]);
    const diag = await collectFinanceForwardDiagnostics({
      port: {
        async listOrdersPage() {
          return { docs: orders, nextCursor: null };
        },
        async getSnapshotExists(id) {
          return snapshots.has(id);
        },
      },
    });
    expect(diag.certifiedSnapshotCount).toBe(1);
    expect(diag.historicalIncompleteCount).toBe(1);
    expect(diag.financialConflictCount).toBe(1);
    expect(diag.pendingUncollectedCount).toBe(1);
    expect(diag.productionWrites).toBe(0);
  });
});
