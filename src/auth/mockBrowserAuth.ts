import type { AuthUser } from "@/types/auth";
import type { Role } from "@/types/roles";
import { permissionsForRole } from "@/permissions/rbac";

export const MOCK_SESSION_STORAGE_KEY = "touri_admin_next_session_v1";
export const LOCALE_STORAGE_KEY = "touri_admin_next_locale_v1";

type StoredSession = {
  email: string;
  role: Role;
  displayName: string;
  id: string;
  locale: "ar" | "en";
  scope: AuthUser["scope"];
  status: AuthUser["status"];
};

const DEMO_USERS: Record<string, Omit<AuthUser, "permissions">> = {
  "super@touri.local": {
    id: "user_super",
    email: "super@touri.local",
    displayName: "Super Admin",
    role: "super_admin",
    scope: { type: "global" },
    status: "active",
    locale: "en",
  },
  "ops@touri.local": {
    id: "user_ops",
    email: "ops@touri.local",
    displayName: "Operations Manager",
    role: "operations_manager",
    scope: { type: "global" },
    status: "active",
    locale: "en",
  },
  "sa-admin@touri.local": {
    id: "user_sa_admin",
    email: "sa-admin@touri.local",
    displayName: "Saudi Country Admin",
    role: "country_admin",
    scope: { type: "country", countryIds: ["SA"] },
    status: "active",
    locale: "ar",
  },
  "agent-sa@touri.local": {
    id: "user_agent_sa",
    email: "agent-sa@touri.local",
    displayName: "Agent User SA",
    role: "agent_user",
    scope: { type: "agent", agentIds: ["AGT-SA-001"], countryIds: ["SA"] },
    status: "active",
    locale: "ar",
  },
  "accountant@touri.local": {
    id: "user_accountant",
    email: "accountant@touri.local",
    displayName: "Accountant",
    role: "accountant",
    scope: { type: "global" },
    status: "active",
    locale: "en",
  },
  "disabled@touri.local": {
    id: "user_disabled",
    email: "disabled@touri.local",
    displayName: "Disabled User",
    role: "support_agent",
    scope: { type: "global" },
    status: "disabled",
    locale: "en",
  },
};

export function toAuthUser(base: Omit<AuthUser, "permissions">): AuthUser {
  return { ...base, permissions: permissionsForRole(base.role) };
}

export function readStoredMockSession(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(MOCK_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    return toAuthUser({
      id: stored.id,
      email: stored.email,
      displayName: stored.displayName,
      role: stored.role,
      scope: stored.scope,
      status: stored.status,
      locale: stored.locale,
    });
  } catch {
    return null;
  }
}

export function persistMockSession(user: AuthUser): void {
  const stored: StoredSession = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    locale: user.locale,
    scope: user.scope,
    status: user.status,
  };
  window.localStorage.setItem(MOCK_SESSION_STORAGE_KEY, JSON.stringify(stored));
}

export function clearMockSession(): void {
  window.localStorage.removeItem(MOCK_SESSION_STORAGE_KEY);
}

export async function mockBrowserLogin(
  email: string,
  password: string,
): Promise<AuthUser> {
  await new Promise((r) => setTimeout(r, 150));

  if (password !== "password") {
    throw new Error("Invalid credentials");
  }

  const base = DEMO_USERS[email.toLowerCase()];
  if (!base) {
    throw new Error("User not found");
  }

  const user = toAuthUser(base);
  if (user.status !== "active") {
    throw new Error(`Account ${user.status}`);
  }

  persistMockSession(user);
  return user;
}

export function readStoredLocale(): "ar" | "en" | null {
  const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return v === "ar" || v === "en" ? v : null;
}

export function persistLocale(locale: "ar" | "en"): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}
