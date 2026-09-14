import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripsPage } from "@/features/trips/TripsPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/trips",
}));

describe("trips pagination", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const u = new URL(url, "http://localhost");
        const page = Number(u.searchParams.get("page") ?? "1");
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: `trip_p${page}`,
                customerId: "cust_1",
                customerName: "Sara",
                driverId: "drv_1",
                driverName: "Ahmed",
                agentId: "agent_sa_1",
                countryId: "SA",
                cityId: "riyadh",
                status: "completed",
                paymentMethod: "cash",
                currencyCode: "SAR",
                grossFare: 10,
                cashCollected: 10,
                onlineCollected: 0,
                createdAtUtc: "2026-09-01T00:00:00.000Z",
                completedAtUtc: "2026-09-01T01:00:00.000Z",
              },
            ],
            page,
            pageSize: 5,
            total: 12,
            totalPages: 3,
          }),
        };
      }),
    );
  });

  it("paginates trips list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TripsPage />);
    await waitFor(() => expect(screen.getByTestId("trips-table")).toBeInTheDocument());
    expect(screen.getByTestId("trips-page").textContent).toContain("1 / 3");
    await user.click(screen.getByTestId("trips-next"));
    await waitFor(() => {
      expect(screen.getByTestId("trips-page").textContent).toContain("2 / 3");
    });
  });
});
