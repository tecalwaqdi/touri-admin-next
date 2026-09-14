import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { DriverDetailPage } from "@/features/drivers/DriverDetailPage";
import { AgentDetailPage } from "@/features/agents/AgentDetailPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/drivers/DRV-SA-001",
}));

describe("driver and agent details", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("shows separate driver status fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/reports")) {
          return {
            ok: true,
            json: async () => ({
              rows: [{ id: "DRV-SA-001", amountMinor: "1000", currencyCode: "SAR" }],
              currencyCode: "SAR",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "DRV-SA-001",
            name: "Driver SA 001",
            phone: "+966",
            email: "a@x",
            countryId: "SA",
            cityId: "riyadh",
            agentId: "AGT-SA-001",
            registrationStatus: "approved",
            approvalStatus: "approved",
            availabilityStatus: "online",
            vehiclePlate: "SA-1",
            rating: 4.8,
            tripCount: 10,
            createdAtUtc: "2026-01-01T00:00:00.000Z",
            lastSeenAtUtc: null,
          }),
        };
      }),
    );
    renderWithProviders(<DriverDetailPage driverId="DRV-SA-001" />);
    await waitFor(() => expect(screen.getByTestId("driver-detail")).toBeInTheDocument());
    expect(screen.getByTestId("registration-status").textContent).toBe("approved");
    expect(screen.getByTestId("approval-status").textContent).toBe("approved");
    expect(screen.getByTestId("availability-status").textContent).toBe("online");
  });

  it("shows agent country and status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/settlements") || url.includes("/api/finance/")) {
          return { ok: true, json: async () => ({ items: [] }) };
        }
        if (url.includes("/api/reports")) {
          return {
            ok: true,
            json: async () => ({
              rows: [{ id: "AGT-SA-001", amountMinor: "500", currencyCode: "SAR" }],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "AGT-SA-001",
            name: "Saudi Active Agent",
            countryId: "SA",
            status: "active",
            commissionPlaceholder: "Policy pending",
            driversCount: 28,
            tripsCount: 910,
            activeFromUtc: null,
            activeToUtc: null,
            createdAtUtc: "2026-01-01T00:00:00.000Z",
            history: [],
          }),
        };
      }),
    );
    renderWithProviders(<AgentDetailPage agentId="AGT-SA-001" />);
    await waitFor(() => expect(screen.getByTestId("agent-detail")).toBeInTheDocument());
    expect(screen.getByTestId("agent-country").textContent).toBe("SA");
    expect(screen.getByTestId("agent-status").textContent).toBe("active");
  });
});
