import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { ProtectedRouteBoundary } from "@/components/guards/ProtectedRouteBoundary";
const auth = vi.hoisted(() => ({ state: "initializing", user: null as null | { status: string }, pathname: "/drivers" }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ session: auth }) }));
vi.mock("@/i18n/I18nProvider", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => auth.pathname, useRouter: () => ({ replace: vi.fn() }) }));
describe("protected page hydration", () => {
 it("does not run a page's data hooks until session authorization succeeds", () => {
  const load = vi.fn(); function Page() { useEffect(load, []); return <p>Operational page</p>; }
  const tree = render(<ProtectedRouteBoundary><Page /></ProtectedRouteBoundary>);
  expect(load).not.toHaveBeenCalled();
  auth.state = "authorizing"; tree.rerender(<ProtectedRouteBoundary><Page /></ProtectedRouteBoundary>); expect(load).not.toHaveBeenCalled();
  auth.state = "authorized"; auth.user = { status: "active" }; tree.rerender(<ProtectedRouteBoundary><Page /></ProtectedRouteBoundary>);
  expect(load).toHaveBeenCalledTimes(1); expect(screen.getByText("Operational page")).toBeInTheDocument();
  auth.state = "unauthenticated"; auth.user = null; tree.rerender(<ProtectedRouteBoundary><Page /></ProtectedRouteBoundary>); expect(screen.queryByText("Operational page")).not.toBeInTheDocument();
 });
 it("keeps login mountable without an authorized session", () => {
  auth.pathname = "/login"; auth.state = "initializing"; auth.user = null;
  render(<ProtectedRouteBoundary><p>Sign in</p></ProtectedRouteBoundary>); expect(screen.getByText("Sign in")).toBeInTheDocument();
 });
});
