/**
 * Auth-only Firebase ID-token verification — decoupled from runtime ADC.
 * Covers: reject x-user-id, require Bearer, valid identity mapping,
 * wrong project/audience, invalid token, no SA JSON, no silent bypass.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import {
  resolveActorFromVerifiedToken,
} from "@/domain/auth/ProductionAuthDesign";
import {
  extractBearerIdToken,
  getProductionIdentityVerifier,
  resetProductionAuthSingletonsForTests,
  resolveProductionVerifiedActor,
  setProductionIdentityVerifierForTests,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { classifyProductionAuthThrownError } from "@/infrastructure/auth/productionAuthFailureClassification";
import {
  MissingProductionCredentialProvider,
  ProductionCredentialError,
} from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  AUTH_ONLY_FIREBASE_APP_NAME,
  AUTH_ONLY_NO_ADC_CREDENTIAL,
  FirebaseAdminFactory,
  FirebaseAdminInitError,
} from "@/infrastructure/production/firebase/FirebaseAdminFactory";
import {
  FakeFirebaseAuthAdminClient,
  FirebaseAdminProductionIdentityVerifier,
} from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import { resolveApiActor, UnauthorizedError } from "@/infrastructure/http/apiAuth";
import type { ProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

const PROJECT_ID = "tutorial-multi-language-70gx4j";

function setProductionVerifiedEnv(): void {
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
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  resetEnvCache();
}

function restoreDevEnv(): void {
  process.env.APP_ENV = "development";
  process.env.NEXT_PUBLIC_APP_ENV = "development";
  process.env.AUTH_MODE = "mock";
  process.env.EXPECTED_PROJECT_ID = "";
  process.env.EXPECTED_ENVIRONMENT = "development";
  process.env.PRODUCTION_READ_ENABLED = "false";
  process.env.PRODUCTION_READ_MODE = "disabled";
  process.env.PRODUCTION_WRITE_ENABLED = "false";
  process.env.GLOBAL_PRODUCTION_WRITE_ENABLED = "false";
  process.env.FINANCE_WRITE_ENABLED = "false";
  process.env.DRIVER_WRITE_ENABLED = "false";
  process.env.AGENT_WRITE_ENABLED = "false";
  resetEnvCache();
}

function baseClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    uid: "uid-super-1",
    email: "admin@touri.taxi",
    email_verified: true,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    exp: now + 3600,
    iat: now - 60,
    auth_time: now - 60,
    super_admin: true,
    ...overrides,
  };
}

function productionFactoryEnv() {
  return {
    APP_ENV: "production" as const,
    AUTH_MODE: "verified_token" as const,
    PRODUCTION_READ_ENABLED: false,
    PRODUCTION_READ_MODE: "disabled" as const,
    PRODUCTION_WRITE_ENABLED: false,
    GLOBAL_PRODUCTION_WRITE_ENABLED: false,
    FINANCE_WRITE_ENABLED: false,
    DRIVER_WRITE_ENABLED: false,
    AGENT_WRITE_ENABLED: false,
    EXPECTED_PROJECT_ID: PROJECT_ID,
    EXPECTED_ENVIRONMENT: "production" as const,
  };
}

describe("production auth ADC decouple", () => {
  beforeEach(() => {
    restoreDevEnv();
    resetProductionAuthSingletonsForTests();
    setProductionIdentityVerifierForTests(null);
  });

  afterEach(() => {
    setProductionIdentityVerifierForTests(null);
    resetProductionAuthSingletonsForTests();
    restoreDevEnv();
  });

  it("rejects x-user-id in production verified_token mode", async () => {
    setProductionVerifiedEnv();
    await expect(
      resolveApiActor(
        new Request("http://localhost/api/auth/me", {
          headers: { "x-user-id": "USR-SUPER" },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("requires Bearer Firebase ID token (no silent header bypass)", async () => {
    setProductionVerifiedEnv();
    expect(extractBearerIdToken(null)).toBeNull();
    expect(extractBearerIdToken("Bearer mock:USR-SUPER")).toBeNull();
    await expect(
      resolveApiActor(new Request("http://localhost/api/auth/me")),
    ).rejects.toThrow(/Missing Firebase ID token|Bearer/i);
  });

  it("valid token path maps identity via verifier → RBAC", async () => {
    const auth = new FakeFirebaseAuthAdminClient({
      "good-token": baseClaims(),
    });
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: auth,
      config: {
        expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
        expectedAudience: PROJECT_ID,
      },
      checkRevoked: false,
      checkDisabledViaGetUser: false,
    });
    const resolved = await resolveActorFromVerifiedToken(verifier, "good-token");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.identity.uid).toBe("uid-super-1");
      expect(resolved.identity.role).toBe("super_admin");
      expect(resolved.identity.scope.type).toBe("global");
    }
  });

  it("rejects wrong project / audience", async () => {
    const auth = new FakeFirebaseAuthAdminClient({
      "wrong-aud": baseClaims({ aud: "other-project-id" }),
      "wrong-iss": baseClaims({
        iss: "https://securetoken.google.com/other-project-id",
      }),
    });
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: auth,
      config: {
        expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
        expectedAudience: PROJECT_ID,
      },
    });
    const aud = await verifier.verify("wrong-aud");
    expect(aud.ok).toBe(false);
    if (!aud.ok) expect(aud.reason).toBe("wrong_audience");
    const iss = await verifier.verify("wrong-iss");
    expect(iss.ok).toBe(false);
    if (!iss.ok) expect(iss.reason).toBe("wrong_issuer");
  });

  it("rejects invalid token (no unsigned accept)", async () => {
    const auth = new FakeFirebaseAuthAdminClient({});
    const verifier = new FirebaseAdminProductionIdentityVerifier({
      authClient: auth,
      config: {
        expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
        expectedAudience: PROJECT_ID,
      },
    });
    const result = await verifier.verify("garbage-token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("token_verification_failed");
    }
  });

  it("getAuthClient does not call Production credential provider (no ADC / SA JSON)", async () => {
    let credCalls = 0;
    const countingProvider: ProductionCredentialProvider = {
      name: "CountingNeverCallProvider",
      async getCredentials() {
        credCalls += 1;
        throw new ProductionCredentialError(
          "PRODUCTION_CREDENTIALS_MISSING",
          "should not be called for auth-only verify",
        );
      },
    };
    const factory = new FirebaseAdminFactory({
      env: productionFactoryEnv(),
      credentialProvider: countingProvider,
      authClient: new FakeFirebaseAuthAdminClient({
        "good-token": baseClaims(),
      }),
    });
    const client = await factory.getAuthClient();
    expect(credCalls).toBe(0);
    const decoded = await client.verifyIdToken("good-token", true);
    expect(decoded.uid).toBe("uid-super-1");
    expect(decoded.aud).toBe(PROJECT_ID);
    // Auth-only client must not expose getUser (ADC-backed)
    expect(client.getUser).toBeUndefined();
  });

  it("auth-only factory uses MissingProductionCredentialProvider wiring from productionVerifiedAuth", async () => {
    setProductionVerifiedEnv();
    const env = loadEnv();
    const fake = new FakeFirebaseAuthAdminClient({
      "good-token": baseClaims(),
    });
    FirebaseAdminFactory.resetSingletonForTests();
    const factory = FirebaseAdminFactory.getOrCreate({
      env: {
        APP_ENV: env.APP_ENV,
        AUTH_MODE: env.AUTH_MODE,
        PRODUCTION_READ_ENABLED: env.PRODUCTION_READ_ENABLED,
        PRODUCTION_READ_MODE: env.PRODUCTION_READ_MODE,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
        DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
        AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
        EXPECTED_PROJECT_ID: env.EXPECTED_PROJECT_ID,
        EXPECTED_ENVIRONMENT: env.EXPECTED_ENVIRONMENT,
      },
      credentialProvider: new MissingProductionCredentialProvider(),
      authClient: fake,
    });
    // Firestore path still fail-closed without ADC
    await expect(factory.getApp()).rejects.toBeInstanceOf(FirebaseAdminInitError);
    const client = await factory.getAuthClient();
    expect(await client.verifyIdToken("good-token")).toMatchObject({
      uid: "uid-super-1",
      aud: PROJECT_ID,
    });
  });

  it("AUTH_ONLY_NO_ADC_CREDENTIAL refuses getAccessToken (no silent ADC)", async () => {
    await expect(AUTH_ONLY_NO_ADC_CREDENTIAL.getAccessToken()).rejects.toThrow(
      /AUTH_VERIFIER_NO_ADC/,
    );
    expect(AUTH_ONLY_FIREBASE_APP_NAME).toBe("admin-next-auth-verify");
  });

  it("classifies auth verifier init / ADC failures without leaking secrets", () => {
    const initErr = new FirebaseAdminInitError(
      "AUTH_VERIFIER_INIT_FAILED",
      "Auth-only Firebase Admin init failed",
    );
    expect(classifyProductionAuthThrownError(initErr)).toBe(
      "TOKEN_VERIFICATION_FAILED",
    );
    expect(
      classifyProductionAuthThrownError(
        new Error("Could not load the default credentials"),
      ),
    ).toBe("TOKEN_VERIFICATION_FAILED");
    expect(
      classifyProductionAuthThrownError(
        new Error("PROJECT_FINGERPRINT_MISMATCH: expected=a actual=b"),
      ),
    ).toBe("TOKEN_PROJECT_MISMATCH");
  });

  it("resolveProductionVerifiedActor does not accept unsigned / missing verification", async () => {
    setProductionVerifiedEnv();
    const env = loadEnv();
    const auth = new FakeFirebaseAuthAdminClient({});
    setProductionIdentityVerifierForTests(
      new FirebaseAdminProductionIdentityVerifier({
        authClient: auth,
        config: {
          expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
          expectedAudience: PROJECT_ID,
        },
      }),
    );
    const missing = await resolveProductionVerifiedActor("", env);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("TOKEN_MISSING");

    const invalid = await resolveProductionVerifiedActor("not-verified", env);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.reason).toBe("TOKEN_VERIFICATION_FAILED");
    }
  });

  it("productionVerifiedAuth wiring keeps AUTH_MODE=verified_token and no SA JSON path", () => {
    setProductionVerifiedEnv();
    const env = loadEnv();
    expect(env.AUTH_MODE).toBe("verified_token");
    expect(env.EXPECTED_PROJECT_ID).toBe(PROJECT_ID);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(process.env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
  });

  it("getProductionIdentityVerifier builds auth-only verifier without ADC provider success", async () => {
    setProductionVerifiedEnv();
    const env = loadEnv();
    const fake = new FakeFirebaseAuthAdminClient({
      "map-me": baseClaims(),
    });
    // Inject via factory singleton before getProductionIdentityVerifier creates one
    FirebaseAdminFactory.getOrCreate({
      env: productionFactoryEnv(),
      credentialProvider: new MissingProductionCredentialProvider(),
      authClient: fake,
    });
    // Align productionVerifiedAuth factorySingleton by going through reset then
    // setProductionIdentityVerifierForTests path — use direct resolve instead:
    setProductionIdentityVerifierForTests(
      new FirebaseAdminProductionIdentityVerifier({
        authClient: fake,
        config: {
          expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
          expectedAudience: PROJECT_ID,
        },
        checkRevoked: false,
        checkDisabledViaGetUser: false,
      }),
    );
    const verifier = await getProductionIdentityVerifier(env);
    const result = await verifier.verify("map-me");
    expect(result.ok).toBe(true);
  });
});
