/**
 * Unit tests — finance forward Google OIDC S2S allowlist auth.
 */

import { describe, expect, it } from "vitest";
import {
  FINANCE_FORWARD_S2S_ALLOWED_SA_EMAILS_DEFAULT,
  FINANCE_FORWARD_S2S_AUDIENCE_DEFAULT,
  isGoogleOidcIssuer,
  peekBearerTokenIssuer,
  resolveFinanceForwardS2sAllowedEmails,
  resolveFinanceForwardS2sAudience,
  verifyFinanceForwardS2sBearer,
} from "@/infrastructure/auth/financeForwardS2sAuth";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("financeForwardS2sAuth", () => {
  it("detects Google OIDC issuer from bearer peek", () => {
    const token = fakeJwt({
      iss: "https://accounts.google.com",
      email: "tutorial-multi-language-70gx4j@appspot.gserviceaccount.com",
    });
    expect(peekBearerTokenIssuer(token)).toBe("https://accounts.google.com");
    expect(isGoogleOidcIssuer(peekBearerTokenIssuer(token))).toBe(true);
  });

  it("does not treat Firebase securetoken as Google OIDC", () => {
    const token = fakeJwt({
      iss: "https://securetoken.google.com/tutorial-multi-language-70gx4j",
    });
    expect(isGoogleOidcIssuer(peekBearerTokenIssuer(token))).toBe(false);
  });

  it("verifies allowlisted SA and maps system actor", async () => {
    const email =
      FINANCE_FORWARD_S2S_ALLOWED_SA_EMAILS_DEFAULT[0];
    const actor = await verifyFinanceForwardS2sBearer({
      bearerToken: "unused",
      audience: FINANCE_FORWARD_S2S_AUDIENCE_DEFAULT,
      verifyIdToken: async () => ({
        getPayload: () => ({
          email,
          email_verified: true,
          aud: FINANCE_FORWARD_S2S_AUDIENCE_DEFAULT,
        }),
      }),
    });
    expect(actor.principalEmail).toBe(email);
    expect(actor.user.id).toBe(`s2s:${email}`);
    expect(actor.user.permissions).toContain("settlements:prepare");
    expect(actor.user.scope.type).toBe("global");
  });

  it("rejects non-allowlisted SA", async () => {
    await expect(
      verifyFinanceForwardS2sBearer({
        bearerToken: "unused",
        verifyIdToken: async () => ({
          getPayload: () => ({
            email: "evil@other.iam.gserviceaccount.com",
            email_verified: true,
          }),
        }),
      }),
    ).rejects.toThrow(/not_allowlisted/);
  });

  it("env audience + SA list overrides defaults", () => {
    expect(
      resolveFinanceForwardS2sAudience({
        FINANCE_FORWARD_S2S_AUDIENCE: "https://admin-next.touri-taxi.com",
      }),
    ).toBe("https://admin-next.touri-taxi.com");
    const set = resolveFinanceForwardS2sAllowedEmails({
      FINANCE_FORWARD_S2S_SA_EMAILS: "a@x.com, B@Y.com",
    });
    expect(set.has("a@x.com")).toBe(true);
    expect(set.has("b@y.com")).toBe(true);
  });
});
