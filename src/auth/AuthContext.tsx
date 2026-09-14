"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthMachineState, AuthSession, AuthUser } from "@/types/auth";
import { createCorrelationId } from "@/lib/ids";
import { permissionsForRole } from "@/permissions/rbac";
import type { Role } from "@/types/roles";

const STORAGE_KEY = "touri_admin_next_session_v1";

type AuthContextValue = {
  session: AuthSession;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setLocale: (locale: "ar" | "en") => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

function toAuthUser(base: Omit<AuthUser, "permissions">): AuthUser {
  return { ...base, permissions: permissionsForRole(base.role) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>({
    user: null,
    state: "initializing",
    correlationId: createCorrelationId(),
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setSession({
          user: null,
          state: "unauthenticated",
          correlationId: createCorrelationId(),
        });
        return;
      }
      const stored = JSON.parse(raw) as StoredSession;
      const user = toAuthUser({
        id: stored.id,
        email: stored.email,
        displayName: stored.displayName,
        role: stored.role,
        scope: stored.scope,
        status: stored.status,
        locale: stored.locale,
      });
      if (user.status !== "active") {
        setSession({
          user,
          state: "forbidden",
          errorMessage: `Account ${user.status}`,
          correlationId: createCorrelationId(),
        });
        return;
      }
      setSession({
        user,
        state: "authorized",
        correlationId: createCorrelationId(),
      });
    } catch {
      setSession({
        user: null,
        state: "error",
        errorMessage: "Failed to restore session",
        correlationId: createCorrelationId(),
      });
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setSession((prev) => ({
      ...prev,
      state: "authorizing",
      errorMessage: undefined,
    }));

    await new Promise((r) => setTimeout(r, 150));

    if (password !== "password") {
      setSession({
        user: null,
        state: "unauthenticated",
        errorMessage: "Invalid credentials",
        correlationId: createCorrelationId(),
      });
      throw new Error("Invalid credentials");
    }

    const base = DEMO_USERS[email.toLowerCase()];
    if (!base) {
      setSession({
        user: null,
        state: "unauthenticated",
        errorMessage: "User not found",
        correlationId: createCorrelationId(),
      });
      throw new Error("User not found");
    }

    const user = toAuthUser(base);
    if (user.status !== "active") {
      setSession({
        user,
        state: "forbidden",
        errorMessage: `Account ${user.status}`,
        correlationId: createCorrelationId(),
      });
      throw new Error(`Account ${user.status}`);
    }

    const stored: StoredSession = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      locale: user.locale,
      scope: user.scope,
      status: user.status,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    setSession({
      user,
      state: "authorized",
      correlationId: createCorrelationId(),
    });
  }, []);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession({
      user: null,
      state: "unauthenticated",
      correlationId: createCorrelationId(),
    });
  }, []);

  const setLocale = useCallback((locale: "ar" | "en") => {
    setSession((prev) => {
      if (!prev.user) return prev;
      const user = { ...prev.user, locale };
      const stored: StoredSession = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        locale: user.locale,
        scope: user.scope,
        status: user.status,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      return { ...prev, user };
    });
  }, []);

  const value = useMemo(
    () => ({ session, login, logout, setLocale }),
    [session, login, logout, setLocale],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthState(): AuthMachineState {
  return useAuth().session.state;
}
