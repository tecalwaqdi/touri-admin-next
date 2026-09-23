/**
 * Unit tests — FR1 Production accounting snapshot materialization (dry-run + apply).
 */

import { describe, expect, it } from "vitest";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import {
  AccountingSnapshotMaterializeService,
  detectMajorInconsistency,
} from "@/application/finance/materialize/AccountingSnapshotMaterializeService";
import { createFakeAccountingSnapshotMaterializePorts } from "@/adapters/finance/materialize/WifAccountingSnapshotMaterializeAdapters";
import type { FinanceFr1CalculatedSnapshot } from "@/application/finance/pilot/FinanceFr1PilotCalculator";
import { evaluateCertifiedAccountingSnapshotEligibility } from "@/domain/finance/v2/CertifiedSnapshotEligibility";

const ACTOR = {
  userId: "admin_test",
  role: "super_admin",
  permissions: ["settlements:prepare", "settlements:create", "finance:read"] as const,
  countryIds: null as string[] | null,
};

function eligibleOrder(overrides: Record<string, unknown> = {}) {
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
    driver_id: "drv_1",
    ...overrides,
  };
}

describe("AccountingSnapshotMaterializeService", () => {
  it("documents Domain eligibility predicates", () => {
    const ok = evaluateCertifiedAccountingSnapshotEligibility({
      lifecycleStatus: "completed",
      lifecycleCompleted: true,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
    });
    expect(ok.eligible).toBe(true);
    expect(ok.trigger).toBe("trip_completed_and_payment_complete");

    const blocked = evaluateCertifiedAccountingSnapshotEligibility({
      lifecycleStatus: "driver_assigned",
      paymentChannel: "cash",
      paymentStatus: "pending",
    });
    expect(blocked.eligible).toBe(false);
    expect(blocked.blockers).toContain("trip_not_completed");
    expect(blocked.blockers).toContain("payment_not_complete");
  });

  it("dry-run classifies eligible / missing / already materialized — zero writes", async () => {
    const missingDriverNet: Record<string, unknown> = {
      status_code: "completed",
      PaymentMethod: "Cash",
      payment_status: "cash_collected",
      currency: "SAR",
      country_id: "saudi_arabia",
      total_mndob2: 100,
      total_app: 15,
      total_vat: 0,
      total: 100,
    };
    const ports2 = createFakeAccountingSnapshotMaterializePorts({
      orders: {
        ord_ok: eligibleOrder(),
        ord_missing: missingDriverNet,
        ord_done: eligibleOrder(),
      },
      snapshots: {
        ord_done: { orderId: "ord_done" },
      },
    });

    const svc = new AccountingSnapshotMaterializeService(
      ports2,
      createOfflineFakeFinanceWriteGate(),
    );
    const result = await svc.run({
      actor: { ...ACTOR, permissions: [...ACTOR.permissions] },
      dryRun: true,
      orderIds: ["ord_ok", "ord_missing", "ord_done"],
      clientKey: "test_dry",
      correlationId: "corr_dry",
    });

    expect(result.dryRun).toBe(true);
    expect(result.productionWrites).toBe(0);
    expect(result.orderMutations).toBe(0);
    expect(result.eligible.map((e) => e.orderId)).toContain("ord_ok");
    expect(result.alreadyMaterialized.map((e) => e.orderId)).toContain("ord_done");
    expect(result.missingFinancialFacts.map((e) => e.orderId)).toContain(
      "ord_missing",
    );
    expect(result.samples[0]?.sourceFields.gross).toBe("order.total_mndob2");
    expect(result.samples[0]?.platformCommissionMinor).toBe("1500");
  });

  it("apply creates snapshot once; retry is idempotent; order untouched", async () => {
    const order = eligibleOrder();
    const ports = createFakeAccountingSnapshotMaterializePorts({
      orders: { ord_apply: order },
    });
    const gate = createOfflineFakeFinanceWriteGate();
    const svc = new AccountingSnapshotMaterializeService(ports, gate);

    const first = await svc.run({
      actor: { ...ACTOR, permissions: [...ACTOR.permissions] },
      dryRun: false,
      orderIds: ["ord_apply"],
      applyLimit: 5,
      clientKey: "test_apply",
      correlationId: "corr_apply",
    });
    expect(first.created).toHaveLength(1);
    expect(first.productionWrites).toBe(4);
    expect(first.orderMutations).toBe(0);

    const snap = await ports.read.getSnapshot("ord_apply");
    expect(snap.exists).toBe(true);
    expect(snap.data?.commissionAmountPersistedMinor).toBe("1500");
    expect(snap.data?.historicalReRateForbidden).toBe(true);
    expect(snap.data?.mutatesOrderMajors).toBe(false);
    expect(snap.data?.financePilot).toBe(false);

    const orderAfter = await ports.read.getOrder("ord_apply");
    expect(orderAfter.data?.total_app).toBe(15);
    expect(orderAfter.data?.total_mndob).toBe(85);

    const second = await svc.run({
      actor: { ...ACTOR, permissions: [...ACTOR.permissions] },
      dryRun: false,
      orderIds: ["ord_apply"],
      clientKey: "test_apply",
      correlationId: "corr_apply_2",
    });
    expect(second.created).toHaveLength(0);
    expect(second.alreadyMaterialized.map((e) => e.orderId)).toContain(
      "ord_apply",
    );
  });

  it("detects majors inconsistency without auto-fix", () => {
    const calculated = {
      grossFareMinor: "10000",
      commissionAmountPersistedMinor: "1500",
      vatAmountMinor: "0",
      driverNetMinor: "9999",
    } as FinanceFr1CalculatedSnapshot;
    const issues = detectMajorInconsistency(calculated);
    expect(issues[0]).toMatch(/majors_inconsistent/);
  });

  it("production gate denies apply when finance writes not armed", async () => {
    const ports = createFakeAccountingSnapshotMaterializePorts({
      orders: { ord_x: eligibleOrder() },
    });
    const svc = new AccountingSnapshotMaterializeService(
      ports,
      createProductionFinanceWriteGate({
        FINANCE_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: true,
        PRODUCTION_WRITE_ENABLED: true,
      }),
    );
    await expect(
      svc.run({
        actor: { ...ACTOR, permissions: [...ACTOR.permissions] },
        dryRun: false,
        orderIds: ["ord_x"],
        clientKey: "x",
        correlationId: "x",
      }),
    ).rejects.toThrow(/production_finance_write_denied/);
  });

  it("caps apply batch at 5", async () => {
    const orders: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 8; i += 1) {
      // Keep majors internally consistent (gross − app − vat = mndob).
      orders[`ord_${i}`] = eligibleOrder({
        total_mndob2: 100,
        total_app: 15,
        total_vat: 0,
        total_mndob: 85,
        driver_id: `drv_${i}`,
      });
    }
    const ports = createFakeAccountingSnapshotMaterializePorts({ orders });
    const svc = new AccountingSnapshotMaterializeService(
      ports,
      createOfflineFakeFinanceWriteGate(),
    );
    const result = await svc.run({
      actor: { ...ACTOR, permissions: [...ACTOR.permissions] },
      dryRun: false,
      orderIds: Object.keys(orders),
      applyLimit: 99,
      clientKey: "batch",
      correlationId: "batch",
    });
    expect(result.errors).toEqual([]);
    expect(result.inconsistent).toEqual([]);
    expect(result.created).toHaveLength(5);
  });
});
