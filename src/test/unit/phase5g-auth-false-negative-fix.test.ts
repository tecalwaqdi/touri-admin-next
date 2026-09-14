/**
 * Phase 5G — Auth diagnostic regressions (mocks / offline).
 * Valid verified-token actor → Phase 5G auth succeeds.
 * Missing / invalid / wrong audience / expired → denied with distinct codes.
 * Never prints raw token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyIdentityVerificationFailure,
  formatProductionAuthBlocker,
} from "@/infrastructure/auth/productionAuthFailureClassification";
import {
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
  setProductionIdentityVerifierForTests,
} from "@/infrastructure/auth/productionVerifiedAuth";
import {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";
import {
  FirebaseAdminProductionIdentityVerifier,
} from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import { loadEnv, resetEnvCache } from "@/config/env";
import type { AppEnvConfig } from "@/config/env";

const PROJECT_ID = "tutorial-multi-language-70gx4j";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

function verifiedTokenEnv(): AppEnvConfig {
  process.env.APP_ENV = "production";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.AUTH_MODE = "verified_token";
  process.env.EXPECTED_PROJECT_ID = PROJECT_ID;
  process.env.EXPECTED_ENVIRONMENT = "production";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  resetEnvCache();
  return loadEnv();
}

describe("Phase 5G — Auth failure classification", () => {
  it("maps verifier reasons to distinct operator codes (no collapse)", () => {
    expect(classifyIdentityVerificationFailure("missing_token")).toBe(
      "TOKEN_MISSING",
    );
    expect(classifyIdentityVerificationFailure("expired_token")).toBe(
      "TOKEN_EXPIRED",
    );
    expect(classifyIdentityVerificationFailure("wrong_audience")).toBe(
      "TOKEN_PROJECT_MISMATCH",
    );
    expect(classifyIdentityVerificationFailure("wrong_issuer")).toBe(
      "TOKEN_PROJECT_MISMATCH",
    );
    expect(
      classifyIdentityVerificationFailure("token_verification_failed"),
    ).toBe("TOKEN_VERIFICATION_FAILED");
    expect(classifyIdentityVerificationFailure("user_lookup_failed")).toBe(
      "TOKEN_VERIFICATION_FAILED",
    );
    expect(classifyIdentityVerificationFailure("invalid_token")).toBe(
      "TOKEN_VERIFICATION_FAILED",
    );
    expect(
      classifyIdentityVerificationFailure("unknown_claim_role:no recognized"),
    ).toBe("ACTOR_RESOLUTION_FAILED");
    expect(formatProductionAuthBlocker("TOKEN_MISSING")).toBe(
      "Auth failed: TOKEN_MISSING",
    );
    expect(formatProductionAuthBlocker("TOKEN_VERIFICATION_FAILED")).not.toMatch(
      /eyJ|Bearer|token=/i,
    );
  });
});

describe("Phase 5G — resolveProductionVerifiedActor regressions", () => {
  beforeEach(() => {
    resetProductionAuthSingletonsForTests();
    setProductionIdentityVerifierForTests(null);
    verifiedTokenEnv();
  });

  afterEach(() => {
    setProductionIdentityVerifierForTests(null);
    resetProductionAuthSingletonsForTests();
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("valid verified-token super_admin actor → auth succeeds", async () => {
    const env = verifiedTokenEnv();
    const token = "phase5g-valid-verified-token";
    const fake = new FakeProductionIdentityVerifier(
      {
        [token]: buildVerifiedIdentity({
          uid: "uid-phase5g-admin",
          email: "admin@example.com",
          emailVerified: true,
          claims: { super_admin: true },
          issuer: ISSUER,
          audience: PROJECT_ID,
        }),
      },
      { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    );
    setProductionIdentityVerifierForTests(fake);

    const result = await resolveProductionVerifiedActor(token, env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.role).toBe("super_admin");
      expect(result.identity.uid).toBe("uid-phase5g-admin");
    }
  });

  it("missing token → TOKEN_MISSING", async () => {
    const env = verifiedTokenEnv();
    const result = await resolveProductionVerifiedActor("", env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TOKEN_MISSING");
  });

  it("unknown / invalid token → TOKEN_VERIFICATION_FAILED (not bare invalid_token)", async () => {
    const env = verifiedTokenEnv();
    const fake = new FakeProductionIdentityVerifier(
      {},
      { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    );
    setProductionIdentityVerifierForTests(fake);
    const result = await resolveProductionVerifiedActor("not-a-real-token", env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TOKEN_VERIFICATION_FAILED");
      expect(result.reason).not.toBe("invalid_token" as never);
    }
  });

  it("wrong audience → TOKEN_PROJECT_MISMATCH", async () => {
    const env = verifiedTokenEnv();
    const token = "phase5g-wrong-aud";
    const fake = new FakeProductionIdentityVerifier(
      {
        [token]: buildVerifiedIdentity({
          uid: "uid-x",
          claims: { super_admin: true },
          issuer: ISSUER,
          audience: "other-project",
        }),
      },
      { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    );
    setProductionIdentityVerifierForTests(fake);
    const result = await resolveProductionVerifiedActor(token, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TOKEN_PROJECT_MISMATCH");
  });

  it("expired token → TOKEN_EXPIRED", async () => {
    const env = verifiedTokenEnv();
    const token = "phase5g-expired";
    const fake = new FakeProductionIdentityVerifier(
      {
        [token]: buildVerifiedIdentity({
          uid: "uid-x",
          claims: { super_admin: true },
          issuer: ISSUER,
          audience: PROJECT_ID,
          expiresAt: new Date(Date.now() - 120_000),
        }),
      },
      { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    );
    setProductionIdentityVerifierForTests(fake);
    const result = await resolveProductionVerifiedActor(token, env);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TOKEN_EXPIRED");
  });

  it("verifyIdToken throw → TOKEN_VERIFICATION_FAILED (distinct from getUser)", async () => {
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: {
        async verifyIdToken() {
          throw Object.assign(new Error("revoked"), {
            code: "auth/id-token-revoked",
          });
        },
      },
      config: { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    });
    setProductionIdentityVerifierForTests(verifier);
    const env = verifiedTokenEnv();
    const result = await resolveProductionVerifiedActor("any-token", env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TOKEN_VERIFICATION_FAILED");
      expect(result.detail).toBe("token_verification_failed");
    }
  });

  it("getUser throw after verify → TOKEN_VERIFICATION_FAILED with user_lookup detail", async () => {
    const now = Math.floor(Date.now() / 1000);
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: {
        async verifyIdToken() {
          return {
            uid: "uid-ok",
            email: "a@b.c",
            email_verified: true,
            iss: ISSUER,
            aud: PROJECT_ID,
            exp: now + 3600,
            iat: now - 10,
            auth_time: now - 10,
            super_admin: true,
          };
        },
        async getUser() {
          throw Object.assign(new Error("lookup"), {
            code: "auth/user-not-found",
          });
        },
      },
      config: { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
      checkDisabledViaGetUser: true,
    });
    setProductionIdentityVerifierForTests(verifier);
    const env = verifiedTokenEnv();
    const result = await resolveProductionVerifiedActor("verified-ok", env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("TOKEN_VERIFICATION_FAILED");
      expect(result.detail).toBe("user_lookup_failed");
    }
  });

  it("AUTH_TIMEOUT when resolver exceeds budget", async () => {
    const env = verifiedTokenEnv();
    setProductionIdentityVerifierForTests({
      async verify() {
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          identity: buildVerifiedIdentity({
            uid: "slow",
            claims: { super_admin: true },
            issuer: ISSUER,
            audience: PROJECT_ID,
          }),
        };
      },
    });
    const result = await resolveProductionVerifiedActor("slow-token", env, undefined, {
      timeoutMs: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("AUTH_TIMEOUT");
  });

  it("never embeds raw token in denial reason/detail", async () => {
    const env = verifiedTokenEnv();
    const secretish = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    const fake = new FakeProductionIdentityVerifier(
      {},
      { expectedIssuer: ISSUER, expectedAudience: PROJECT_ID },
    );
    setProductionIdentityVerifierForTests(fake);
    const result = await resolveProductionVerifiedActor(secretish, env);
    expect(result.ok).toBe(false);
    const blob = JSON.stringify(result);
    expect(blob).not.toContain(secretish);
    expect(blob).not.toMatch(/eyJhbGci/);
  });
});
