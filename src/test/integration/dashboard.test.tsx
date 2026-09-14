import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard",
}));

describe("dashboard synthetic", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          totalTrips: 12,
          completedTrips: 4,
          cancelledTrips: 3,
          activeDrivers: 2,
          customers: 3,
          pendingDrivers: 1,
          cashCollected: "22000",
          onlineCollected: "15000",
          platformCommission: "1000",
          currencyCode: "SAR",
          filters: {},
          drilldowns: {
            trips: "/trips",
            drivers: "/drivers",
            completedTrips: "/trips?status=completed",
          },
          synthetic: true,
        }),
      }),
    );
  });

  it("shows synthetic badge and metrics", async () => {
    renderWithProviders(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByTestId("synthetic-badge")).toBeInTheDocument();
      expect(screen.getByTestId("dashboard-metrics")).toBeInTheDocument();
    });
    expect(screen.getByTestId("synthetic-badge").textContent).toMatch(/Synthetic Data/);
    expect(screen.getByTestId("synthetic-badge").textContent).toMatch(/بيانات تجريبية/);
  });
});
