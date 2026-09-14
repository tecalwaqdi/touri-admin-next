import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isForbiddenUiImport } from "@/infrastructure/production/ArchitectureBoundary";
import { DashboardService } from "@/application/dashboard/DashboardService";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("architecture + FR7 UI contracts", () => {
  it("presentation layers never import Firestore / production infra", () => {
    const roots = [
      join(process.cwd(), "src/features"),
      join(process.cwd(), "src/components"),
      join(process.cwd(), "src/app"),
    ];
    const files = roots.flatMap((r) => walk(r));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes("/api/")) continue;
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/from\s+['"]([^'"]+)['"]/);
        if (!m) continue;
        if (isForbiddenUiImport(m[1])) {
          offenders.push(`${file}: ${m[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("DashboardService does not import FinancialCalculationService / Money calc", () => {
    const src = readFileSync(
      join(process.cwd(), "src/application/dashboard/DashboardService.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/FinancialCalculationService/);
    expect(src).not.toMatch(/Money\./);
    expect(src).toMatch(/financeSource: "fr7_reporting_read_service"/);
  });

  it("FR7 golden totals match UI-facing service dashboard commission", () => {
    const svc = new FinanceReportingReadService(buildFinanceFr7GoldenSourceBundle());
    const dash = svc.dashboard({
      userId: "u",
      role: "accountant",
      permissions: ["finance:read"],
      scope: { type: "global" },
    });
    expect(dash.company.platformCommission.amountMinor).toBe(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    );
    expect(dash.company.grossBookingValue.amountMinor).toBe(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.grossFareMinor,
    );
    expect(dash.byCurrency.every((g) => Boolean(g.currency))).toBe(true);
  });

  it("keeps FINANCE_WRITE_ENABLED false (Production writes = 0 path)", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("DashboardService returns null money fields (no fake zeros)", async () => {
    const trips = {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      }),
    };
    const drivers = {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      }),
    };
    const customers = {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      }),
    };
    const svc = new DashboardService(trips as never, drivers as never, customers as never);
    const m = await svc.getMetrics();
    expect(m.cashCollected).toBeNull();
    expect(m.onlineCollected).toBeNull();
    expect(m.platformCommission).toBeNull();
    expect(m.financeSource).toBe("fr7_reporting_read_service");
  });
});
