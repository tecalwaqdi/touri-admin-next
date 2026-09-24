"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthSession, AuthUser } from "@/types/auth";
import { createCorrelationId } from "@/lib/ids";
import { isClientBearerAuthRequired } from "@/lib/clientAppEnv";
import {
  clearMockSession,
  mockBrowserLogin,
  persistLocale,
  persistMockSession,
  readStoredLocale,
  readStoredMockSession,
} from "@/auth/mockBrowserAuth";
import {
  getFirebaseAuth,
  isFirebaseClientConfigured,
} from "@/infrastructure/auth/firebaseClient";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

type AuthContextValue = {
  session: AuthSession;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  setLocale: (locale: "ar" | "en") => void;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

class SessionResolveError extends Error {
  readonly kind: "unauthenticated" | "forbidden";
  constructor(message: string, kind: "unauthenticated" | "forbidden") {
    super(message);
    this.name = "SessionResolveError";
    this.kind = kind;
  }
}

async function fetchVerifiedSessionUser(
  idToken: string,
  correlationId: string,
): Promise<AuthUser> {
  const res = await fetch("/api/auth/me", {
    headers: {
      Authorization: `Bearer ${idToken}`,
      "x-correlation-id": correlationId,
    },
  });
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson
    ? ((await res.json().catch(() => ({}))) as { error?: string; user?: AuthUser })
    : {};

  if (res.status === 401) {
    throw new SessionResolveError(
      body.error ?? "Session expired — sign in again",
      "unauthenticated",
    );
  }
  if (res.status === 403) {
    throw new SessionResolveError(
      body.error ?? "Account not authorized",
      "forbidden",
    );
  }
  if (!res.ok || !body.user) {
    // Non-JSON 5xx (e.g. instrumentation HTML) or incomplete payload —
    // clear client session and return to login instead of a fatal page.
    throw new SessionResolveError(
      body.error ??
        (isJson
          ? "Failed to resolve session"
          : "Session service unavailable — sign in again"),
      "unauthenticated",
    );
  }
  const locale = readStoredLocale();
  return locale ? { ...body.user, locale } : body.user;
}

function mapFirebaseAuthError(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
    return "Invalid credentials";
  }
  if (code === "auth/user-not-found") return "User not found";
  if (code === "auth/too-many-requests") return "Too many attempts — try again later";
  // Distinguishes blocked/unreachable Auth network from bad password (no secrets logged).
  if (code === "auth/network-request-failed") {
    return "Network request failed — Firebase Auth unreachable (connectivity or CSP connect-src)";
  }
  return err instanceof Error ? err.message : "Authentication failed";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const bearerAuth = isClientBearerAuthRequired();
  const [session, setSession] = useState<AuthSession>({
    user: null,
    state: "initializing",
    correlationId: createCorrelationId(),
  });
  const firebaseUserRef = useRef<User | null>(null);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!bearerAuth) return null;
    const user = firebaseUserRef.current;
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [bearerAuth]);

  useEffect(() => {
    if (!bearerAuth) {
      try {
        const user = readStoredMockSession();
        if (!user) {
          setSession({
            user: null,
            state: "unauthenticated",
            correlationId: createCorrelationId(),
          });
          return;
        }
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
      return;
    }

    if (!isFirebaseClientConfigured()) {
      setSession({
        user: null,
        state: "error",
        errorMessage:
          "Firebase client is not configured (NEXT_PUBLIC_FIREBASE_* missing)",
        correlationId: createCorrelationId(),
      });
      return;
    }

    const auth = getFirebaseAuth();
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const currentGeneration = ++generation;
      firebaseUserRef.current = firebaseUser;
      if (!firebaseUser) {
        setSession({
          user: null,
          state: "unauthenticated",
          correlationId: createCorrelationId(),
        });
        return;
      }

      const correlationId = createCorrelationId();
      setSession((prev) => ({
        ...prev,
        user: prev.user,
        state: "authorizing",
        errorMessage: undefined,
        correlationId,
      }));

      void (async () => {
        try {
          const idToken = await firebaseUser.getIdToken();
          const user = await fetchVerifiedSessionUser(idToken, correlationId);
          if (generation !== currentGeneration) return;
          if (user.status !== "active") {
            setSession({
              user,
              state: "forbidden",
              errorMessage: `Account ${user.status}`,
              correlationId,
            });
            return;
          }
          setSession({
            user,
            state: "authorized",
            correlationId,
          });
        } catch (err) {
          if (generation !== currentGeneration) return;
          const message = err instanceof Error ? err.message : "Session error";
          const resolveKind =
            err instanceof SessionResolveError ? err.kind : null;
          const forbidden =
            resolveKind === "forbidden" ||
            /not authorized|forbidden|disabled|unauthorized/i.test(message);
          // Drop invalid/stale Firebase session so AuthGuard can send user to login.
          try {
            await signOut(auth);
          } catch {
            /* ignore */
          }
          firebaseUserRef.current = null;
          setSession({
            user: null,
            state: forbidden ? "forbidden" : "unauthenticated",
            errorMessage: message,
            correlationId,
          });
        }
      })();
    });

    return () => { generation++; unsubscribe(); };
  }, [bearerAuth]);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      setSession((prev) => ({
        ...prev,
        state: "authorizing",
        errorMessage: undefined,
      }));

      if (!bearerAuth) {
        try {
          const user = await mockBrowserLogin(email, password);
          setSession({
            user,
            state: "authorized",
            correlationId: createCorrelationId(),
          });
          return user;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          const forbidden = /Account (disabled|expired|unauthorized)/i.test(message);
          setSession({
            user: null,
            state: forbidden ? "forbidden" : "unauthenticated",
            errorMessage: message,
            correlationId: createCorrelationId(),
          });
          throw err;
        }
      }

      if (!isFirebaseClientConfigured()) {
        const message =
          "Firebase client is not configured (NEXT_PUBLIC_FIREBASE_* missing)";
        setSession({
          user: null,
          state: "error",
          errorMessage: message,
          correlationId: createCorrelationId(),
        });
        throw new Error(message);
      }

      try {
        const auth = getFirebaseAuth();
        const correlationId = createCorrelationId();
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        const idToken = await cred.user.getIdToken();
        const user = await fetchVerifiedSessionUser(idToken, correlationId);
        if (user.status !== "active") {
          setSession({
            user,
            state: "forbidden",
            errorMessage: `Account ${user.status}`,
            correlationId,
          });
          throw new SessionResolveError(`Account ${user.status}`, "forbidden");
        }
        firebaseUserRef.current = cred.user;
        setSession({
          user,
          state: "authorized",
          correlationId,
        });
        return user;
      } catch (err) {
        if (err instanceof SessionResolveError) throw err;
        const message = mapFirebaseAuthError(err);
        setSession({
          user: null,
          state: "unauthenticated",
          errorMessage: message,
          correlationId: createCorrelationId(),
        });
        throw new Error(message);
      }
    },
    [bearerAuth],
  );

  const logout = useCallback(async () => {
    if (!bearerAuth) {
      clearMockSession();
      setSession({
        user: null,
        state: "unauthenticated",
        correlationId: createCorrelationId(),
      });
      return;
    }
    try {
      await signOut(getFirebaseAuth());
    } finally {
      firebaseUserRef.current = null;
      setSession({
        user: null,
        state: "unauthenticated",
        correlationId: createCorrelationId(),
      });
    }
  }, [bearerAuth]);

  const setLocale = useCallback(
    (locale: "ar" | "en") => {
      persistLocale(locale);
      setSession((prev) => {
        if (!prev.user) return prev;
        const user = { ...prev.user, locale };
        if (!bearerAuth) {
          persistMockSession(user);
        }
        return { ...prev, user };
      });
    },
    [bearerAuth],
  );

  const value = useMemo(
    () => ({ session, login, logout, setLocale, getIdToken }),
    [session, login, logout, setLocale, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useAuthState() {
  return useAuth().session.state;
}
