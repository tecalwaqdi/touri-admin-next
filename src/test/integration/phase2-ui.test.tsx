import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { SettlementsPage } from "@/features/settlements/SettlementsPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";
import { SEED_STATS } from "@/test/fixtures/seed";
import { getEnv } from "@/config/env";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settlements",
  useSearchParams: () => new URLSearchParams(),
}));

describe("phase 2 UI surfaces", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("renders settlements list with synthetic badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "SET-SA-001",
              partyType: "agent",
              partyId: "AGT-SA-001",
              status: "draft",
              countryId: "SA",
              currencyCode: "SAR",
              tripIds: ["TRIP-SA-001"],
            },
          ],
          synthetic: true,
        }),
      })),
    );
    renderWithProviders(<SettlementsPage />);
    await waitFor(() => expect(screen.getByTestId("settlements-list")).toBeInTheDocument());
    expect(screen.getByTestId("synthetic-badge").textContent).toMatch(/Synthetic/i);
  });

  it("renders audit list filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              auditId: "AUDIT-SEED-001",
              actorUserId: "user_super",
              actorRole: "super_admin",
              action: "login",
              resourceType: "session",
              resourceId: null,
              environment: "development",
              createdAtUtc: "2026-09-01T00:00:00.000Z",
              correlationId: "corr_1",
            },
          ],
        }),
      })),
    );
    renderWithProviders(<AuditPage />);
    await waitFor(() => expect(screen.getByTestId("audit-list")).toBeInTheDocument());
    expect(screen.getByTestId("audit-actor-filter")).toBeInTheDocument();
  });

  it("renders report filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          meta: {
            currency: "SAR",
            periodFromUtc: null,
            periodToUtc: null,
            scope: "global",
            scopeCountryIds: [],
            scopeAgentIds: [],
            sourceCompleteness: "complete",
            incompleteReasons: [],
            policyBlockers: [],
            reconciliationStatus: "PASS",
            lastAuthoritativeUpdateUtc: null,
            productionApproved: false,
            synthetic: true,
            piiMasked: true,
          },
          reportType: "finance_dashboard",
          headers: ["metric", "amountMinor", "currency", "availability", "incompleteReasons"],
          rows: [
            ["platformCommission", "1500", "SAR", "available", ""],
          ],
          totalAmountMinor: "1500",
          currencyCode: "SAR",
          requiresReportsExport: true,
        }),
      })),
    );
    renderWithProviders(<ReportsPage />);
    await waitFor(() => expect(screen.getByTestId("report-result")).toBeInTheDocument());
    expect(screen.getByTestId("report-type")).toBeInTheDocument();
  });

  it("keeps production read/write disabled and seed sizes", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(SEED_STATS.customers).toBeGreaterThanOrEqual(50);
    expect(SEED_STATS.drivers).toBeGreaterThanOrEqual(40);
    expect(SEED_STATS.agents).toBeGreaterThanOrEqual(5);
    expect(SEED_STATS.trips).toBeGreaterThanOrEqual(150);
    expect(SEED_STATS.auditEvents).toBeGreaterThanOrEqual(100);
  });
});
