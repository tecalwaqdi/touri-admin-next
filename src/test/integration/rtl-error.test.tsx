import { describe, expect, it, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "@/components/layout/Header";
import { ErrorState } from "@/components/states/QueryStates";
import { loginAsSuperAdmin, renderWithProviders } from "@/test/helpers/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard",
}));

describe("rtl/ltr and error state", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await loginAsSuperAdmin();
  });

  it("switches locale between English and Arabic", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Header />);
    await waitFor(() => expect(screen.getByTestId("locale-switch")).toBeInTheDocument());
    const select = screen.getByTestId("locale-switch") as HTMLSelectElement;
    expect(select.value).toBe("en");
    await user.selectOptions(select, "ar");
    await waitFor(() => {
      expect((screen.getByTestId("locale-switch") as HTMLSelectElement).value).toBe("ar");
    });
  });

  it("renders error state without infinite spinner", async () => {
    renderWithProviders(<ErrorState message="Boom" />);
    expect(screen.getByTestId("error-state")).toHaveTextContent("Boom");
    expect(screen.queryByTestId("loading-state")).not.toBeInTheDocument();
  });
});
