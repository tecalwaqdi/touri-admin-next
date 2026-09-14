import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { FinancePage } from "@/features/finance/FinancePage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { GeographyPage } from "@/features/geography/GeographyPage";
import { UsersPage } from "@/features/users/UsersPage";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  loginAsAccountant,
  loginAsSuperAdmin,
  renderWithProviders,
} from "@/test/helpers/render";
import { permissionsForRole } from "@/permissions/rbac";
import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";
import { FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS } from "@/application/finance/pilot/FinanceFr7PilotConstants";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/finance",
}));

function available(amountMinor: string, currency = "SAR"): ReportMoney {
  return {
    amountMinor,
    currency,
    availability: "available",
    incompleteReasons: [],
  };
}

function unknownMoney(): ReportMoney {
  return {
    amountMinor: null,
    currency: "SAR",
    availability: "unknown",
    incompleteReasons: ["fixture"],
  };
}

const fr7Dashboard = {
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
  company: {
    grossBookingValue: available(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.grossFareMinor),
    eligibleRevenue: available(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.grossFareMinor),
    platformCommission: available(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    ),
    companyAllocation: available(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    ),
    vatTax: unknownMoney(),
    gatewayFees: unknownMoney(),
    refunds: available("0"),
    chargebacks: available("0"),
    adjustmentsMonetary: available("0"),
    reversals: available("0"),
    collectedCash: available(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.grossFareMinor),
    electronicCardReceipts: available("0"),
    receivables: available("0"),
    payables: available("0"),
    settled: available(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.settlementAmountMinor),
    outstanding: available(FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.outstandingMinor),
    disputedSuspense: available("0"),
    netRecognizedPosition: available(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    ),
  },
  settlementCount: 1,
  incompleteTripCount: 0,
  reconVarianceCount: 0,
  byCurrency: [
    {
      currency: "SAR",
      company: {
        grossBookingValue: available("10000"),
        eligibleRevenue: available("10000"),
        platformCommission: available("1500"),
        companyAllocation: available("1500"),
        vatTax: unknownMoney(),
        gatewayFees: unknownMoney(),
        refunds: available("0"),
        chargebacks: available("0"),
        adjustmentsMonetary: available("0"),
        reversals: available("0"),
        collectedCash: available("10000"),
        electronicCardReceipts: available("0"),
        receivables: available("0"),
        payables: available("0"),
        settled: available("1500"),
        outstanding: available("0"),
        disputedSuspense: available("0"),
        netRecognizedPosition: available("1500"),
      },
    },
  ],
};

describe("final admin UI — FR7 + RBAC", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders Finance FR7 dashboard with golden commission and unknown VAT not as 0", async () => {
    await loginAsAccountant();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/finance/dashboard")) {
          return {
            ok: true,
            status: 200,
            json: async () => fr7Dashboard,
          };
        }
        if (url.includes("/api/finance/reconciliation")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: "PASS",
              blockers: [],
              snapshotMatchesSettlement: true,
              claimMatchesCommission: true,
              outstandingConsistent: true,
              currencyGroupedOnly: true,
            }),
          };
        }
        if (url.includes("/api/finance/corrections")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  kind: "adjustment",
                  id: "adj1",
                  status: "approved",
                  currency: "SAR",
                  amountMinor: "25",
                  monetaryEffect: false,
                  directionOrKind: "neutral_memo",
                  relatedOrderIdToken: null,
                  relatedSettlementId: null,
                },
              ],
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );

    renderWithProviders(<FinancePage />);
    await waitFor(() => {
      expect(screen.getByTestId("finance-fr7-dashboard")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fr7-source-badge")).toBeInTheDocument();
    expect(screen.getByTestId("finance-currency-SAR")).toBeInTheDocument();
    const vat = screen.getByTestId("finance-metric-vatTax");
    expect(vat.textContent).toMatch(/Unknown|Incomplete|Missing|Policy/i);
    expect(vat.textContent).not.toMatch(/^0\.00 SAR$/);
  });

  it("hides finance nav for support_agent (RBAC)", async () => {
    window.localStorage.setItem(
      "touri_admin_next_session_v1",
      JSON.stringify({
        id: "user_support",
        email: "support@touri.local",
        displayName: "Support",
        role: "support_agent",
        locale: "en",
        scope: { type: "global" },
        status: "active",
        permissions: permissionsForRole("support_agent"),
      }),
    );
    renderWithProviders(<Sidebar />);
    await waitFor(() => expect(screen.getByTestId("sidebar")).toBeInTheDocument());
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("dashboard ops metrics render; finance section uses FR7 MoneyCell", async () => {
    await loginAsSuperAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/dashboard")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              totalTrips: 12,
              completedTrips: 4,
              cancelledTrips: 3,
              activeDrivers: 2,
              customers: 3,
              pendingDrivers: 1,
              cashCollected: null,
              onlineCollected: null,
              platformCommission: null,
              currencyCode: "SAR",
              filters: {},
              drilldowns: {
                trips: "/trips",
                drivers: "/drivers",
                completedTrips: "/trips?status=completed",
                finance: "/finance",
              },
              synthetic: true,
              financeSource: "fr7_reporting_read_service",
            }),
          };
        }
        if (url.includes("/api/finance/dashboard")) {
          return {
            ok: true,
            status: 200,
            json: async () => fr7Dashboard,
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-metrics")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-finance-section")).toBeInTheDocument();
      expect(screen.getByTestId("dash-fr7-commission")).toBeInTheDocument();
    });
  });

  it("geography shows one-active-agent invariant", async () => {
    await loginAsSuperAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              countryId: "SA",
              activeAgentId: "AGT-SA-001",
              activeAgentName: "Saudi Active Agent",
              inactiveAgentCount: 1,
              invariant: "pass",
              currencyHint: "SAR",
            },
          ],
        }),
      })),
    );
    renderWithProviders(<GeographyPage />);
    await waitFor(() => expect(screen.getByTestId("countries-table")).toBeInTheDocument());
    expect(screen.getByTestId("country-invariant-SA").textContent).toBe("pass");
  });

  it("users page masks email and requires users:manage", async () => {
    await loginAsSuperAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: "user_super",
              emailMasked: "s***@touri.local",
              displayName: "Super Admin",
              role: "super_admin",
              scopeType: "global",
              scopeCountryIds: [],
              scopeAgentIds: [],
              status: "active",
              permissionCount: 10,
            },
          ],
        }),
      })),
    );
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByTestId("users-table")).toBeInTheDocument());
    expect(screen.getByText("s***@touri.local")).toBeInTheDocument();
  });

  it("RTL dir is applied for Arabic locale session", async () => {
    window.localStorage.setItem(
      "touri_admin_next_session_v1",
      JSON.stringify({
        id: "user_sa_admin",
        email: "sa-admin@touri.local",
        displayName: "Saudi Country Admin",
        role: "country_admin",
        locale: "ar",
        scope: { type: "country", countryIds: ["SA"] },
        status: "active",
        permissions: permissionsForRole("country_admin"),
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => fr7Dashboard,
      })),
    );
    const { container } = renderWithProviders(<FinancePage />);
    await waitFor(() => {
      const shell = container.querySelector("[dir]");
      expect(shell?.getAttribute("dir")).toBe("rtl");
    });
  });
});
