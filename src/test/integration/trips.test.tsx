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
        const cursor = u.searchParams.get("cursor");
        const pageIndex = cursor ? 2 : 1;
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                kind: "trip_list",
                id: `trip_p${pageIndex}`,
                status: "completed",
                customerId: "cust_1",
                customerDisplayRef: "cust_1",
                driverId: "drv_1",
                driverDisplayRef: "drv_1",
                agentId: "agent_sa_1",
                countryId: "saudi_arabia",
                canonicalCountryId: "saudi_arabia",
                cityId: "riyadh",
                pickupLandmarkId: null,
                destinationLandmarkId: null,
                createdAtUtc: "2026-09-01T00:00:00.000Z",
                scheduledAtUtc: null,
                paymentMethod: "cash",
                currencyCode: "SAR",
                grossFare: {
                  amount: 10,
                  unit: "major",
                  currencyCode: "SAR",
                  availability: "available",
                },
                cancellation: { isCancelled: false, reason: null },
                dataQualityWarnings: [],
              },
            ],
            nextCursor: cursor ? null : "cursor_page_2",
            truncated: !cursor,
            pageSize: 20,
            synthetic: true,
          }),
        };
      }),
    );
  });

  it("paginates trips list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TripsPage />);
    await waitFor(() => expect(screen.getByTestId("trips-table")).toBeInTheDocument());
    expect(screen.getByTestId("trips-page").textContent).toContain("1");
    await user.click(screen.getByTestId("trips-next"));
    await waitFor(() => {
      expect(screen.getByTestId("trips-page").textContent).toContain("2");
    });
  });
});
