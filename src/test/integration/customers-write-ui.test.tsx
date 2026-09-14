import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerDetailPage } from "@/features/customers/CustomerDetailPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/customers/CUS-SA-001",
}));

describe("Customers Production Rollout — UI actions", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("shows legal enabled actions and confirms disable", async () => {
    const user = userEvent.setup();
    let status: "active" | "blocked" | "inactive" = "active";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/customers/CUS-SA-001/disable") && init?.method === "POST") {
          status = "inactive";
          return {
            ok: true,
            json: async () => ({
              id: "CUS-SA-001",
              name: "Customer SA 001",
              phone: "+8000000001",
              email: "cus.sa.001@customers.local",
              countryId: "SA",
              cityId: "riyadh",
              tripCount: 1,
              completedTrips: 0,
              cancelledTrips: 0,
              status,
              createdAtUtc: "2025-02-15T00:00:00.000Z",
              write: {
                status: "applied",
                action: "disable",
                fromState: "enabled",
                toState: "disabled",
                authWriteExecuted: false,
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "CUS-SA-001",
            name: "Customer SA 001",
            phone: "+8000000001",
            email: "cus.sa.001@customers.local",
            countryId: "SA",
            cityId: "riyadh",
            tripCount: 1,
            completedTrips: 0,
            cancelledTrips: 0,
            status,
            createdAtUtc: "2025-02-15T00:00:00.000Z",
          }),
        };
      }),
    );

    renderWithProviders(<CustomerDetailPage customerId="CUS-SA-001" />);

    await waitFor(() => {
      expect(screen.getByTestId("customer-status")).toHaveTextContent("active");
    });
    expect(screen.getByTestId("customer-action-disable")).toBeInTheDocument();
    expect(screen.getByTestId("customer-action-block")).toBeInTheDocument();

    await user.click(screen.getByTestId("customer-action-disable"));
    expect(screen.getByTestId("customer-action-confirm")).toBeInTheDocument();
    await user.click(screen.getByTestId("customer-action-confirm-yes"));

    await waitFor(() => {
      expect(screen.getByTestId("customer-status")).toHaveTextContent("inactive");
      expect(screen.getByTestId("customer-action-success")).toBeInTheDocument();
    });
    expect(screen.getByTestId("customer-action-enable")).toBeInTheDocument();
  });
});
