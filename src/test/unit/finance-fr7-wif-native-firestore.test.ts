import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(),
}));

import { getVercelOidcToken } from "@vercel/oidc";
import {
  createFirebaseFinanceReportingRoFirestorePort,
  FinanceReportingRoFirebaseUnreachableError,
} from "@/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort";
import { FINANCE_FR7_EXPECTED_PROJECT_ID } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import { FINANCE_REPORTING_RO_QUERY_LIMIT } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import {
  acquireVercelOidcSubjectToken,
  createVercelOidcWifAuthClient,
  createVercelOidcWifGoogleAuth,
  FR7_PREFERRED_SHADOW_READER_SA,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import {
  decodeFirestoreFields,
  decodeFirestoreValue,
  Fr7WifNativeFirestoreReadTransport,
  structuredQueryLimit,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

const getVercelOidcTokenMock = vi.mocked(getVercelOidcToken);

function runQueryStream(
  docs: Array<{ name: string; fields: Record<string, unknown> }>,
): NodeJS.ReadableStream {
  return Readable.from(docs.map((document) => ({ document })));
}

function mockRpc(overrides?: {
  getDocument?: Fr7FirestoreReadRpcClient["getDocument"];
  runQuery?: Fr7FirestoreReadRpcClient["runQuery"];
  runAggregationQuery?: Fr7FirestoreReadRpcClient["runAggregationQuery"];
}): Fr7FirestoreReadRpcClient {
  return {
    getDocument:
      overrides?.getDocument ??
      (async () => {
        throw Object.assign(new Error("5 NOT_FOUND"), { code: 5 });
      }),
    runQuery:
      overrides?.runQuery ??
      (() => runQueryStream([])),
    runAggregationQuery:
      overrides?.runAggregationQuery ??
      (() => Readable.from([])),
  };
}

describe("FR7 WIF-native Firestore read transport", () => {
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
    getVercelOidcTokenMock.mockReset();
    getVercelOidcTokenMock.mockRejectedValue(
      new Error("The 'x-vercel-oidc-token' header is missing from the request."),
    );
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
  });

  it("decodes Firestore value types (string/bool/int/double/timestamp/null/array/map/refs)", () => {
    const fields = decodeFirestoreFields({
      s: { stringValue: "hello" },
      b: { booleanValue: true },
      i: { integerValue: "42" },
      d: { doubleValue: 1.5 },
      t: { timestampValue: { seconds: "1700000000", nanos: 0 } },
      n: { nullValue: "NULL_VALUE" },
      a: {
        arrayValue: {
          values: [{ stringValue: "x" }, { integerValue: "2" }],
        },
      },
      m: {
        mapValue: {
          fields: { nested: { stringValue: "y" } },
        },
      },
      r: {
        referenceValue:
          "projects/p/databases/(default)/documents/finance_adjustments/a1",
      },
    });
    expect(fields.s).toBe("hello");
    expect(fields.b).toBe(true);
    expect(fields.i).toBe(42);
    expect(fields.d).toBe(1.5);
    expect(fields.t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(fields.n).toBeNull();
    expect(fields.a).toEqual(["x", 2]);
    expect(fields.m).toEqual({ nested: "y" });
    expect(fields.r).toContain("finance_adjustments/a1");
    expect(decodeFirestoreValue(undefined)).toBeNull();
  });

  it("getDocument + queryByCountry use only read RPCs and cap limit at 50", async () => {
    const calls: string[] = [];
    const rpc = mockRpc({
      getDocument: async ({ name }) => {
        calls.push(`getDocument:${name}`);
        return [
          {
            name,
            fields: {
              countryId: { stringValue: "SA" },
              amountMinor: { stringValue: "1500" },
            },
          },
        ];
      },
      runQuery: (req) => {
        calls.push("runQuery");
        const limitField = (
          req.structuredQuery as { limit?: { value?: number } | number }
        ).limit;
        const limit =
          typeof limitField === "number"
            ? limitField
            : Number(limitField?.value ?? 0);
        expect(limit).toBeLessThanOrEqual(FINANCE_REPORTING_RO_QUERY_LIMIT);
        expect(limit).toBe(50);
        expect(limitField).toEqual(structuredQueryLimit(50));
        expect(
          (req.structuredQuery as { where?: unknown }).where,
        ).toMatchObject({
          fieldFilter: {
            field: { fieldPath: "countryId" },
            op: "EQUAL",
            value: { stringValue: "SA" },
          },
        });
        return runQueryStream([
          {
            name: `${req.parent}/finance_refund_accounting/r1`,
            fields: { countryId: { stringValue: "SA" } },
          },
        ]);
      },
    });

    const port = await createFirebaseFinanceReportingRoFirestorePort({
      projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      rpcClient: rpc,
    });

    const doc = await port.getDocument(
      "finance_accounting_snapshots",
      "snap_1",
    );
    expect(doc.exists).toBe(true);
    expect(doc.data?.countryId).toBe("SA");

    const rows = await port.queryByCountry("finance_refund_accounting", {
      countryId: "SA",
      limit: 999,
    });
    expect(rows).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("getDocument:"))).toBe(true);
    expect(calls).toContain("runQuery");
    expect(port.getCounter().productionWrites).toBe(0);
    expect(port.getCounter().firestoreMutations).toBe(0);
  });

  it("WIF AuthClient is real EventEmitter; GoogleAuth wraps it for GAPIC; no Admin Credential path", async () => {
    process.env.GCP_WORKLOAD_IDENTITY_PROVIDER =
      "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel";
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = FR7_PREFERRED_SHADOW_READER_SA;

    const authClient = createVercelOidcWifAuthClient({
      workloadIdentityProvider: process.env.GCP_WORKLOAD_IDENTITY_PROVIDER,
      serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    });
    expect(authClient).toBeTruthy();
    expect(typeof authClient.getAccessToken).toBe("function");
    expect(typeof authClient.on).toBe("function");
    expect(typeof (authClient as { emit?: unknown }).emit).toBe("function");

    const auth = createVercelOidcWifGoogleAuth(
      {
        workloadIdentityProvider: process.env.GCP_WORKLOAD_IDENTITY_PROVIDER,
        serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
      },
      FINANCE_FR7_EXPECTED_PROJECT_ID,
    );
    expect(typeof auth.getClient).toBe("function");
    expect(typeof auth.fetch).toBe("function");
    const resolved = await auth.getClient();
    expect(typeof resolved.getAccessToken).toBe("function");
    expect(typeof resolved.on).toBe("function");

    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      auth,
      rpcClient: mockRpc({
        getDocument: async ({ name }) => [{ name, fields: {} }],
      }),
    });
    const got = await transport.getDocument("financial_settlements", "s1");
    expect(got.exists).toBe(true);

    const portSrc = readFileSync(
      join(
        process.cwd(),
        "src/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort.ts",
      ),
      "utf8",
    );
    expect(portSrc).not.toMatch(/from ["']firebase-admin["']|import\(["']firebase-admin["']\)/);
    expect(portSrc).not.toMatch(/applicationDefault\s*\(/);
    expect(portSrc).not.toMatch(/initializeApp/);
    expect(portSrc).toMatch(/createWifNativeFirestoreRead|createVercelOidcWifGoogleAuth/);
    expect(portSrc).toMatch(/Fr7WifNativeFirestoreReadTransport/);
    expect(portSrc).not.toMatch(/as never|as unknown as/);

    const factorySrc = readFileSync(
      join(
        process.cwd(),
        "src/infrastructure/production/firestore/createWifNativeFirestoreReadTransport.ts",
      ),
      "utf8",
    );
    expect(factorySrc).toMatch(/createVercelOidcWifGoogleAuth/);
    expect(factorySrc).not.toMatch(/from ["']firebase-admin["']/);

    const transportSrc = readFileSync(
      join(
        process.cwd(),
        "src/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport.ts",
      ),
      "utf8",
    );
    expect(transportSrc).toMatch(/@google-cloud\/firestore-api/);
    expect(transportSrc).toMatch(/\bauth\b/);
    expect(transportSrc).toMatch(/structuredQueryLimit/);
    expect(transportSrc).not.toMatch(/as never|as unknown as|EventEmitter/);
    expect(transportSrc).not.toMatch(
      /from ["']firebase-admin["']|createDocument\(|updateDocument\(|deleteDocument\(|batchWrite\(|\.commit\(/,
    );
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
  });

  it("StructuredQuery.limit uses Int32Value shape { value }", () => {
    expect(structuredQueryLimit(50)).toEqual({ value: 50 });
  });

  it("incomplete WIF fails closed (no ADC silent fallback)", async () => {
    process.env.GCP_WORKLOAD_IDENTITY_PROVIDER =
      "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel";
    await expect(
      createFirebaseFinanceReportingRoFirestorePort({
        projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      }),
    ).rejects.toMatchObject({
      code: "FR7_WIF_CONFIG_INCOMPLETE",
    });
  });

  it("WIF ready + GAC set refuses SA JSON keys", async () => {
    process.env.GCP_WORKLOAD_IDENTITY_PROVIDER =
      "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel";
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = FR7_PREFERRED_SHADOW_READER_SA;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/fake-sa.json";
    await expect(
      createFirebaseFinanceReportingRoFirestorePort({
        projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      }),
    ).rejects.toBeInstanceOf(FinanceReportingRoFirebaseUnreachableError);
    await expect(
      createFirebaseFinanceReportingRoFirestorePort({
        projectId: FINANCE_FR7_EXPECTED_PROJECT_ID,
      }),
    ).rejects.toMatchObject({ code: "FR7_CREDENTIALS_INVALID" });
  });

  it("missing OIDC token fails closed on WIF AuthClient getAccessToken", async () => {
    const client = createVercelOidcWifAuthClient({
      workloadIdentityProvider:
        "projects/123/locations/global/workloadIdentityPools/pool/providers/vercel",
      serviceAccountEmail: FR7_PREFERRED_SHADOW_READER_SA,
    });
    await expect(client.getAccessToken()).rejects.toThrow(
      /OIDC token|WIF_TOKEN/,
    );
    expect(getVercelOidcTokenMock).toHaveBeenCalled();
  });

  it("production OIDC path does not read process.env.VERCEL_OIDC_TOKEN", async () => {
    process.env.VERCEL_OIDC_TOKEN = "env-token-must-not-be-used";
    getVercelOidcTokenMock.mockResolvedValue("request-scoped-token");

    const credSrc = readFileSync(
      join(
        process.cwd(),
        "src/infrastructure/production/credentials/VercelOidcWifCredential.ts",
      ),
      "utf8",
    );
    const credCode = credSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(credCode).toMatch(/from ["']@vercel\/oidc["']/);
    expect(credCode).toMatch(/getVercelOidcToken/);
    expect(credCode).not.toMatch(
      /process\.env(?:\.VERCEL_OIDC_TOKEN|\[[`'"]VERCEL_OIDC_TOKEN[`'"]\])/,
    );
    // getVercelOidcToken only inside acquireVercelOidcSubjectToken (request path).
    expect(
      (credCode.match(/await getVercelOidcToken\s*\(/g) ?? []).length,
    ).toBe(1);
    expect(credCode).toMatch(
      /export async function acquireVercelOidcSubjectToken[\s\S]*await getVercelOidcToken\s*\(/,
    );
    // No module-scope invocation between imports and first export/function body call site.
    const beforeAcquire = credCode.slice(
      0,
      credCode.indexOf("export async function acquireVercelOidcSubjectToken"),
    );
    expect(beforeAcquire).not.toMatch(/getVercelOidcToken\s*\(/);

    const token = await acquireVercelOidcSubjectToken();
    expect(token).toBe("request-scoped-token");
    expect(token).not.toBe(process.env.VERCEL_OIDC_TOKEN);
    expect(getVercelOidcTokenMock).toHaveBeenCalledTimes(1);
  });

  it("WIF subject_token_supplier uses request-scoped getVercelOidcToken", async () => {
    getVercelOidcTokenMock.mockResolvedValue("scoped-oidc-jwt");
    const token = await acquireVercelOidcSubjectToken();
    expect(token).toBe("scoped-oidc-jwt");

    const injected = await acquireVercelOidcSubjectToken(
      async () => "injected-local-token",
    );
    expect(injected).toBe("injected-local-token");
    // Injected path must not call @vercel/oidc.
    expect(getVercelOidcTokenMock).toHaveBeenCalledTimes(1);
  });

  it("transport class surface has only read methods", () => {
    const proto = Fr7WifNativeFirestoreReadTransport.prototype;
    const methods = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== "constructor",
    );
    expect(methods.sort()).toEqual(
      ["count", "getDocument", "query", "queryByCountry"].sort(),
    );
    expect(methods).not.toContain("createDocument");
    expect(methods).not.toContain("updateDocument");
    expect(methods).not.toContain("deleteDocument");
    expect(methods).not.toContain("commit");
    expect(methods).not.toContain("batchWrite");
  });
});
