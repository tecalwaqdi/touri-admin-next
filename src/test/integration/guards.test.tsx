import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { AuthGuard } from "@/components/guards/AuthGuard";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  loginAsAccountant,
  loginAsSuperAdmin,
  renderWithProviders,
} from "@/test/helpers/render";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/drivers",
}));

describe("protected route and forbidden", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("redirects unauthenticated users to login", async () => {
    renderWithProviders(
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>,
    );
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/login");
    });
  });

  it("shows forbidden when permission missing", async () => {
    await loginAsAccountant();
    renderWithProviders(
      <AuthGuard>
        <PermissionGuard permission="drivers:approve">
          <div data-testid="secret">secret</div>
        </PermissionGuard>
      </AuthGuard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("forbidden-state")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("secret")).not.toBeInTheDocument();
  });

  it("allows authorized content", async () => {
    await loginAsSuperAdmin();
    renderWithProviders(
      <AuthGuard>
        <PermissionGuard permission="drivers:approve">
          <div data-testid="secret">secret</div>
        </PermissionGuard>
      </AuthGuard>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("secret")).toBeInTheDocument();
    });
  });
});
