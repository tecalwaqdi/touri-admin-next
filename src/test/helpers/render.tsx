import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { AuthProvider } from "@/auth/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>{children}</I18nProvider>
    </AuthProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: AllProviders });
}

export async function loginAsSuperAdmin() {
  window.localStorage.setItem(
    "touri_admin_next_session_v1",
    JSON.stringify({
      id: "user_super",
      email: "super@touri.local",
      displayName: "Super Admin",
      role: "super_admin",
      locale: "en",
      scope: { type: "global" },
      status: "active",
    }),
  );
}

export async function loginAsAccountant() {
  window.localStorage.setItem(
    "touri_admin_next_session_v1",
    JSON.stringify({
      id: "user_accountant",
      email: "accountant@touri.local",
      displayName: "Accountant",
      role: "accountant",
      locale: "en",
      scope: { type: "global" },
      status: "active",
    }),
  );
}
