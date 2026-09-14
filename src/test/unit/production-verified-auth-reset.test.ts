/**
 * Regression: FirebaseAdminFactory.resetSingletonForTests() alone does NOT clear
 * productionVerifiedAuth module singletons (factorySingleton / verifierOverride).
 * Live harness and unit suites must call resetProductionAuthSingletonsForTests().
 * No Production Firestore queries.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "@/config/env";
import {
  FakeProductionIdentityVerifier,
  buildVerifiedIdentity,
} from "@/domain/auth/ProductionIdentityVerifier";
import {
  getProductionFirebaseFactoryForLive,
  getProductionIdentityVerifier,
  resetProductionAuthSingletonsForTests,
  setProductionIdentityVerifierForTests,
} from "@/infrastructure/auth/productionVerifiedAuth";
import { FirebaseAdminFactory } from "@/infrastructure/production/firebase/FirebaseAdminFactory";

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
  resetEnvCache();
}

function restoreDisabledEnv(): void {
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

describe("productionVerifiedAuth singleton reset", () => {
  beforeEach(() => {
    restoreDisabledEnv();
    resetProductionAuthSingletonsForTests();
  });

  afterEach(() => {
    setProductionIdentityVerifierForTests(null);
    resetProductionAuthSingletonsForTests();
    restoreDisabledEnv();
  });

  it("resetProductionAuthSingletonsForTests clears override; factory-only reset does not", async () => {
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    setProductionVerifiedEnv();
    const env = loadEnv();
    const fake = new FakeProductionIdentityVerifier(
      {
        "valid-id-token": buildVerifiedIdentity({
          uid: "uid-reset-test",
          email: "reset@example.com",
          emailVerified: true,
          disabled: false,
          claims: { super_admin: true },
          issuer: `https://securetoken.google.com/${PROJECT_ID}`,
          audience: PROJECT_ID,
        }),
      },
      {
        expectedIssuer: `https://securetoken.google.com/${PROJECT_ID}`,
        expectedAudience: PROJECT_ID,
      },
    );
    setProductionIdentityVerifierForTests(fake);

    const beforeFactoryReset = await getProductionIdentityVerifier(env);
    expect(beforeFactoryReset).toBe(fake);
    // Override path never creates the Production Auth factory
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    // Defect pattern: FirebaseAdminFactory reset alone leaves verifierOverride
    FirebaseAdminFactory.resetSingletonForTests();
    expect(await getProductionIdentityVerifier(env)).toBe(fake);

    resetProductionAuthSingletonsForTests();
    expect(getProductionFirebaseFactoryForLive()).toBeNull();

    // Override cleared — without override, AUTH_MODE mock rejects before factory create
    restoreDisabledEnv();
    await expect(getProductionIdentityVerifier(loadEnv())).rejects.toThrow(
      /AUTH_MODE must be verified_token/i,
    );
    expect(getProductionFirebaseFactoryForLive()).toBeNull();
  });

  it("keeps Production Read/Write disabled after reset cleanup", () => {
    setProductionVerifiedEnv();
    resetProductionAuthSingletonsForTests();
    restoreDisabledEnv();
    const env = loadEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(getProductionFirebaseFactoryForLive()).toBeNull();
  });
});
