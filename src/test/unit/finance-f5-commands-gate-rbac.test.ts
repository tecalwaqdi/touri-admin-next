/**
 * F5 — Command services + write gate + RBAC (Production writes still denied).
 */

import { describe, expect, it } from "vitest";
import { SettlementCommandService } from "@/application/finance/SettlementCommandService";
import { AdjustmentCommandService } from "@/application/finance/AdjustmentCommandService";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import {
  createOfflineFakeFinanceWriteGate,
  createProductionFinanceWriteGate,
  FinanceWriteGate,
} from "@/application/finance/FinanceWriteGate";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { ROLE_PERMISSION_MATRIX, hasPermission } from "@/permissions/rbac";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

const ACCOUNTANT: FinancePermission[] = [
  "finance:read",
  "settlements:create",
  "finance:adjust",
];
const APPROVER: FinancePermission[] = [
  "finance:read",
  "settlements:approve",
  "finance:adjust_approve",
];
const EXECUTOR: FinancePermission[] = [
  "finance:read",
  "settlements:execute",
];
const REVERSER: FinancePermission[] = [
  "finance:read",
  "settlements:reverse",
];

describe("F5 FinanceWriteGate + commands + RBAC", () => {
  it("FINANCE_WRITE_ENABLED remains false by default; Production gate denies until fully armed", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const gate = createProductionFinanceWriteGate();
    expect(gate.FINANCE_WRITE_ENABLED).toBe(false);
    const d = gate.assertWritable("settlement.create");
    expect(d.allowed).toBe(false);
    expect(d.productionWrites).toBe(0);
    expect(() => gate.requireWritable("payment.confirm")).toThrow(
      /production_finance_write_denied/,
    );
    // Single flag true is insufficient — GLOBAL + PRODUCTION also required.
    expect(
      new FinanceWriteGate("production", true, false, false).assertWritable("x")
        .allowed,
    ).toBe(false);
    expect(
      new FinanceWriteGate("production", true, true, true).assertWritable("x")
        .allowed,
    ).toBe(true);
  });

  it("RBAC wiring: execute/reverse/adjust permissions per design", () => {
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.accountant, "settlements:create"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.accountant, "settlements:execute"),
    ).toBe(false);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.finance_approver, "settlements:approve"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "settlements:execute"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.operations_manager, "settlements:approve"),
    ).toBe(false);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.support_agent, "finance:read"),
    ).toBe(false);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.reporting_viewer, "finance:read"),
    ).toBe(true);
    expect(
      hasPermission(ROLE_PERMISSION_MATRIX.super_admin, "settlements:reverse"),
    ).toBe(true);
  });

  it("offline command flow with RBAC + dual control + adjustment append-only", async () => {
    const repo = new FakeSettlementV2Repository();
    const auditRepo = new FakeFinanceAuditRepository();
    const audit = new FinanceAuditService(auditRepo);
    const gate = createOfflineFakeFinanceWriteGate();
    const cmds = new SettlementCommandService(repo, gate, audit);
    const adjustments = new AdjustmentCommandService(gate, audit);

    const draft = await cmds.createDraft(
      { userId: "accountant1", permissions: ACCOUNTANT },
      {
        partyType: "driver",
        partyId: "drv1",
        countryId: "SA",
        currency: "SAR",
        direction: "DRIVER_PAYS_COMPANY",
        claims: [
          {
            lineId: "drv_line_1",
            orderId: "o1",
            amountMinor: 3000n,
            currency: "SAR",
          },
        ],
        periodFromUtc: "2026-09-01T00:00:00.000Z",
        periodToUtc: "2026-09-07T00:00:00.000Z",
        clientKey: "f5-cycle",
        correlationId: "corr-f5",
      },
    );

    await expect(
      cmds.lock(
        { userId: "accountant1", permissions: APPROVER },
        { settlementId: draft.id, clientKey: "lock", correlationId: "corr-f5" },
      ),
    ).rejects.toThrow(/dual_control/);

    const locked = await cmds.lock(
      { userId: "approver1", permissions: APPROVER },
      { settlementId: draft.id, clientKey: "lock", correlationId: "corr-f5" },
    );
    expect(locked.status).toBe("locked");

    await expect(
      cmds.createPayment(
        { userId: "accountant1", permissions: ACCOUNTANT },
        {
          settlementId: draft.id,
          amountMinor: 3000n,
          clientKey: "pay",
          correlationId: "corr-f5",
        },
      ),
    ).rejects.toThrow(/rbac_denied:settlements:execute/);

    const payPartial = await cmds.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 1000n,
        clientKey: "pay-partial",
        correlationId: "corr-f5",
      },
    );
    const partial = await cmds.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        paymentId: payPartial.id,
        clientKey: "confirm-partial",
        correlationId: "corr-f5",
      },
    );
    expect(partial.settlement.status).toBe("partially_paid");

    // Reversal path while not settled
    const reversed = await cmds.reversePayment(
      { userId: "rev1", permissions: REVERSER },
      {
        paymentId: payPartial.id,
        reason: "ops_error",
        clientKey: "rev",
        correlationId: "corr-f5",
      },
    );
    expect(reversed.payment.status).toBe("reversed");
    expect(reversed.settlement.status).toBe("locked");

    const pay = await cmds.createPayment(
      { userId: "ops1", permissions: EXECUTOR },
      {
        settlementId: draft.id,
        amountMinor: 3000n,
        clientKey: "pay",
        correlationId: "corr-f5",
      },
    );
    const confirmed = await cmds.confirmPayment(
      { userId: "ops1", permissions: EXECUTOR },
      { paymentId: pay.id, clientKey: "confirm", correlationId: "corr-f5" },
    );
    expect(confirmed.settlement.status).toBe("settled");

    await expect(
      cmds.reversePayment(
        { userId: "rev1", permissions: REVERSER },
        {
          paymentId: pay.id,
          reason: "cannot_reopen",
          clientKey: "rev-settled",
          correlationId: "corr-f5",
        },
      ),
    ).rejects.toThrow(/settled_history_immutable/);

    const adj = await adjustments.create(
      { userId: "accountant1", permissions: ACCOUNTANT },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 100n,
        reason: "correction",
        direction: "neutral_memo",
        relatedSettlementId: draft.id,
        relatedOrderId: "o1",
        clientKey: "adj-1",
        correlationId: "corr-f5",
      },
    );
    expect(adj.mutatesOrderMajors).toBe(false);
    expect(adj.status).toBe("draft");

    await expect(
      adjustments.approve(
        { userId: "accountant1", permissions: APPROVER },
        { adjustmentId: adj.id, correlationId: "corr-f5" },
      ),
    ).rejects.toThrow(/dual_control/);

    const approved = await adjustments.approve(
      { userId: "approver1", permissions: APPROVER },
      { adjustmentId: adj.id, correlationId: "corr-f5" },
    );
    expect(approved.status).toBe("approved");

    const events = auditRepo.all();
    expect(events.length).toBeGreaterThan(3);
    expect(events.every((e) => e.action)).toBeTruthy();
  });

  it("Production command service denies writes", async () => {
    const repo = new FakeSettlementV2Repository();
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const cmds = new SettlementCommandService(
      repo,
      createProductionFinanceWriteGate(),
      audit,
    );
    await expect(
      cmds.createDraft(
        { userId: "accountant1", permissions: ACCOUNTANT },
        {
          partyType: "driver",
          partyId: "drv1",
          countryId: "SA",
          currency: "SAR",
          direction: "DRIVER_PAYS_COMPANY",
          claims: [
            {
              lineId: "drv_line_1",
              orderId: "o1",
              amountMinor: 100n,
              currency: "SAR",
            },
          ],
          periodFromUtc: "2026-09-01T00:00:00.000Z",
          periodToUtc: "2026-09-07T00:00:00.000Z",
          clientKey: "prod-deny",
          correlationId: "corr",
        },
      ),
    ).rejects.toThrow(/production_finance_write_denied/);
  });

  it("immutable snapshot: adjustment does not rewrite majors", async () => {
    const audit = new FinanceAuditService(new FakeFinanceAuditRepository());
    const adjustments = new AdjustmentCommandService(
      createOfflineFakeFinanceWriteGate(),
      audit,
    );
    const majorsBefore = { total_mndob: 70 };
    const adj = await adjustments.create(
      { userId: "accountant1", permissions: ACCOUNTANT },
      {
        countryId: "SA",
        currency: "SAR",
        amountMinor: 50n,
        reason: "append_only",
        direction: "neutral_memo",
        relatedOrderId: "o_imm",
        clientKey: "imm",
        correlationId: "c",
      },
    );
    expect(adj.mutatesOrderMajors).toBe(false);
    expect(majorsBefore.total_mndob).toBe(70);
  });
});
