/**
 * Shared Admin Next production pilot — operator auth resolution.
 *
 * Precedence (required):
 *   1. FINAL_LIVE_ID_TOKEN → validate usable → auth_source=explicit_id_token
 *   2. FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD → fresh email/password sign-in
 *      → auth_source=email_password
 *   3. macOS Keychain service `touri-admin-next-demo` account `info@admin.com`
 *      → fresh sign-in → auth_source=macos_keychain
 *   4. muted TTY prompt (default email info@admin.com)
 *      → fresh sign-in → auth_source=email_password
 *
 * Never prints or persists password / fresh ID token / Authorization header.
 * Log only auth_source=macos_keychain|email_password|explicit_id_token.
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const AUTH_METHODS = Object.freeze({
  EMAIL_PASSWORD: "email_password",
  EXPLICIT_ID_TOKEN: "explicit_id_token",
  MACOS_KEYCHAIN: "macos_keychain",
  VALIDATED_LOCAL_TOKEN: "validated_local_token",
  NONE: "none",
});

/** Operator-facing auth_source labels (never print secrets). */
export const AUTH_SOURCES = Object.freeze({
  EXPLICIT_ID_TOKEN: "explicit_id_token",
  EMAIL_PASSWORD: "email_password",
  MACOS_KEYCHAIN: "macos_keychain",
});

export const DEFAULT_OPERATOR_EMAIL = "info@admin.com";
export const KEYCHAIN_SERVICE = "touri-admin-next-demo";
export const KEYCHAIN_ACCOUNT = "info@admin.com";

export function sanitizeAuthMessage(value) {
  if (value == null) return null;
  let s = String(value);
  s = s.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    "[redacted-jwt]",
  );
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  s = s.replace(/idToken["']?\s*[:=]\s*["'][^"']+/gi, "idToken=[redacted]");
  s = s.replace(/password["']?\s*[:=]\s*["'][^"']+/gi, "password=[redacted]");
  if (s.length > 400) s = `${s.slice(0, 400)}…`;
  return s;
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const json = Buffer.from(payloadB64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Structural + claim checks before network validation.
 * Does not print token contents.
 */
export function inspectIdTokenClaims(
  token,
  { expectedAudience = "", nowSec = Math.floor(Date.now() / 1000) } = {},
) {
  if (!token || typeof token !== "string" || token.trim().length < 20) {
    return { ok: false, reason: "TOKEN_MISSING_OR_SHORT", expired: true, audOk: false };
  }
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { ok: false, reason: "TOKEN_PAYLOAD_INVALID", expired: true, audOk: false };
  }
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  if (exp == null) {
    return { ok: false, reason: "TOKEN_EXP_MISSING", expired: true, audOk: false, exp: null };
  }
  const expired = nowSec >= exp;
  if (expired) {
    return {
      ok: false,
      reason: "TOKEN_EXPIRED",
      expired: true,
      audOk: false,
      exp,
      nowSec,
    };
  }
  const aud = payload.aud;
  const audOk =
    !expectedAudience ||
    aud === expectedAudience ||
    (Array.isArray(aud) && aud.includes(expectedAudience));
  if (!audOk) {
    return {
      ok: false,
      reason: "TOKEN_AUD_MISMATCH",
      expired: false,
      audOk: false,
      exp,
      nowSec,
    };
  }
  return {
    ok: true,
    reason: "CLAIMS_OK",
    expired: false,
    audOk: true,
    exp,
    nowSec,
  };
}

export async function signInWithEmailPassword(apiKey, email, password, fetchImpl = fetch) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code =
      body && typeof body === "object" && body.error && body.error.message
        ? String(body.error.message)
        : `HTTP_${res.status}`;
    throw new Error(`FIREBASE_AUTH_FAILED:${sanitizeAuthMessage(code)}`);
  }
  const idToken =
    body && typeof body === "object" && typeof body.idToken === "string"
      ? body.idToken
      : "";
  if (!idToken) throw new Error("FIREBASE_AUTH_FAILED:missing_id_token");
  return idToken;
}

/**
 * Read password from macOS Keychain (memory-only). Never logs the secret.
 * @returns {{ ok: true, password: string } | { ok: false, reason: string }}
 */
export function readMacosKeychainPassword({
  service = KEYCHAIN_SERVICE,
  account = KEYCHAIN_ACCOUNT,
  spawn = spawnSync,
} = {}) {
  try {
    const res = spawn(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8" },
    );
    if (res.status !== 0) {
      return {
        ok: false,
        reason: `KEYCHAIN_MISS_OR_DENIED:exit_${res.status ?? "unknown"}`,
      };
    }
    const password = String(res.stdout || "").replace(/\r?\n$/, "");
    if (!password) {
      return { ok: false, reason: "KEYCHAIN_EMPTY" };
    }
    return { ok: true, password };
  } catch (err) {
    return {
      ok: false,
      reason: `KEYCHAIN_ERROR:${sanitizeAuthMessage(err?.message || err)}`,
    };
  }
}

/**
 * Validate token is not expired, matches audience, and is usable on /api/auth/me.
 */
export async function validateIdTokenUsable(
  token,
  {
    expectedAudience = "",
    requestAuthMe,
    nowSec = Math.floor(Date.now() / 1000),
  } = {},
) {
  const claims = inspectIdTokenClaims(token, { expectedAudience, nowSec });
  if (!claims.ok) {
    return {
      ok: false,
      reason: claims.reason,
      httpStatus: null,
      claims,
    };
  }
  if (typeof requestAuthMe !== "function") {
    return {
      ok: false,
      reason: "AUTH_ME_PROBE_MISSING",
      httpStatus: null,
      claims,
    };
  }
  let probe;
  try {
    probe = await requestAuthMe(token);
  } catch (err) {
    return {
      ok: false,
      reason: `AUTH_ME_PROBE_ERROR:${sanitizeAuthMessage(err?.message || err)}`,
      httpStatus: null,
      claims,
    };
  }
  const httpStatus =
    probe && typeof probe.httpStatus === "number" ? probe.httpStatus : null;
  if (httpStatus !== 200) {
    return {
      ok: false,
      reason: `AUTH_ME_HTTP_${httpStatus ?? "UNKNOWN"}`,
      httpStatus,
      claims,
    };
  }
  return { ok: true, reason: "AUTH_ME_OK", httpStatus: 200, claims };
}

function readLocalAuthFile(localAuthPath) {
  if (!localAuthPath || !existsSync(localAuthPath)) return null;
  try {
    const local = JSON.parse(readFileSync(localAuthPath, "utf8"));
    return local && typeof local === "object" ? local : null;
  } catch {
    return null;
  }
}

async function signInAndValidate({
  email,
  password,
  firebaseConfig,
  signIn,
  validate,
  notes,
  authMethod,
  authSource,
}) {
  if (!firebaseConfig?.present || !firebaseConfig?.apiKey) {
    return {
      token: "",
      authMethod: AUTH_METHODS.NONE,
      authSource: null,
      blocker:
        "NEXT_PUBLIC_FIREBASE_API_KEY (and project) missing from env / .env.production.local / .env.local.",
      notes,
    };
  }
  try {
    const token = await signIn(firebaseConfig.apiKey, email, password);
    const v = await validate(token);
    if (!v.ok) {
      return {
        token: "",
        authMethod: AUTH_METHODS.NONE,
        authSource: null,
        blocker: `EMAIL_PASSWORD_TOKEN_UNUSABLE:${v.reason}`,
        authMeHttpStatus: v.httpStatus,
        notes,
      };
    }
    return {
      token,
      authMethod,
      authSource,
      authMeHttpStatus: v.httpStatus,
      notes,
    };
  } catch (err) {
    return {
      token: "",
      authMethod: AUTH_METHODS.NONE,
      authSource: null,
      blocker: sanitizeAuthMessage(err?.message || err) || "FIREBASE_AUTH_FAILED",
      notes,
    };
  }
}

/**
 * Resolve operator auth with required precedence.
 *
 * @returns {{
 *   token: string,
 *   authMethod: string,
 *   authSource: string|null,
 *   blocker?: string,
 *   notes?: string[],
 *   authMeHttpStatus?: number|null,
 * }}
 */
export async function resolveOperatorAuth({
  env = process.env,
  firebaseConfig,
  localAuthPath = "",
  requestAuthMe,
  signIn = signInWithEmailPassword,
  nowSec = Math.floor(Date.now() / 1000),
  isTTY = false,
  promptEmail,
  promptPassword,
  loadLocalAuth = readLocalAuthFile,
  readKeychain = readMacosKeychainPassword,
  keychainService = KEYCHAIN_SERVICE,
  keychainAccount = KEYCHAIN_ACCOUNT,
  defaultEmail = DEFAULT_OPERATOR_EMAIL,
} = {}) {
  const notes = [];
  const expectedAudience =
    (firebaseConfig && firebaseConfig.projectId) ||
    String(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim() ||
    "";

  const validate = (token) =>
    validateIdTokenUsable(token, {
      expectedAudience,
      requestAuthMe,
      nowSec,
    });

  // ---- 1. Explicit FINAL_LIVE_ID_TOKEN ----
  const envToken = String(env.FINAL_LIVE_ID_TOKEN || "").trim();
  if (envToken) {
    const v = await validate(envToken);
    if (v.ok) {
      return {
        token: envToken,
        authMethod: AUTH_METHODS.EXPLICIT_ID_TOKEN,
        authSource: AUTH_SOURCES.EXPLICIT_ID_TOKEN,
        authMeHttpStatus: v.httpStatus,
        notes,
      };
    }
    notes.push(`explicit_id_token_rejected:${v.reason}`);
  }

  // Load local file early for optional email fill-in only (never password persistence).
  const local = localAuthPath ? loadLocalAuth(localAuthPath) : null;
  let email = String(env.FINAL_LIVE_EMAIL || "").trim();
  let password = env.FINAL_LIVE_PASSWORD != null ? String(env.FINAL_LIVE_PASSWORD) : "";

  if (
    !email &&
    local &&
    typeof local.FINAL_LIVE_EMAIL === "string" &&
    local.FINAL_LIVE_EMAIL.trim()
  ) {
    email = local.FINAL_LIVE_EMAIL.trim();
    notes.push("email_filled_from_local_file");
  }
  if (!email) {
    email = defaultEmail;
    notes.push("email_defaulted_info_admin");
  }

  // ---- 2. FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD env → ALWAYS fresh sign-in ----
  if (email && password) {
    const result = await signInAndValidate({
      email,
      password,
      firebaseConfig,
      signIn,
      validate,
      notes,
      authMethod: AUTH_METHODS.EMAIL_PASSWORD,
      authSource: AUTH_SOURCES.EMAIL_PASSWORD,
    });
    password = "";
    email = "";
    return result;
  }

  // ---- 3. macOS Keychain (service touri-admin-next-demo / account info@admin.com) ----
  const kc = readKeychain({ service: keychainService, account: keychainAccount });
  if (kc.ok) {
    notes.push("keychain_password_loaded");
    const result = await signInAndValidate({
      email: email || keychainAccount || defaultEmail,
      password: kc.password,
      firebaseConfig,
      signIn,
      validate,
      notes,
      authMethod: AUTH_METHODS.MACOS_KEYCHAIN,
      authSource: AUTH_SOURCES.MACOS_KEYCHAIN,
    });
    // Best-effort clear
    if (kc.password) {
      try {
        kc.password = "";
      } catch {
        /* ignore */
      }
    }
    return result;
  }
  notes.push(`keychain_unavailable:${kc.reason}`);

  // ---- 4. Interactive muted TTY ----
  if (isTTY) {
    let ttyEmail = email || defaultEmail;
    let ttyPassword = "";
    if (typeof promptEmail === "function" && !String(env.FINAL_LIVE_EMAIL || "").trim()) {
      const prompted = String((await promptEmail()) || "").trim();
      if (prompted) ttyEmail = prompted;
    }
    if (typeof promptPassword === "function") {
      ttyPassword = String((await promptPassword()) || "");
    }
    if (ttyEmail && ttyPassword) {
      const result = await signInAndValidate({
        email: ttyEmail,
        password: ttyPassword,
        firebaseConfig,
        signIn,
        validate,
        notes,
        authMethod: AUTH_METHODS.EMAIL_PASSWORD,
        authSource: AUTH_SOURCES.EMAIL_PASSWORD,
      });
      ttyPassword = "";
      return result;
    }
  }

  // Legacy fallback: validated local token only when no password path available.
  const localToken =
    local && typeof local.FINAL_LIVE_ID_TOKEN === "string"
      ? local.FINAL_LIVE_ID_TOKEN.trim()
      : "";
  if (localToken) {
    const v = await validate(localToken);
    if (v.ok) {
      notes.push("legacy_local_token_fallback");
      return {
        token: localToken,
        authMethod: AUTH_METHODS.VALIDATED_LOCAL_TOKEN,
        authSource: AUTH_SOURCES.EXPLICIT_ID_TOKEN,
        authMeHttpStatus: v.httpStatus,
        notes,
      };
    }
    notes.push(`local_token_rejected:${v.reason}`);
  }

  if (!isTTY) {
    return {
      token: "",
      authMethod: AUTH_METHODS.NONE,
      authSource: null,
      blocker:
        "NON_TTY_NO_FINAL_LIVE_ENV: export FINAL_LIVE_EMAIL+FINAL_LIVE_PASSWORD, or FINAL_LIVE_ID_TOKEN, or store Keychain service touri-admin-next-demo / account info@admin.com, or run interactively (muted password).",
      notes,
    };
  }

  return {
    token: "",
    authMethod: AUTH_METHODS.NONE,
    authSource: null,
    blocker: "Email/password empty after prompt/env/keychain.",
    notes,
  };
}

/**
 * True when env indicates auth/preflight-only mode (no gate arming, no mutation).
 * @param {Record<string, string | undefined>} [env]
 */
export function isAuthPreflightOnly(env = process.env) {
  const v = String(env.AUTH_PREFLIGHT_ONLY || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Safe one-line log label — never includes secrets.
 */
export function formatAuthSourceLog(auth) {
  const source =
    (auth && auth.authSource) ||
    (auth && auth.authMethod === AUTH_METHODS.MACOS_KEYCHAIN
      ? AUTH_SOURCES.MACOS_KEYCHAIN
      : auth && auth.authMethod === AUTH_METHODS.EXPLICIT_ID_TOKEN
        ? AUTH_SOURCES.EXPLICIT_ID_TOKEN
        : auth && auth.authMethod === AUTH_METHODS.EMAIL_PASSWORD
          ? AUTH_SOURCES.EMAIL_PASSWORD
          : auth && auth.authMethod === AUTH_METHODS.VALIDATED_LOCAL_TOKEN
            ? AUTH_SOURCES.EXPLICIT_ID_TOKEN
            : "none");
  return `auth_source=${source}`;
}
