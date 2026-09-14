import { describe, expect, it, beforeEach } from "vitest";
import { GET } from "@/app/api/auth/me/route";
import { resetEnvCache } from "@/config/env";
import {
  resetProductionAuthSingletonsForTests,
  setProductionIdentityVerifierForTests,
} from "@/infrastructure/auth/productionVerifiedAuth";
import {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";

function withProductionVerifiedTokenEnv() {
  process.env.APP_ENV = "production";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  process.env.AUTH_MODE = "verified_token";
  process.env.EXPECTED_PROJECT_ID = "tutorial-multi-language-70gx4j";
  process.env.EXPECTED_ENVIRONMENT = "production";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  resetEnvCache();
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    resetProductionAuthSingletonsForTests();
    setProductionIdentityVerifierForTests(null);
  });

  it("rejects x-user-id in production verified_token mode", async () => {
    withProductionVerifiedTokenEnv();
    const res = await GET(
      new Request("http://localhost/api/auth/me", {
        headers: { "x-user-id": "user_super" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns actor profile from Bearer token", async () => {
    withProductionVerifiedTokenEnv();
    const projectId = "tutorial-multi-language-70gx4j";
    const identity = buildVerifiedIdentity({
      uid: "firebase-uid-1",
      email: "admin@touri.com",
      emailVerified: true,
      disabled: false,
      claims: { super_admin: true },
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    setProductionIdentityVerifierForTests(
      new FakeProductionIdentityVerifier(
        { "valid-test-token": identity },
        {
          expectedIssuer: `https://securetoken.google.com/${projectId}`,
          expectedAudience: projectId,
        },
      ),
    );
    const res = await GET(
      new Request("http://localhost/api/auth/me", {
        headers: { Authorization: "Bearer valid-test-token" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; role: string } };
    expect(body.user.id).toBe("firebase-uid-1");
    expect(body.user.role).toBe("super_admin");
  });
});
