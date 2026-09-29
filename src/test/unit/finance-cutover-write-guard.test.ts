import { describe, expect, it } from "vitest";
import {
  clampPeriodFromToApprovedCutover,
  evaluateNewPeriodFinanceWrite,
  evaluateNewPeriodSettlementWindow,
  extractOrderFinanceSourceEventUtc,
} from "@/domain/finance/cutover/FinanceCutoverWriteGuard";
import { resolveFinanceCutoverDate } from "@/domain/finance/cutover/FinanceCutoverConfig";

const CUTOVER = "2026-09-30T21:00:00.000Z";
const BEFORE = "2026-09-30T20:59:59.000Z"; // 1s before
const EXACT = "2026-09-30T21:00:00.000Z";
const AFTER = "2026-09-30T21:00:01.000Z"; // 1s after

function approvedCutover() {
  return resolveFinanceCutoverDate({
    cutoverDate: "2026-10-01",
    timezone: "Asia/Riyadh",
    approved: true,
  });
}

describe("finance cutover write guard", () => {
  it("resolves approved cutover to Riyadh midnight UTC instant", () => {
    const c = approvedCutover();
    expect(c.cutoverUtcInstant).toBe(CUTOVER);
    expect(c.approved).toBe(true);
  });

  it("denies source event 1 second before cutover", () => {
    const d = evaluateNewPeriodFinanceWrite({
      sourceEventUtc: BEFORE,
      operation: "auto_finalize",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("PRE_CUTOVER_SOURCE_EVENT");
  });

  it("allows source event at exact cutover instant", () => {
    const d = evaluateNewPeriodFinanceWrite({
      sourceEventUtc: EXACT,
      operation: "snapshot_materialize",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.code).toBe("ON_OR_AFTER_CUTOVER");
  });

  it("allows source event 1 second after cutover", () => {
    const d = evaluateNewPeriodFinanceWrite({
      sourceEventUtc: AFTER,
      operation: "settlement_prepare",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(true);
  });

  it("denies missing source event time (fail closed)", () => {
    const d = evaluateNewPeriodFinanceWrite({
      sourceEventUtc: null,
      operation: "auto_finalize",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("SOURCE_EVENT_TIME_MISSING");
  });

  it("denies settlement period starting before cutover", () => {
    const d = evaluateNewPeriodSettlementWindow({
      periodFromUtc: BEFORE,
      periodToUtc: AFTER,
      operation: "settlement_prepare",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("PRE_CUTOVER_SOURCE_EVENT");
  });

  it("allows settlement period starting at cutover", () => {
    const d = evaluateNewPeriodSettlementWindow({
      periodFromUtc: EXACT,
      periodToUtc: "2026-10-31T20:59:59.999Z",
      operation: "settlement_payment",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(true);
  });

  it("denies reconciliation window before cutover", () => {
    const d = evaluateNewPeriodSettlementWindow({
      periodFromUtc: "2026-09-01T00:00:00.000Z",
      periodToUtc: BEFORE,
      operation: "reconciliation",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(false);
  });

  it("clamps KPI periodFrom earlier than cutover when approved", () => {
    const clamped = clampPeriodFromToApprovedCutover({
      periodFromUtc: "2026-01-01T00:00:00.000Z",
      cutover: approvedCutover(),
    });
    expect(clamped).toBe(CUTOVER);
  });

  it("defaults KPI periodFrom to cutover when omitted and approved", () => {
    const clamped = clampPeriodFromToApprovedCutover({
      periodFromUtc: null,
      cutover: approvedCutover(),
    });
    expect(clamped).toBe(CUTOVER);
  });

  it("extracts order completion time for guard input", () => {
    expect(
      extractOrderFinanceSourceEventUtc({
        completedAt: BEFORE,
      }),
    ).toBe(BEFORE);
    expect(
      extractOrderFinanceSourceEventUtc({
        paidAt: AFTER,
      }),
    ).toBe(AFTER);
  });

  it("blocks wallet period movement before cutover", () => {
    const d = evaluateNewPeriodFinanceWrite({
      sourceEventUtc: BEFORE,
      operation: "wallet_period_movement",
      cutover: approvedCutover(),
    });
    expect(d.allowed).toBe(false);
  });

  it("does not enforce settlement window until cutover is approved", () => {
    const unapproved = resolveFinanceCutoverDate({
      cutoverDate: "2026-10-01",
      timezone: "Asia/Riyadh",
      approved: false,
    });
    const d = evaluateNewPeriodSettlementWindow({
      periodFromUtc: BEFORE,
      periodToUtc: AFTER,
      operation: "settlement_prepare",
      cutover: unapproved,
    });
    expect(d.allowed).toBe(true);
  });
});
