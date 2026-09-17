/**
 * Driver pilot auth precedence + token validation regressions.
 * Never asserts on raw password/token values; uses fakes only.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  AUTH_METHODS,
  inspectIdTokenClaims,
  isAuthPreflightOnly,
  resolveOperatorAuth,
  sanitizeAuthMessage,
  validateIdTokenUsable,
} from "../../../scripts/lib/driver-pilot-auth.mjs";

const PROJECT = "tutorial-multi-language-70gx4j";

type EnvMap = Record<string, string | undefined>;

function b64url(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fakeJwt(claims: Record<string, unknown>): string {
  return `eyJhbGciOiJub25lIn0.${b64url(claims)}.sig`;
}

function firebaseConfig() {
  return { apiKey: "fake-api-key", projectId: PROJECT, present: true };
}

describe("driver-pilot-auth — claim inspection", () => {
  it("rejects expired tokens (cannot produce auth ok)", () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({
      aud: PROJECT,
      exp: nowSec - 60,
      sub: "u1",
    });
    const r = inspectIdTokenClaims(token, { expectedAudience: PROJECT, nowSec });
    expect(r.ok).toBe(false);
    expect(r.expired).toBe(true);
    expect(r.reason).toBe("TOKEN_EXPIRED");
  });

  it("rejects audience mismatch", () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({
      aud: "other-project",
      exp: nowSec + 3600,
      sub: "u1",
    });
    const r = inspectIdTokenClaims(token, { expectedAudience: PROJECT, nowSec });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("TOKEN_AUD_MISMATCH");
  });

  it("accepts non-expired matching audience claims", () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({
      aud: PROJECT,
      exp: nowSec + 3600,
      sub: "u1",
    });
    const r = inspectIdTokenClaims(token, { expectedAudience: PROJECT, nowSec });
    expect(r.ok).toBe(true);
  });
});

describe("driver-pilot-auth — validateIdTokenUsable", () => {
  it("expired token fails before /api/auth/me and is not ok", async () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({ aud: PROJECT, exp: nowSec - 10, sub: "u1" });
    const requestAuthMe = vi.fn(async () => ({ httpStatus: 200 }));
    const r = await validateIdTokenUsable(token, {
      expectedAudience: PROJECT,
      requestAuthMe,
      nowSec,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("TOKEN_EXPIRED");
    expect(requestAuthMe).not.toHaveBeenCalled();
  });

  it("valid claims + /api/auth/me 200 → ok", async () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({ aud: PROJECT, exp: nowSec + 3600, sub: "u1" });
    const r = await validateIdTokenUsable(token, {
      expectedAudience: PROJECT,
      requestAuthMe: async () => ({ httpStatus: 200 }),
      nowSec,
    });
    expect(r.ok).toBe(true);
    expect(r.httpStatus).toBe(200);
  });

  it("valid claims + /api/auth/me 401 → not ok", async () => {
    const nowSec = 1_700_000_000;
    const token = fakeJwt({ aud: PROJECT, exp: nowSec + 3600, sub: "u1" });
    const r = await validateIdTokenUsable(token, {
      expectedAudience: PROJECT,
      requestAuthMe: async () => ({ httpStatus: 401 }),
      nowSec,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("AUTH_ME_HTTP_401");
  });
});

describe("driver-pilot-auth — precedence", () => {
  const nowSec = 1_700_000_000;
  const freshLocal = fakeJwt({
    aud: PROJECT,
    exp: nowSec + 3600,
    sub: "local-user",
  });
  const staleLocal = fakeJwt({
    aud: PROJECT,
    exp: nowSec - 120,
    sub: "stale-user",
  });
  const explicitValid = fakeJwt({
    aud: PROJECT,
    exp: nowSec + 3600,
    sub: "explicit-user",
  });

  it("1: email/password overrides local token file", async () => {
    const signIn = vi.fn(async () =>
      fakeJwt({ aud: PROJECT, exp: nowSec + 3600, sub: "fresh-user" }),
    );
    const auth = await resolveOperatorAuth({
      env: {
        FINAL_LIVE_EMAIL: "ops@example.com",
        FINAL_LIVE_PASSWORD: "not-a-real-password",
      },
      firebaseConfig: firebaseConfig(),
      localAuthPath: "/tmp/fake-final-live.json",
      loadLocalAuth: () => ({
        FINAL_LIVE_ID_TOKEN: freshLocal,
        FINAL_LIVE_EMAIL: "other@example.com",
      }),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      signIn,
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.EMAIL_PASSWORD);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(auth.token).toContain(".");
    expect(auth.authMeHttpStatus).toBe(200);
  });

  it("2: stale local token is rejected", async () => {
    const auth = await resolveOperatorAuth({
      env: {},
      firebaseConfig: firebaseConfig(),
      localAuthPath: "/tmp/fake-final-live.json",
      loadLocalAuth: () => ({ FINAL_LIVE_ID_TOKEN: staleLocal }),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      nowSec,
      isTTY: false,
    });
    expect(auth.token).toBe("");
    expect(auth.authMethod).toBe(AUTH_METHODS.NONE);
    expect(auth.notes?.some((n) => n.includes("local_token_rejected:TOKEN_EXPIRED"))).toBe(
      true,
    );
  });

  it("3: expired token cannot produce auth ok / explicit_id_token", async () => {
    const auth = await resolveOperatorAuth({
      env: { FINAL_LIVE_ID_TOKEN: staleLocal },
      firebaseConfig: firebaseConfig(),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).not.toBe(AUTH_METHODS.EXPLICIT_ID_TOKEN);
    expect(auth.token).toBe("");
    expect(auth.notes?.some((n) => n.includes("explicit_id_token_rejected"))).toBe(
      true,
    );
  });

  it("4: explicit valid token works when intentionally supplied", async () => {
    const signIn = vi.fn();
    const auth = await resolveOperatorAuth({
      env: { FINAL_LIVE_ID_TOKEN: explicitValid },
      firebaseConfig: firebaseConfig(),
      localAuthPath: "/tmp/fake-final-live.json",
      loadLocalAuth: () => ({ FINAL_LIVE_ID_TOKEN: freshLocal }),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      signIn,
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.EXPLICIT_ID_TOKEN);
    expect(auth.token).toBe(explicitValid);
    expect(signIn).not.toHaveBeenCalled();
    expect(auth.authMeHttpStatus).toBe(200);
  });

  it("5: missing credentials + invalid local token fails safely", async () => {
    const auth = await resolveOperatorAuth({
      env: {},
      firebaseConfig: firebaseConfig(),
      localAuthPath: "/tmp/fake-final-live.json",
      loadLocalAuth: () => ({ FINAL_LIVE_ID_TOKEN: staleLocal }),
      requestAuthMe: async () => ({ httpStatus: 401 }),
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.NONE);
    expect(auth.token).toBe("");
    expect(auth.blocker).toMatch(/NON_TTY_NO_FINAL_LIVE_ENV|Email\/password/);
  });

  it("email/password still wins even when explicit token is also present but invalid", async () => {
    const signIn = vi.fn(async () =>
      fakeJwt({ aud: PROJECT, exp: nowSec + 3600, sub: "fresh-user" }),
    );
    const auth = await resolveOperatorAuth({
      env: {
        FINAL_LIVE_ID_TOKEN: staleLocal,
        FINAL_LIVE_EMAIL: "ops@example.com",
        FINAL_LIVE_PASSWORD: "not-a-real-password",
      },
      firebaseConfig: firebaseConfig(),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      signIn,
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.EMAIL_PASSWORD);
    expect(signIn).toHaveBeenCalled();
  });

  it("validated local token used only as fallback C", async () => {
    const auth = await resolveOperatorAuth({
      env: {},
      firebaseConfig: firebaseConfig(),
      localAuthPath: "/tmp/fake-final-live.json",
      loadLocalAuth: () => ({ FINAL_LIVE_ID_TOKEN: freshLocal }),
      requestAuthMe: async () => ({ httpStatus: 200 }),
      nowSec,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.VALIDATED_LOCAL_TOKEN);
    expect(auth.authMeHttpStatus).toBe(200);
  });
});

describe("driver-pilot-auth — gate arming safety + sanitization", () => {
  it("6: AUTH_PREFLIGHT_ONLY helper detects flag", () => {
    expect(isAuthPreflightOnly({ AUTH_PREFLIGHT_ONLY: "1" })).toBe(true);
    expect(isAuthPreflightOnly({ AUTH_PREFLIGHT_ONLY: "true" })).toBe(true);
    expect(isAuthPreflightOnly({})).toBe(false);
  });

  it("6b: runner stops before arming when AUTH_PREFLIGHT_ONLY / auth fails", () => {
    const src = readFileSync(
      join(process.cwd(), "scripts/run-driver-production-pilot.mjs"),
      "utf8",
    );
    expect(src).toMatch(/AUTH_PREFLIGHT_ONLY/);
    expect(src).toMatch(/stopped before gate arming/);
    // Auth failure throws before arming CONFIG
    const authFailIdx = src.indexOf("AUTH_ME_FAILED");
    const armIdx = src.indexOf("arming CONFIG GLOBAL+PRODUCTION+DRIVER");
    expect(authFailIdx).toBeGreaterThan(0);
    expect(armIdx).toBeGreaterThan(authFailIdx);
    // Preflight failure also precedes arming
    const preFailIdx = src.indexOf("PREFLIGHT_AUTH_VALIDATION_FAILED");
    expect(preFailIdx).toBeGreaterThan(0);
    expect(armIdx).toBeGreaterThan(preFailIdx);
  });

  it("7: sanitizeAuthMessage redacts jwt / bearer / password; no secrets in artifact writers", () => {
    const jwt = fakeJwt({ aud: PROJECT, exp: 9999999999, sub: "u" });
    const dirty = `Bearer ${jwt} password=\"super-secret\" idToken=\"${jwt}\"`;
    const clean = sanitizeAuthMessage(dirty) || "";
    expect(clean).not.toContain("super-secret");
    expect(clean).not.toContain(jwt);
    expect(clean).toMatch(/\[redacted/);

    const runner = readFileSync(
      join(process.cwd(), "scripts/run-driver-production-pilot.mjs"),
      "utf8",
    );
    // Must not persist fresh password/token to local auth cache
    expect(runner).not.toMatch(/writeFileSync\(\s*localAuthPath/);
    expect(runner).not.toMatch(/\.final-live\.json[\s\S]{0,200}writeFileSync/);
    expect(runner).not.toMatch(/writeFileSync[\s\S]{0,200}FINAL_LIVE_ID_TOKEN/);
    // Artifact path still redacts JWTs
    expect(runner).toMatch(/\[redacted-jwt\]/);

    const helper = readFileSync(
      join(process.cwd(), "scripts/lib/driver-pilot-auth.mjs"),
      "utf8",
    );
    expect(helper).not.toMatch(/writeFileSync/);
    expect(helper).toMatch(/local token file must NEVER override/);
  });

  it("local auth cache file is not required for email/password path", async () => {
    expect(existsSync(join(process.cwd(), "scripts/lib/driver-pilot-auth.mjs"))).toBe(
      true,
    );
    const signIn = vi.fn(async () =>
      fakeJwt({
        aud: PROJECT,
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: "u",
      }),
    );
    const auth = await resolveOperatorAuth({
      env: {
        FINAL_LIVE_EMAIL: "ops@example.com",
        FINAL_LIVE_PASSWORD: "x".repeat(12),
      },
      firebaseConfig: firebaseConfig(),
      localAuthPath: "",
      requestAuthMe: async () => ({ httpStatus: 200 }),
      signIn,
      isTTY: false,
    });
    expect(auth.authMethod).toBe(AUTH_METHODS.EMAIL_PASSWORD);
  });
});
