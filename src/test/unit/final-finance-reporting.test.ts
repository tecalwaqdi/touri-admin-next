import { describe, expect, it } from "vitest";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import { buildFinanceFr7GoldenSourceBundle, mapProductionDocsToFr7Bundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { ProductionFinanceReportingReadAdapter } from "@/adapters/finance/reporting/ProductionFinanceReportingReadAdapter";
import { createFakeFinanceReportingRoFirestorePort } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import type { FinanceReportingActor } from "@/application/finance/reporting/FinanceReportingScope";
const global: FinanceReportingActor = { userId: "u", role: "accountant", permissions: ["finance:read", "reports:export"], scope: { type: "global" } };
describe("actual finance source, scope and report semantics", () => {
  it("loads business IDs outside the historical pilot chain and classifies malformed records", async () => {
    const port = createFakeFinanceReportingRoFirestorePort({ docs: {
      financial_settlements: {
        business: { partyType: "driver", partyId: "driver1", countryId: "SA", currency: "SAR", status: "locked", amountMinor: "1500", paidConfirmedMinor: null },
        malformed: { amountMinor: "9000" },
      },
    } });
    const loaded = await new ProductionFinanceReportingReadAdapter(port).load();
    expect(loaded.bundle.settlements).toHaveLength(1);
    expect(loaded.bundle.settlements[0]).toMatchObject({ id: "business", amountMinor: 1500n, paidConfirmedMinor: null, sourceOrderId: null });
    expect(loaded.bundle.activeAgentByCountry).toEqual({});
    expect(loaded.bundle.sourceWarnings).toContain("malformed_financial_records_excluded");
    expect(loaded.productionWrites).toBe(0);
  });
  it("never assigns missing production relationships or currency to a pilot fixture", () => {
    const bundle = mapProductionDocsToFr7Bundle({ snapshot: { id: "real", countryId: "SA" }, settlement: null, payment: null, adjustment: null, synthetic: false });
    expect(bundle.activeAgentByCountry).toEqual({});
    expect(bundle.snapshots[0]).toMatchObject({ driverId: null, orderId: "", currency: "", lifecycleCompleted: false, grossFareMinor: null });
  });
  it("fails closed for unassigned or unsupported finance scopes", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    for (const scope of [{ type: "country" as const, countryIds: [] }, { type: "agent" as const, agentIds: [] }, { type: "city" as const, cityIds: ["city1"] }]) {
      expect(() => svc.dashboard({ ...global, scope })).toThrow(/scope_denied/);
    }
  });
  it("multi-country scope cannot broaden into global data", () => {
    const b = buildFinanceFr7GoldenSourceBundle();
    b.settlements.push({ ...b.settlements[0]!, id: "foreign", countryId: "kyrgyzstan" });
    const svc = new FinanceReportingReadService(b);
    const actor = { ...global, scope: { type: "country" as const, countryIds: ["SA", "russia"] } };
    expect(svc.settlements(actor).map(s => s.id)).not.toContain("foreign");
    expect(() => svc.settlement(actor, "foreign")).toThrow(/cross_country_denied/);
  });
  it("agent cannot print another party's settlement in the same country", () => {
    const b = buildFinanceFr7GoldenSourceBundle();
    const svc = new FinanceReportingReadService(b);
    const actor = { ...global, scope: { type: "agent" as const, countryIds: ["SA"], agentIds: ["agent-other"] } };
    expect(() => svc.settlement(actor, b.settlements[0]!.id)).toThrow(/scope_denied/);
    expect(svc.settlements(actor)).toEqual([]);
  });
  it("different report types contain their actual records and never sum unrelated metrics", () => {
    const b = buildFinanceFr7GoldenSourceBundle();
    const svc = new FinanceReportingReadService(b);
    const settlement = svc.exportSource(global, "settlement_summary", { countryId: "SA" });
    expect(settlement.headers).toContain("settlementId"); expect(settlement.rows[0]![0]).toBe(b.settlements[0]!.id);
    const corrections = svc.exportSource(global, "corrections_visibility", { countryId: "SA" });
    expect(corrections.headers).toContain("kind");
    const driver = svc.exportSource(global, "driver_finance", { countryId: "SA", driverId: b.snapshots[0]!.driverId });
    expect(driver.rows.map(r => r[0])).toContain("grossEarnings");
    expect(driver.totalAmountMinor).toBeNull();
    expect(() => svc.exportSource(global, "agent_finance")).toThrow(/validation_failed/);
  });
});
