import { describe, expect, it } from "vitest";
import { resolveDashboardPeriod } from "@/domain/dashboard/DashboardPeriod";
import { includeRowInDashboardKpi } from "@/domain/dashboard/DashboardQaPolicy";
import { incompleteKpiMeta } from "@/domain/dashboard/KpiAccuracy";
import { finalizeAggregateCount } from "@/domain/dashboard/DashboardAggregateScan";
import { PRODUCTION_STATUS_BANNER } from "@/domain/production-read/constants";

describe("dashboard aggregates & filters", () => {
  it("resolves period presets to UTC bounds", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    const today = resolveDashboardPeriod("today", undefined, now);
    expect(today.fromUtc).toBe("2026-09-20T00:00:00.000Z");
    expect(today.toUtc).toBe("2026-09-20T23:59:59.999Z");

    const all = resolveDashboardPeriod("all");
    expect(all.fromUtc).toBeUndefined();
    expect(all.toUtc).toBeUndefined();
  });

  it("excludes QA/pilot rows by default", () => {
    expect(
      includeRowInDashboardKpi(
        { id: "real_1", mappingStatus: "validMapped" },
        false,
      ),
    ).toBe(true);
    expect(
      includeRowInDashboardKpi(
        { id: "x", mappingStatus: "testOrNoncanonical" },
        false,
      ),
    ).toBe(false);
    expect(
      includeRowInDashboardKpi(
        { id: "x", mappingStatus: "testOrNoncanonical" },
        true,
      ),
    ).toBe(true);
  });

  it("truncated aggregate scan yields null + incomplete (not a partial total)", () => {
    const r = finalizeAggregateCount({
      count: 999,
      truncated: true,
      pagesScanned: 20,
      excludedQaCount: 3,
    });
    expect(r.value).toBeNull();
    expect(r.meta.accuracy).toBe("incomplete");
    expect(incompleteKpiMeta().accuracy).toBe("incomplete");
  });

  it("count-scan budget is tighter than legacy 20-page hang", async () => {
    const { DASHBOARD_COUNT_SCAN_MAX_DOCS, DASHBOARD_SOURCE_DEADLINE_MS } =
      await import("@/domain/dashboard/DashboardAggregateScan");
    expect(DASHBOARD_COUNT_SCAN_MAX_DOCS).toBeLessThanOrEqual(500);
    expect(DASHBOARD_SOURCE_DEADLINE_MS).toBeLessThanOrEqual(8_000);
  });

  it("unavailable scan yields null without claiming incomplete totals", () => {
    const r = finalizeAggregateCount({
      count: 0,
      truncated: false,
      pagesScanned: 0,
      excludedQaCount: 0,
      unavailable: true,
    });
    expect(r.value).toBeNull();
    expect(r.meta.accuracy).toBe("unavailable");
  });

  it("production status banner has no SHADOW wording", () => {
    expect(PRODUCTION_STATUS_BANNER.en).toBe(
      "PRODUCTION — ADMIN OPERATIONS ENABLED",
    );
    expect(PRODUCTION_STATUS_BANNER.ar).toBe(
      "بيئة الإنتاج — عمليات الإدارة مفعلة",
    );
    expect(PRODUCTION_STATUS_BANNER.en).not.toMatch(/SHADOW/i);
    expect(PRODUCTION_STATUS_BANNER.ar).not.toMatch(/ظل/);
  });
});
