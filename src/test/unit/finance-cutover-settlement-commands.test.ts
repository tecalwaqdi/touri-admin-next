import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettlementCommandService } from "@/application/finance/SettlementCommandService";
import { FinanceAuditService } from "@/application/finance/FinanceAuditService";
import { createOfflineFakeFinanceWriteGate } from "@/application/finance/FinanceWriteGate";
import { FakeSettlementV2Repository } from "@/repositories/fake/FakeSettlementV2Repository";
import { FakeFinanceAuditRepository } from "@/repositories/fake/FakeFinanceAuditRepository";
import { FinanceCutoverWriteBlockedError } from "@/domain/finance/cutover/FinanceCutoverWriteGuard";
import { resetEnvCache } from "@/config/env";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

const PREPARER: FinancePermission[] = ["settlements:prepare", "settlements:create"];
const EXECUTOR: FinancePermission[] = ["settlements:execute"];

const CUTOVER = "2026-09-30T21:00:00.000Z";
const BEFORE = "2026-09-30T20:59:59.000Z";
const EXACT = "2026-09-30T21:00:00.000Z";
const AFTER = "2026-09-30T21:00:01.000Z";

describe("SettlementCommandService cutover boundary", () => {
  const prevDate = process.env.FINANCE_CUTOVER_DATE;
  const prevApproved = process.env.FINANCE_CUTOVER_APPROVED;

  beforeEach(() => {
    process.env.FINANCE_CUTOVER_DATE = "2026-10-01";
    process.env.FINANCE_CUTOVER_APPROVED = "true";
    resetEnvCache();
  });

  afterEach(() => {
    if (prevDate === undefined) delete process.env.FINANCE_CUTOVER_DATE;
    else process.env.FINANCE_CUTOVER_DATE = prevDate;
    if (prevApproved === undefined) delete process.env.FINANCE_CUTOVER_APPROVED;
    else process.env.FINANCE_CUTOVER_APPROVED = prevApproved;
    resetEnvCache();
  });

  function service() {
    return new SettlementCommandService(
      new FakeSettlementV2Repository(),
      createOfflineFakeFinanceWriteGate(),
      new FinanceAuditService(new FakeFinanceAuditRepository()),
    );
  }

  const baseDraft = {
    partyType: "driver" as const,
    partyId: "drv1",
    countryId: "SA",
    currency: "SAR",
    direction: "DRIVER_PAYS_COMPANY" as const,
    claims: [
      {
        lineId: "l1",
        orderId: "ord1",
        amountMinor: 1000n,
        currency: "SAR",
      },
    ],
    correlationId: "corr",
  };

  it("rejects settlement prepare 1s before cutover", async () => {
    const svc = service();
    await expect(
      svc.createDraft(
        { userId: "u1", permissions: PREPARER },
        {
          ...baseDraft,
          periodFromUtc: BEFORE,
          periodToUtc: AFTER,
          clientKey: "before",
        },
      ),
    ).rejects.toBeInstanceOf(FinanceCutoverWriteBlockedError);
  });

  it("allows settlement prepare at exact cutover instant", async () => {
    const svc = service();
    const draft = await svc.createDraft(
      { userId: "u1", permissions: PREPARER },
      {
        ...baseDraft,
        periodFromUtc: EXACT,
        periodToUtc: "2026-10-31T20:59:59.999Z",
        clientKey: "exact",
      },
    );
    expect(draft.periodFromUtc).toBe(EXACT);
  });

  it("allows settlement prepare 1s after cutover", async () => {
    const svc = service();
    const draft = await svc.createDraft(
      { userId: "u1", permissions: PREPARER },
      {
        ...baseDraft,
        periodFromUtc: AFTER,
        periodToUtc: "2026-10-31T20:59:59.999Z",
        clientKey: "after",
      },
    );
    expect(draft.periodFromUtc).toBe(AFTER);
  });

  it("rejects payment on pre-cutover settlement period", async () => {
    process.env.FINANCE_CUTOVER_APPROVED = "false";
    resetEnvCache();

    const repo = new FakeSettlementV2Repository();
    const svc = new SettlementCommandService(
      repo,
      createOfflineFakeFinanceWriteGate(),
      new FinanceAuditService(new FakeFinanceAuditRepository()),
    );
    const draft = await svc.createDraft(
      { userId: "u1", permissions: PREPARER },
      {
        ...baseDraft,
        periodFromUtc: BEFORE,
        periodToUtc: CUTOVER,
        clientKey: "prepay",
      },
    );

    process.env.FINANCE_CUTOVER_APPROVED = "true";
    resetEnvCache();

    await expect(
      svc.createPayment(
        { userId: "ops", permissions: EXECUTOR },
        {
          settlementId: draft.id,
          amountMinor: 1000n,
          clientKey: "pay",
          correlationId: "c",
        },
      ),
    ).rejects.toBeInstanceOf(FinanceCutoverWriteBlockedError);
  });
});
