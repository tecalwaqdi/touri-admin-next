/**
 * F3 — Reconciliation offline + shadow variance reports.
 */

import { describe, expect, it } from "vitest";
import { ReconciliationService } from "@/application/finance/ReconciliationService";
import { FakeReconciliationRepository } from "@/repositories/fake/FakeReconciliationRepository";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { buildTripFinancialSnapshot } from "@/domain/finance/v2/TripFinancialSnapshot";
import { buildDriverAccountingLine } from "@/domain/finance/v2/AccountingLine";
import { hasBlockerVariance } from "@/domain/reconciliation/Variance";

describe("F3 ReconciliationService", () => {
  it("emits blocker variance when line ≠ settlement claim", async () => {
    const repo = new FakeReconciliationRepository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const svc = new ReconciliationService(
      repo,
      createOfflineFakeFinanceWriteGate(),
      audit,
    );
    const snap = buildTripFinancialSnapshot({
      orderId: "o1",
      currency: "SAR",
      grossFareMinor: 10000n,
      customerTotalMinor: 10000n,
      platformCommissionMinor: 1500n,
      vatAmountMinor: 1500n,
      driverNetMinor: 7000n,
      paymentChannel: "cash",
      paymentStatus: "cash_collected",
      lifecycleCompleted: true,
    });
    const line = buildDriverAccountingLine(snap, "drv1");
    const run = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "recon-1",
      correlationId: "c1",
      snapshots: [
        {
          orderId: "o1",
          orderMajorDriverNetMinor: 7000n,
          accountingLine: line,
          settlementClaimMinor: 9999n, // mismatch
        },
      ],
    });
    expect(run.shadowOnly).toBe(true);
    expect(run.productionWrites).toBe(0);
    expect(run.status).toBe("completed");
    expect(hasBlockerVariance(run.variances)).toBe(true);
    expect(
      run.variances.some((v) => v.reasonCode === "line_claim_mismatch"),
    ).toBe(true);
    expect(
      run.variances.some((v) => v.reasonCode === "chargeback_not_represented"),
    ).toBe(true);
  });

  it("idempotent recon.run returns prior result", async () => {
    const repo = new FakeReconciliationRepository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const svc = new ReconciliationService(
      repo,
      createOfflineFakeFinanceWriteGate(),
      audit,
    );
    const a = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "same-key",
      correlationId: "c1",
      snapshots: [],
    });
    const b = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "same-key",
      correlationId: "c1",
      snapshots: [],
    });
    expect(b.id).toBe(a.id);
  });

  it("cross-country fail-closed variance", async () => {
    const repo = new FakeReconciliationRepository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const svc = new ReconciliationService(
      repo,
      createOfflineFakeFinanceWriteGate(),
      audit,
    );
    const run = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "xcountry",
      correlationId: "c1",
      snapshots: [],
      settlements: [
        {
          id: "s_ae",
          partyType: "driver",
          partyId: "d1",
          countryId: "AE",
          currency: "SAR",
          status: "locked",
          direction: "DRIVER_PAYS_COMPANY",
          amountMinor: 100n,
          paidConfirmedMinor: 0n,
          periodFromUtc: "2026-09-01T00:00:00.000Z",
          periodToUtc: "2026-09-07T00:00:00.000Z",
          claims: [],
          createdByUserId: "a",
          lockedByUserId: "b",
          voidedByUserId: null,
          idempotencyKey: "k",
          correlationId: "c",
          createdAtUtc: "2026-09-01T00:00:00.000Z",
          updatedAtUtc: "2026-09-01T00:00:00.000Z",
          dueAtUtc: null,
          productionApproved: false,
        },
      ],
    });
    expect(
      run.variances.some((v) => v.reasonCode === "cross_country_fail_closed"),
    ).toBe(true);
  });

  it("refund session flagged; order majors unchanged concept", async () => {
    const repo = new FakeReconciliationRepository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const svc = new ReconciliationService(
      repo,
      createOfflineFakeFinanceWriteGate(),
      audit,
    );
    const run = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "refund",
      correlationId: "c1",
      snapshots: [
        {
          orderId: "o_ref",
          orderMajorDriverNetMinor: 7000n,
          refundSessionMinor: 2000n,
        },
      ],
    });
    expect(
      run.variances.some(
        (v) => v.reasonCode === "refund_session_present_majors_immutable",
      ),
    ).toBe(true);
  });

  it("Production gate: recon does not write Production (productionWrites=0)", async () => {
    const repo = new FakeReconciliationRepository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const svc = new ReconciliationService(
      repo,
      createProductionFinanceWriteGate(),
      audit,
    );
    const run = await svc.run({
      actor: { userId: "u1", permissions: ["finance:read"] },
      countryId: "SA",
      currency: "SAR",
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: "2026-09-07T00:00:00.000Z",
      clientKey: "prod-shadow",
      correlationId: "c1",
      snapshots: [],
    });
    expect(run.productionWrites).toBe(0);
    expect(await repo.get(run.id)).toBeNull(); // not persisted under production gate
  });
});
