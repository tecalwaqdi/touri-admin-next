import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  classifyFinanceReportingFailure,
  financeReportingClientErrorMessage,
} from "@/infrastructure/finance/financeReportingFailureClassification";
import {
  FR7_PREFERRED_SHADOW_READER_SA,
  createVercelOidcWifFirebaseCredential,
  resolveVercelOidcWifConfig,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import { FinanceReportingRoFirebaseUnreachableError } from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { financeReportingApiErrorResponse } from "@/infrastructure/finance/financeReportingApiErrors";

describe("FR7 finance reporting failure classification", () => {
  const prev = {
    APP_ENV: process.env.APP_ENV,
    EXPECTED_ENVIRONMENT: process.env.EXPECTED_ENVIRONMENT,
  };

  afterEach(() => {
    process.env.APP_ENV = prev.APP_ENV;
    process.env.EXPECTED_ENVIRONMENT = prev.EXPECTED_ENVIRONMENT;
  });

  it("classifies missing ADC as FR7_ADC_MISSING", () => {
    const c = classifyFinanceReportingFailure(
      new Error(
        "Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.",
      ),
    );
    expect(c.category).toBe("ADC_MISSING");
    expect(c.code).toBe("FR7_ADC_MISSING");
    expect(c.sanitizedMessage).not.toMatch(/Bearer|private_key/i);
  });

  it("redacts Authorization/Bearer from classified messages", () => {
    const c = classifyFinanceReportingFailure(
      new Error("boom Authorization: Bearer super-secret-token"),
    );
    expect(c.sanitizedMessage).not.toMatch(/super-secret-token|Bearer\s+super/i);
  });

  it("classifies typed FR7_ADC_MISSING unreachable error", () => {
    const c = classifyFinanceReportingFailure(
      new FinanceReportingRoFirebaseUnreachableError(
        "Could not load the default credentials",
        "FR7_ADC_MISSING",
      ),
    );
    expect(c.code).toBe("FR7_ADC_MISSING");
  });

  it("classifies incomplete WIF config", () => {
    const c = classifyFinanceReportingFailure(
      new FinanceReportingRoFirebaseUnreachableError(
        "FR7_WIF_CONFIG_INCOMPLETE: missing GCP_SERVICE_ACCOUNT_EMAIL",
        "FR7_WIF_CONFIG_INCOMPLETE",
      ),
    );
    expect(c.category).toBe("WIF_CONFIG_MISSING");
    expect(c.code).toBe("FR7_WIF_CONFIG_MISSING");
  });

  it("classifies missing Vercel OIDC token", () => {
    const c = classifyFinanceReportingFailure(
      new Error(
        "FR7_WIF_TOKEN_MISSING: VERCEL_OIDC_TOKEN is not available (enable Vercel OIDC federation)",
      ),
    );
    expect(c.category).toBe("WIF_TOKEN_MISSING");
    expect(c.code).toBe("FR7_WIF_TOKEN_MISSING");
  });

  it("keeps Production client 500 message generic", () => {
    process.env.APP_ENV = "production";
    expect(
      financeReportingClientErrorMessage(
        new Error("Could not load the default credentials"),
      ),
    ).toBe("An unexpected error occurred");
  });

  it("logs classification via financeReportingApiErrorResponse without leaking secrets", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = financeReportingApiErrorResponse(
      new Error("Could not load the default credentials Authorization: Bearer secret"),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toMatch(/Bearer|secret/i);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/FR7_ADC_MISSING|ADC_MISSING/);
    expect(logged).not.toMatch(/Bearer secret/);
    spy.mockRestore();
  });
});

describe("Vercel OIDC WIF credential config", () => {
  const keys = [
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "GCP_SERVICE_ACCOUNT_EMAIL",
    "VERCEL_OIDC_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports unset when WIF env absent", () => {
    expect(resolveVercelOidcWifConfig({}).status).toBe("unset");
  });

  it("fail-closes incomplete WIF env", () => {
    const r = resolveVercelOidcWifConfig({
      GCP_WORKLOAD_IDENTITY_PROVIDER:
        "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel",
    });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("GCP_SERVICE_ACCOUNT_EMAIL");
  });

  it("ready when provider + shadow-reader SA set", () => {
    const r = resolveVercelOidcWifConfig({
      GCP_WORKLOAD_IDENTITY_PROVIDER:
        "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel",
      GCP_SERVICE_ACCOUNT_EMAIL: FR7_PREFERRED_SHADOW_READER_SA,
    });
    expect(r.status).toBe("ready");
    expect(r.config?.serviceAccountEmail).toBe(FR7_PREFERRED_SHADOW_READER_SA);
  });

  it("credential getAccessToken fails closed without OIDC token (no key material)", async () => {
    const cred = createVercelOidcWifFirebaseCredential({
      workloadIdentityProvider:
        "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel",
      serviceAccountEmail: FR7_PREFERRED_SHADOW_READER_SA,
    });
    await expect(cred.getAccessToken()).rejects.toThrow(/VERCEL_OIDC_TOKEN|WIF_TOKEN/);
  });
});
