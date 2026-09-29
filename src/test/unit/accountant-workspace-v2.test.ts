import { describe, expect, it } from "vitest";
import {
  classifyAccountantSettlement,
  classifyAccountantSnapshot,
} from "@/domain/finance/reporting/AccountantDataClassification";
import {
  countByDataClass,
  projectGlobalFinancialExplorer,
} from "@/domain/finance/reporting/AccountantGlobalFinancialExplorer";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
import { resolveAccountantDatePreset } from "@/domain/ui/accountantDatePresets";
import { ACCOUNTANT_NAV_HREFS } from "@/domain/ui/accountantWorkspace";

const GLOBAL_ACTOR: FinanceReportingActor = {
  userId: "acct-1",
  role: "accountant",
  permissions: ["finance:read", "reports:export"],
  scope: { type: "global" },
};

describe("accountant workspace V2 — classification + explorer", () => {
  it("exposes accountant nav sections including previous finance archive", () => {
    expect(ACCOUNTANT_NAV_HREFS).toHaveLength(11);
    expect(ACCOUNTANT_NAV_HREFS[9]).toBe("/finance/explorer");
    expect(ACCOUNTANT_NAV_HREFS[10]).toBe("/finance/archive");
  });

  it("classifies certified vs incomplete snapshots", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const snap = {
      ...bundle.snapshots[0]!,
      id: "acct_snap_prod_001",
      orderId: "order_prod_001",
    };
    expect(
      classifyAccountantSnapshot({ snapshot: snap }).dataClass,
    ).toBe("certified");
    expect(
      classifyAccountantSnapshot({
        snapshot: { ...snap, lifecycleCompleted: false, grossFareMinor: null },
      }).dataClass,
    ).toBe("incomplete");
  });

  it("projects explorer rows without mixing into dashboard certified totals", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const rows = projectGlobalFinancialExplorer(bundle, {}, { limit: 100 });
    expect(rows.length).toBeGreaterThan(0);
    const byClass = countByDataClass(rows);
    expect(Object.values(byClass).reduce((a, b) => a + b, 0)).toBe(rows.length);

    const svc = new FinanceReportingReadService(bundle);
    const explorer = svc.globalFinancialExplorer(GLOBAL_ACTOR, {
      includePilotRecords: true,
    });
    expect(explorer.officialTotalsIsolated).toBe(true);
    expect(explorer.items.length).toBeGreaterThan(0);

    const dash = svc.dashboard(GLOBAL_ACTOR, { includePilotRecords: false });
    // Certified dashboard path remains commercial cutover — explorer can be wider.
    expect(dash.company.grossBookingValue).toBeDefined();
  });

  it("classifies orphan settlements as historical", () => {
    const bundle = buildFinanceFr7GoldenSourceBundle();
    const snaps = new Map(bundle.snapshots.map((s) => [s.id, s]));
    const orphan = bundle.settlements.find(
      (s) => !s.sourceAccountingSnapshotId,
    );
    if (orphan) {
      expect(
        classifyAccountantSettlement({
          settlement: orphan,
          snapshotsById: snaps,
        }).dataClass,
      ).toBe("historical");
    }
  });

  it("resolves date presets without inventing amounts", () => {
    const today = resolveAccountantDatePreset("today", new Date("2026-09-27T12:00:00Z"));
    expect(today?.from).toBe("2026-09-27");
    expect(today?.to).toBe("2026-09-27");
    const month = resolveAccountantDatePreset(
      "this_month",
      new Date("2026-09-27T12:00:00Z"),
    );
    expect(month?.from).toBe("2026-09-01");
    expect(resolveAccountantDatePreset("custom")).toBeNull();
  });

  it("classifies settlement list rows for recon badges", async () => {
    const { classifyAccountantSettlementListItem } = await import(
      "@/domain/finance/reporting/AccountantSettlementListClassification"
    );
    expect(
      classifyAccountantSettlementListItem({
        id: "s1",
        status: "settled",
        outstandingMinor: "0",
        amountMinor: "100",
        paidConfirmedMinor: "100",
        currency: "SAR",
        countryId: "SA",
        partyType: "driver",
        partyId: "d1",
        commercialClass: "commercial_certified",
      } as never),
    ).toBe("certified");
    expect(
      classifyAccountantSettlementListItem({
        id: "s2",
        status: "settled",
        outstandingMinor: "50",
        amountMinor: "100",
        paidConfirmedMinor: "50",
        currency: "SAR",
        countryId: "SA",
        partyType: "driver",
        partyId: "d1",
        commercialClass: "commercial_certified",
      } as never),
    ).toBe("conflict");
    expect(
      classifyAccountantSettlementListItem({
        id: "s3",
        status: "draft",
        outstandingMinor: "100",
        amountMinor: "100",
        paidConfirmedMinor: null,
        currency: "SAR",
        countryId: "SA",
        partyType: "driver",
        partyId: "d1",
        commercialClass: "legacy_orphan",
      } as never),
    ).toBe("historical");
  });
});
