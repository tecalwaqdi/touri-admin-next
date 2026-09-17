/**
 * Driver production pilot — operator auth resolution.
 *
 * Precedence (required):
 *   A. FINAL_LIVE_ID_TOKEN → use only after validating usable → explicit_id_token
 *   B. FINAL_LIVE_EMAIL + FINAL_LIVE_PASSWORD → ALWAYS fresh email/password sign-in
 *      (local token file must NEVER override explicit email/password)
 *   C. local token file fallback → validate → validated_local_token
 *
 * Never prints or persists password / fresh ID token / Authorization header.
 */

import { existsSync, readFileSync } from "node:fs";

export const AUTH_METHODS = Object.freeze({
  EMAIL_PASSWORD: "email_password",
  EXPLICIT_ID_TOKEN: "explicit_id_token",
  VALIDATED_LOCAL_TOKEN: "validated_local_token",
  NONE: "none",
});

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
 * Validate token is not expired, matches audience, and is usable on /api/auth/me.
 */
/**
 * @param {string} token
 * @param {object} [opts]
 * @param {string} [opts.expectedAudience]
 * @param {(token: string) => Promise<{ httpStatus: number }>} [opts.requestAuthMe]
 * @param {number} [opts.nowSec]
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

/**
 * Resolve operator auth with required precedence.
 *
 * @returns {{
 *   token: string,
 *   authMethod: string,
 *   blocker?: string,
 *   notes?: string[],
 *   authMeHttpStatus?: number|null,
 * }}
 */
/**
 * @param {object} [opts]
 * @param {Record<string, string | undefined>} [opts.env]
 * @param {{ apiKey?: string, projectId?: string, present?: boolean }} [opts.firebaseConfig]
 * @param {string} [opts.localAuthPath]
 * @param {(token: string) => Promise<{ httpStatus: number }>} [opts.requestAuthMe]
 * @param {(apiKey: string, email: string, password: string) => Promise<string>} [opts.signIn]
 * @param {number} [opts.nowSec]
 * @param {boolean} [opts.isTTY]
 * @param {() => Promise<string>|string} [opts.promptEmail]
 * @param {() => Promise<string>|string} [opts.promptPassword]
 * @param {(path: string) => object|null} [opts.loadLocalAuth]
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

  // ---- A. Explicit FINAL_LIVE_ID_TOKEN ----
  const envToken = String(env.FINAL_LIVE_ID_TOKEN || "").trim();
  if (envToken) {
    const v = await validate(envToken);
    if (v.ok) {
      return {
        token: envToken,
        authMethod: AUTH_METHODS.EXPLICIT_ID_TOKEN,
        authMeHttpStatus: v.httpStatus,
        notes,
      };
    }
    notes.push(`explicit_id_token_rejected:${v.reason}`);
    // Fall through — do not call auth "ok" merely because a string exists.
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

  // ---- B. Email + password → ALWAYS fresh sign-in (overrides local token file) ----
  if (email && password) {
    if (!firebaseConfig?.present || !firebaseConfig?.apiKey) {
      return {
        token: "",
        authMethod: AUTH_METHODS.NONE,
        blocker:
          "NEXT_PUBLIC_FIREBASE_API_KEY (and project) missing from env / .env.production.local / .env.local.",
        notes,
      };
    }
    try {
      const token = await signIn(firebaseConfig.apiKey, email, password);
      // Drop local refs ASAP (best-effort; JS string immutability).
      password = "";
      email = "";
      const v = await validate(token);
      if (!v.ok) {
        return {
          token: "",
          authMethod: AUTH_METHODS.NONE,
          blocker: `EMAIL_PASSWORD_TOKEN_UNUSABLE:${v.reason}`,
          authMeHttpStatus: v.httpStatus,
          notes,
        };
      }
      return {
        token,
        authMethod: AUTH_METHODS.EMAIL_PASSWORD,
        authMeHttpStatus: v.httpStatus,
        notes,
      };
    } catch (err) {
      password = "";
      email = "";
      return {
        token: "",
        authMethod: AUTH_METHODS.NONE,
        blocker: sanitizeAuthMessage(err?.message || err) || "FIREBASE_AUTH_FAILED",
        notes,
      };
    }
  }

  // Interactive prompts only when email/password incomplete and TTY available.
  if ((!email || !password) && isTTY) {
    if (!email && typeof promptEmail === "function") {
      email = String((await promptEmail()) || "").trim();
    }
    if (!password && typeof promptPassword === "function") {
      password = String((await promptPassword()) || "");
    }
    if (email && password) {
      if (!firebaseConfig?.present || !firebaseConfig?.apiKey) {
        return {
          token: "",
          authMethod: AUTH_METHODS.NONE,
          blocker:
            "NEXT_PUBLIC_FIREBASE_API_KEY (and project) missing from env / .env.production.local / .env.local.",
          notes,
        };
      }
      try {
        const token = await signIn(firebaseConfig.apiKey, email, password);
        password = "";
        email = "";
        const v = await validate(token);
        if (!v.ok) {
          return {
            token: "",
            authMethod: AUTH_METHODS.NONE,
            blocker: `EMAIL_PASSWORD_TOKEN_UNUSABLE:${v.reason}`,
            authMeHttpStatus: v.httpStatus,
            notes,
          };
        }
        return {
          token,
          authMethod: AUTH_METHODS.EMAIL_PASSWORD,
          authMeHttpStatus: v.httpStatus,
          notes,
        };
      } catch (err) {
        password = "";
        email = "";
        return {
          token: "",
          authMethod: AUTH_METHODS.NONE,
          blocker: sanitizeAuthMessage(err?.message || err) || "FIREBASE_AUTH_FAILED",
          notes,
        };
      }
    }
  }

  // ---- C. Local token file fallback (only if neither explicit token nor email/password) ----
  const localToken =
    local && typeof local.FINAL_LIVE_ID_TOKEN === "string"
      ? local.FINAL_LIVE_ID_TOKEN.trim()
      : "";
  if (localToken) {
    const v = await validate(localToken);
    if (v.ok) {
      return {
        token: localToken,
        authMethod: AUTH_METHODS.VALIDATED_LOCAL_TOKEN,
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
      blocker:
        "NON_TTY_NO_FINAL_LIVE_ENV: export FINAL_LIVE_EMAIL+FINAL_LIVE_PASSWORD in a local TTY, or FINAL_LIVE_ID_TOKEN, or run interactively (muted password). Never use GUI password dialogs.",
      notes,
    };
  }

  return {
    token: "",
    authMethod: AUTH_METHODS.NONE,
    blocker: "Email/password empty after prompt/env.",
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
