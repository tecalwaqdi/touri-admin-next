import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ settlement: vi.fn(), exportSource: vi.fn(), permission: vi.fn() }));
vi.mock("@/infrastructure/http/apiAuth", () => ({
  resolveApiActor: vi.fn(async () => ({ user: { id: "operator" }, correlationId: "c", requestId: "r" })),
  requirePermission: mocks.permission,
  UnauthorizedError: class extends Error {},
}));
vi.mock("@/application/finance/reporting/getFinanceReportingReadService", async (original) => ({
  ...await original<typeof import("@/application/finance/reporting/getFinanceReportingReadService")>(),
  getFinanceReportingReadService: vi.fn(async () => ({ settlement: mocks.settlement, exportSource: mocks.exportSource })),
  toFinanceReportingActor: vi.fn(() => ({ userId: "operator", scope: { type: "country", countryIds: ["SA"] } })),
}));
import { POST } from "@/app/api/reports/print/settlement/[id]/route";
import { GET as reports } from "@/app/api/reports/route";
import { GET as csv } from "@/app/api/reports/export/route";
const request = (body = {}) => new Request("https://admin.local/api/reports/print/settlement/s1", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "s1" }) };
describe("authoritative report endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settlement.mockReturnValue({ id: "s1", status: "locked", currency: "SAR", amountMinor: "1500", outstandingMinor: null, countryId: "saudi_arabia", partyIdToken: "masked-party", payments: [{ id: "p1", amountMinor: null, currency: "SAR", status: "pending" }] });
    mocks.exportSource.mockReturnValue({ reportType: "finance_dashboard", headers: ["metric", "amountMinor"], rows: [["grossFare", "1500"]], meta: { synthetic: false } });
  });
  it("ignores forged browser money, status, party and payments", async () => {
    const res = await POST(request({ totalMinor: "999999", status: "paid", partyLabel: "forged-party", payments: [{ amountMinor: "777" }] }), params);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("15.00 SAR"); expect(html).toContain("masked-party");
    expect(html).not.toContain("999999"); expect(html).not.toContain("forged-party");
    expect(html).toContain("—"); expect(html).not.toContain("0.00 SAR");
    expect(mocks.settlement).toHaveBeenCalledWith(expect.objectContaining({ userId: "operator" }), "s1");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects foreign country print and missing settlements", async () => {
    mocks.settlement.mockImplementationOnce(() => { throw new Error("cross_country_denied: outside scope"); });
    expect((await POST(request(), params)).status).toBe(403);
    mocks.settlement.mockReturnValueOnce(null);
    expect((await POST(request(), params)).status).toBe(404);
  });
  it("escapes canonical labels and localizes the receipt", async () => {
    const detail = mocks.settlement();
    mocks.settlement.mockReturnValue({ ...detail, partyIdToken: "<script>bad</script>" });
    const html = await (await POST(request({ locale: "ar" }), params)).text();
    expect(html).toContain('dir="rtl"'); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("both report paths use the same scoped FR7 export service", async () => {
    const json = await reports(new Request("https://admin.local/api/reports"));
    expect((await json.json()).meta.synthetic).toBe(false);
    const exported = await csv(new Request("https://admin.local/api/reports/export"));
    expect(exported.status).toBe(200); expect(exported.headers.get("content-type")).toContain("text/csv");
    expect(mocks.exportSource).toHaveBeenCalledTimes(2);
    expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), "reports:export");
  });
  it("rejects unknown report types instead of silently changing meaning", async () => {
    const res = await reports(new Request("https://admin.local/api/reports?type=nonexistent"));
    expect(res.status).toBe(400); expect(mocks.exportSource).not.toHaveBeenCalled();
  });
});
