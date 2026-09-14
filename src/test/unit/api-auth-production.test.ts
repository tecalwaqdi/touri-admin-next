import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  isHeaderUserIdAuthAllowed,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { loadEnv, resetEnvCache } from "@/config/env";
import {
  setProductionIdentityVerifierForTests,
  resetProductionAuthSingletonsForTests,
} from "@/infrastructure/auth/productionVerifiedAuth";
import {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";

function setAppEnv(appEnv: "development" | "staging" | "production"): void {
  process.env.APP_ENV = appEnv;
  process.env.NEXT_PUBLIC_APP_ENV = appEnv;
  process.env.AUTH_MODE =
    appEnv === "development" ? "mock" : "verified_token";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  process.env.EXPECTED_PROJECT_ID =
    appEnv === "development" ? "" : "tutorial-multi-language-70gx4j";
  resetEnvCache();
}

describe("api auth production blockers", () => {
  beforeEach(() => {
    setAppEnv("development");
    resetProductionAuthSingletonsForTests();
  });

  afterEach(() => {
    setProductionIdentityVerifierForTests(null);
    resetProductionAuthSingletonsForTests();
    setAppEnv("development");
  });

  it("allows x-user-id trust only in development", () => {
    expect(isHeaderUserIdAuthAllowed("development")).toBe(true);
    expect(isHeaderUserIdAuthAllowed("staging")).toBe(false);
    expect(isHeaderUserIdAuthAllowed("production")).toBe(false);
  });

  it("rejects x-user-id when APP_ENV=production", async () => {
    setAppEnv("production");

    const request = new Request("http://localhost/api/trips", {
      headers: { "x-user-id": "USR-SUPER" },
    });

    await expect(resolveApiActor(request)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(resolveApiActor(request)).rejects.toThrow(
      /x-user-id|UNTRUSTED_IDENTITY_HEADER|forbidden/i,
    );
  });

  it("rejects mock bearer when APP_ENV=production", async () => {
    setAppEnv("production");

    const request = new Request("http://localhost/api/trips", {
      headers: { authorization: "Bearer mock:USR-SUPER" },
    });

    await expect(resolveApiActor(request)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects x-user-id when APP_ENV=staging", async () => {
    setAppEnv("staging");

    const request = new Request("http://localhost/api/trips", {
      headers: { "x-user-id": "USR-SUPER" },
    });

    await expect(resolveApiActor(request)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("accepts verified Firebase Bearer token when AUTH_MODE=verified_token", async () => {
    setAppEnv("production");
    const projectId = "tutorial-multi-language-70gx4j";
    const identity = buildVerifiedIdentity({
      uid: "uid-auditor",
      email: "auditor@example.com",
      emailVerified: true,
      disabled: false,
      claims: { super_admin: true },
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    setProductionIdentityVerifierForTests(
      new FakeProductionIdentityVerifier(
        { "valid-id-token": identity },
        {
          expectedIssuer: `https://securetoken.google.com/${projectId}`,
          expectedAudience: projectId,
        },
      ),
    );

    const ctx = await resolveApiActor(
      new Request("http://localhost/api/trips", {
        headers: { authorization: "Bearer valid-id-token" },
      }),
    );
    expect(ctx.user.id).toBe("uid-auditor");
    expect(ctx.user.role).toBe("super_admin");
    expect(ctx.user.scope.type).toBe("global");
  });

  it("keeps production read/write flags false under production APP_ENV", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
      AUTH_MODE: "verified_token",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
    });
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.FINANCE_WRITE_ENABLED).toBe(false);
    expect(env.DRIVER_WRITE_ENABLED).toBe(false);
    expect(env.AGENT_WRITE_ENABLED).toBe(false);
  });
});
