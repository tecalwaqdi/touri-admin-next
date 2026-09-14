import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DriverDetailPage } from "@/features/drivers/DriverDetailPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/drivers/DRV-SA-003",
}));

describe("Drivers Production Rollout — UI actions", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("shows legal pending_review actions and confirms approve", async () => {
    const user = userEvent.setup();
    let registrationStatus = "pending_review";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/reports")) {
          return {
            ok: true,
            json: async () => ({
              rows: [{ id: "DRV-SA-003", amountMinor: "0", currencyCode: "SAR" }],
              currencyCode: "SAR",
            }),
          };
        }
        if (url.includes("/api/drivers/DRV-SA-003/approve") && init?.method === "POST") {
          registrationStatus = "approved";
          return {
            ok: true,
            json: async () => ({
              id: "DRV-SA-003",
              name: "Driver SA 003",
              phone: "+900",
              email: "a@x",
              countryId: "SA",
              cityId: "dammam",
              agentId: "AGT-SA-001",
              registrationStatus: "approved",
              approvalStatus: "approved",
              availabilityStatus: "unavailable",
              vehiclePlate: "SA-1003",
              rating: 3.8,
              tripCount: 9,
              createdAtUtc: "2025-04-01T00:00:00.000Z",
              lastSeenAtUtc: null,
              write: {
                status: "applied",
                action: "approve",
                fromState: "pending_review",
                toState: "approved",
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "DRV-SA-003",
            name: "Driver SA 003",
            phone: "+900",
            email: "a@x",
            countryId: "SA",
            cityId: "dammam",
            agentId: "AGT-SA-001",
            registrationStatus,
            approvalStatus: registrationStatus === "approved" ? "approved" : "pending",
            availabilityStatus: "unavailable",
            vehiclePlate: "SA-1003",
            rating: 3.8,
            tripCount: 9,
            createdAtUtc: "2025-04-01T00:00:00.000Z",
            lastSeenAtUtc: null,
          }),
        };
      }),
    );

    renderWithProviders(<DriverDetailPage driverId="DRV-SA-003" />);
    await waitFor(() => expect(screen.getByTestId("driver-write-actions")).toBeInTheDocument());
    expect(screen.getByTestId("driver-action-approve")).toBeInTheDocument();
    expect(screen.getByTestId("driver-action-reject")).toBeInTheDocument();
    expect(screen.getByTestId("driver-action-needs_changes")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-action-suspend")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("driver-action-approve"));
    expect(screen.getByTestId("driver-action-confirm")).toBeInTheDocument();
    await user.click(screen.getByTestId("driver-action-confirm-yes"));
    await waitFor(() =>
      expect(screen.getByTestId("driver-action-success")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("registration-status").textContent).toBe("approved");
  });

  it("shows Reactivate for suspended drivers only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/reports")) {
          return {
            ok: true,
            json: async () => ({ rows: [], currencyCode: "SAR" }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "DRV-SA-004",
            name: "Driver SA 004",
            phone: "+900",
            email: "a@x",
            countryId: "SA",
            cityId: "riyadh",
            agentId: "AGT-SA-001",
            registrationStatus: "suspended",
            approvalStatus: "suspended",
            availabilityStatus: "unavailable",
            vehiclePlate: "SA-1004",
            rating: 3.9,
            tripCount: 12,
            createdAtUtc: "2025-05-01T00:00:00.000Z",
            lastSeenAtUtc: null,
          }),
        };
      }),
    );

    renderWithProviders(<DriverDetailPage driverId="DRV-SA-004" />);
    await waitFor(() => expect(screen.getByTestId("driver-write-actions")).toBeInTheDocument());
    expect(screen.getByTestId("driver-action-reactivate")).toBeInTheDocument();
    expect(screen.queryByTestId("driver-action-approve")).not.toBeInTheDocument();
    expect(screen.queryByTestId("driver-action-reject")).not.toBeInTheDocument();
  });
});
