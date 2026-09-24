import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "@/features/auth/LoginPage";
import { renderWithProviders } from "@/test/helpers/render";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
}));

describe("login integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("renders login form and authenticates", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
    });

    await user.clear(screen.getByTestId("login-email"));
    await user.type(screen.getByTestId("login-email"), "super@touri.local");
    await user.clear(screen.getByTestId("login-password"));
    await user.type(screen.getByTestId("login-password"), "password");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("routes accountant login to finance workspace", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByTestId("login-form")).toBeInTheDocument();
    });

    await user.clear(screen.getByTestId("login-email"));
    await user.type(screen.getByTestId("login-email"), "accountant@touri.local");
    await user.clear(screen.getByTestId("login-password"));
    await user.type(screen.getByTestId("login-password"), "password");
    await user.click(screen.getByTestId("login-submit"));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/finance");
    });
  });

  it("shows error on invalid credentials", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(screen.getByTestId("login-form")).toBeInTheDocument());
    await user.clear(screen.getByTestId("login-password"));
    await user.type(screen.getByTestId("login-password"), "wrong");
    await user.click(screen.getByTestId("login-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
    });
  });
});
