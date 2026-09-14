import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentDetailPage } from "@/features/agents/AgentDetailPage";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/agents/AGT-SA-000",
}));

describe("Agents Production Rollout — UI actions", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("shows Activate for inactive agent and confirms", async () => {
    const user = userEvent.setup();
    let status = "inactive";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (
          url.includes("/api/settlements") ||
          url.includes("/api/reports") ||
          url.includes("/api/finance/")
        ) {
          return { ok: true, json: async () => ({ items: [], rows: [] }) };
        }
        if (url.includes("/api/agents/AGT-SA-000/activate") && init?.method === "POST") {
          status = "active";
          return {
            ok: true,
            json: async () => ({
              id: "AGT-SA-000",
              name: "Previous Riyadh Agent",
              countryId: "SA",
              status: "active",
              commissionPlaceholder: "Synthetic — deferred",
              driversCount: 12,
              tripsCount: 420,
              activeFromUtc: "2026-09-13T00:00:00.000Z",
              activeToUtc: null,
              createdAtUtc: "2024-01-01T00:00:00.000Z",
              write: {
                status: "applied",
                action: "activate",
                fromState: "inactive",
                toState: "active",
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "AGT-SA-000",
            name: "Previous Riyadh Agent",
            countryId: "SA",
            status,
            commissionPlaceholder: "Synthetic — deferred",
            driversCount: 12,
            tripsCount: 420,
            activeFromUtc: "2024-01-01T00:00:00.000Z",
            activeToUtc: status === "active" ? null : "2025-06-30T23:59:59.000Z",
            createdAtUtc: "2024-01-01T00:00:00.000Z",
            history: [],
          }),
        };
      }),
    );

    renderWithProviders(<AgentDetailPage agentId="AGT-SA-000" />);
    await waitFor(() => expect(screen.getByTestId("agent-write-actions")).toBeInTheDocument());
    expect(screen.getByTestId("agent-action-activate")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-action-suspend")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("agent-action-activate"));
    expect(screen.getByTestId("agent-action-confirm")).toBeInTheDocument();
    await user.click(screen.getByTestId("agent-action-confirm-yes"));
    await waitFor(() =>
      expect(screen.getByTestId("agent-action-success")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("agent-status").textContent).toBe("active");
  });

  it("shows Suspend + Deactivate for active agents", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (
          url.includes("/api/settlements") ||
          url.includes("/api/reports") ||
          url.includes("/api/finance/")
        ) {
          return { ok: true, json: async () => ({ items: [], rows: [] }) };
        }
        return {
          ok: true,
          json: async () => ({
            id: "AGT-SA-001",
            name: "Saudi Active Agent",
            countryId: "SA",
            status: "active",
            commissionPlaceholder: "Synthetic — deferred",
            driversCount: 8,
            tripsCount: 100,
            activeFromUtc: "2025-07-01T00:00:00.000Z",
            activeToUtc: null,
            createdAtUtc: "2025-06-15T00:00:00.000Z",
            history: [],
          }),
        };
      }),
    );

    renderWithProviders(<AgentDetailPage agentId="AGT-SA-001" />);
    await waitFor(() => expect(screen.getByTestId("agent-write-actions")).toBeInTheDocument());
    expect(screen.getByTestId("agent-action-suspend")).toBeInTheDocument();
    expect(screen.getByTestId("agent-action-deactivate")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-action-activate")).not.toBeInTheDocument();
  });
});
