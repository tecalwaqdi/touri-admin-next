import { describe, expect, it, vi } from "vitest";
import { listProductionFinancialPeriods } from "@/application/production-read/ProductionFinancialPeriods";
import { mapFinancialPeriodDoc } from "@/application/finance/periods/FinancialPeriodService";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
const client = (): FirestoreReadClient => ({ getDocument: vi.fn(), query: vi.fn(async () => ({ docs: [
  { id: "a", exists: true, data: { countryRef: "countries/saudi_arabia", name: "May", status: "reopened", startAt: "2026-05-01T00:00:00Z", endAt: "2026-06-01T00:00:00Z" } },
  { id: "b", exists: true, data: { countryId: "kyrgyzstan", status: "closed" } },
], nextCursor: "b" })) });
describe("production financial periods", () => {
  it("reads canonical values and retains cursor after scope filtering", async () => {
    const c = client(); const r = await listProductionFinancialPeriods(c, { type: "country", countryIds: ["SA"] }, new URLSearchParams("limit=999"));
    expect(r.items).toHaveLength(1); expect(r.items[0]).toMatchObject({ label: "May", status: "open", periodFromUtc: "2026-05-01T00:00:00Z" });
    expect(r).toMatchObject({ nextCursor: "b", synthetic: false, sourceLabel: "production" });
    expect(c.query).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, collection: "financial_periods" }));
  });
  it("never turns a source failure into an empty list", async () => {
    const c = client(); vi.mocked(c.query).mockRejectedValueOnce(new Error("UNAVAILABLE"));
    await expect(listProductionFinancialPeriods(c, { type: "global" }, new URLSearchParams())).rejects.toThrow("UNAVAILABLE");
  });
  it("denies an empty scope before any read", async () => {
    const c = client(); await expect(listProductionFinancialPeriods(c, { type: "country" }, new URLSearchParams())).rejects.toThrow(); expect(c.query).not.toHaveBeenCalled();
  });
  it("unknown status does not accidentally become open", () => {
    expect(mapFinancialPeriodDoc({ id: "x", data: { status: "not_open" } }).status).toBe("unknown");
  });
});
