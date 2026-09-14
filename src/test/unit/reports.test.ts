import { describe, expect, it } from "vitest";
import { ReportService, sanitizeCsvCell } from "@/application/reports/ReportService";
import { getRepositories, resetRepositoriesForTests } from "@/repositories/container";
import { AuditService } from "@/audit/AuditService";
import { seedUsers } from "@/test/fixtures/seed";
import { beforeEach } from "vitest";

describe("reports and CSV", () => {
  beforeEach(() => {
    resetRepositoriesForTests();
  });

  it("report total equals sum of detail rows", async () => {
    const repos = getRepositories();
    const service = new ReportService(
      repos.trips,
      repos.settlements,
      repos.agents,
      repos.drivers,
      repos.financialCalculation,
      new AuditService(repos.audit),
    );
    const report = await service.build("trip_financial_summary", {
      countryId: "SA",
      currencyCode: "SAR",
    });
    const sum = report.rows.reduce((acc, row) => acc + BigInt(row.amountMinor), BigInt(0));
    expect(sum.toString()).toBe(report.totalAmountMinor);
  });

  it("sanitizes CSV formula injection and audits export", async () => {
    expect(sanitizeCsvCell("=1+1")).toMatch(/^"'/);
    expect(sanitizeCsvCell("+cmd")).toMatch(/^"'/);
    expect(sanitizeCsvCell("-1")).toMatch(/^"'/);
    expect(sanitizeCsvCell("@sum")).toMatch(/^"'/);
    const repos = getRepositories();
    const service = new ReportService(
      repos.trips,
      repos.settlements,
      repos.agents,
      repos.drivers,
      repos.financialCalculation,
      new AuditService(repos.audit),
    );
    const reporter = seedUsers.find((u) => u.id === "user_reporter")!;
    await service.exportCsv(
      reporter,
      "settlement_summary",
      { currencyCode: "SAR" },
      "corr_csv_test",
    );
    const events = await repos.audit.list(10);
    expect(events.some((e) => e.action === "report_exported")).toBe(true);
  });
});
