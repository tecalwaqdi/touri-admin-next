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
