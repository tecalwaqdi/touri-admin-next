/**
 * Production Read Unification — tests 1–15.
 * Proves WIF-native operational reads, fail-closed surfaces, no Admin ADC API path,
 * source labels, RBAC/scope preserved, FR7 regression surface, writes remain zero.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";

vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(),
}));

import { WifNativeFirestoreReadClient } from "@/infrastructure/production/firestore/WifNativeFirestoreReadClient";
import {
  Fr7WifNativeFirestoreReadTransport,
  WIF_NATIVE_MAX_READ_LIMIT,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { PHASE_4B_LIVE_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import {
  resolveAdminDataSourceLabel,
  assertNoProductionSyntheticFallback,
  looksLikePilotOrTestDocumentId,
} from "@/domain/production-read/SourceLabel";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function mockRpc(): Fr7FirestoreReadRpcClient {
  return {
    getDocument: async ({ name }) => [{ name, fields: {} }],
    runQuery: () => Readable.from([]),
  };
}

describe("Production Read Unification (tests 1–15)", () => {
  const keys = [
    "APP_ENV",
    "PRODUCTION_READ_ENABLED",
    "PRODUCTION_READ_MODE",
    "LIVE_SHADOW_ALLOWED_RESOURCES",
    "EXPECTED_PROJECT_ID",
    "GCP_WORKLOAD_IDENTITY_PROVIDER",
    "GCP_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("1–5: Production Trips/Drivers/Customers/Agents/Geography use WIF-native transport", () => {
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    const apiReads = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    const trips = src("src/app/api/trips/route.ts");
    const drivers = src("src/app/api/drivers/route.ts");
    const customers = src("src/app/api/customers/route.ts");
    const agents = src("src/app/api/agents/route.ts");
    const geography = src("src/app/api/geography/countries/route.ts");

    expect(runtime).toMatch(/createWifNativeFirestoreRead/);
    expect(runtime).toMatch(/requireWif/);
    expect(runtime).not.toMatch(/FirebaseAdminFirestoreReadClient/);
    expect(apiReads).toMatch(/repos\.trips\.list/);
    expect(apiReads).toMatch(/repos\.drivers\.list/);
    expect(apiReads).toMatch(/repos\.customers\.listSummary/);
    expect(apiReads).toMatch(/repos\.agents\.list/);
    expect(
      src("src/application/production-read/ProductionGeographyApiReads.ts"),
    ).toMatch(/repos\.geography\.listCountries/);

    for (const route of [trips, drivers, customers, agents, geography]) {
      expect(route).toMatch(/listProduction|ProductionOperational/);
      expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
      expect(route).not.toMatch(/FirebaseAdminFirestoreReadClient/);
      expect(route).not.toMatch(/applicationDefault\s*\(/);
    }

    const client = new WifNativeFirestoreReadClient({
      projectId: "tutorial-multi-language-70gx4j",
      rpcClient: mockRpc(),
    });
    expect(client.getTransportForTests()).toBeInstanceOf(
      Fr7WifNativeFirestoreReadTransport,
    );
  });

  it("6: Production dashboard has zero synthetic fallback", () => {
    const dashRoute = src("src/app/api/dashboard/route.ts");
    expect(dashRoute).toMatch(/getProductionDashboardMetrics/);
    expect(dashRoute).toMatch(/Fail closed/);
    expect(dashRoute).toMatch(/PRODUCTION_DATA_UNAVAILABLE|metricsAvailability: "unavailable"/);
    // Armed Production branch must not fall back to in-memory dashboard service
    const afterArmed = dashRoute.split("if (productionReadPathActive())")[1] ?? "";
    const armedBlock = afterArmed.split("const env = getEnv()")[0] ?? afterArmed;
    expect(armedBlock).not.toMatch(/getDashboardService/);
  });

  it("7: Production Users has zero fixture fallback", () => {
    const users = src("src/app/api/users/route.ts");
    expect(users).toMatch(/listProductionAdminUsers/);
    expect(users).toMatch(/synthetic:\s*false/);
    expect(users).toMatch(/PRODUCTION_USER_SOURCE_NOT_CONFIGURED/);
    // Fixture list must not run while Production armed shadow
    expect(users).toMatch(/APP_ENV === "production"/);
    expect(users).toMatch(/productionReadPathActive\(\)/);
    const armed =
      users
        .split("if (productionReadPathActive())")[1]
        ?.split('if (env.APP_ENV === "production"')[0] ?? "";
    expect(armed).toMatch(/listProductionAdminUsers/);
    expect(armed).not.toMatch(/getRepositories\(\)\.users/);
  });

  it("8: Production Audit has zero fixture fallback", () => {
    const audit = src("src/app/api/audit/route.ts");
    expect(audit).toMatch(/listProductionAdminAudit/);
    expect(audit).toMatch(/synthetic:\s*false/);
    expect(audit).toMatch(/PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED/);
    const armed =
      audit
        .split("if (productionReadPathActive())")[1]
        ?.split('if (env.APP_ENV === "production"')[0] ?? "";
    expect(armed).toMatch(/listProductionAdminAudit/);
    expect(armed).not.toMatch(/getRepositories\(\)\.audit/);
  });

  it("9: No visible Production page silently uses mock repositories when armed", () => {
    for (const route of [
      "src/app/api/trips/route.ts",
      "src/app/api/drivers/route.ts",
      "src/app/api/customers/route.ts",
      "src/app/api/agents/route.ts",
      "src/app/api/geography/countries/route.ts",
      "src/app/api/dashboard/route.ts",
    ]) {
      const text = src(route);
      const prodBranch = text.split("productionReadPathActive()")[1] ?? "";
      const untilElse = prodBranch.split(/^\s*try \{/m)[0] ?? prodBranch;
      expect(untilElse).not.toMatch(/getRepositories\(\)/);
    }
  });

  it("10: No Firebase Admin applicationDefault() in active Production browser/API read paths", () => {
    const apiDir = join(process.cwd(), "src/app/api");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) out.push(...walk(p));
        else if (ent.name.endsWith(".ts")) out.push(p);
      }
      return out;
    };
    for (const file of walk(apiDir)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/applicationDefault\s*\(/);
      expect(text).not.toMatch(/FirebaseAdminFirestoreReadClient/);
    }
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).not.toMatch(/applicationDefault\s*\(/);
    expect(runtime).not.toMatch(/FirebaseAdminFirestoreReadClient/);
  });

  it("11: WIF shared transport exposes zero write RPCs", () => {
    const transport = src(
      "src/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport.ts",
    );
    const client = src(
      "src/infrastructure/production/firestore/WifNativeFirestoreReadClient.ts",
    );
    for (const text of [transport, client]) {
      expect(text).not.toMatch(
        /\b(createDocument|updateDocument|deleteDocument|batchWrite|commit)\s*\(/,
      );
      expect(text).not.toMatch(/from ["']firebase-admin["']/);
    }
    const proto = Fr7WifNativeFirestoreReadTransport.prototype;
    expect(Object.getOwnPropertyNames(proto).sort()).toEqual(
      expect.arrayContaining(["getDocument", "queryByCountry", "query"]),
    );
    expect(Object.getOwnPropertyNames(proto)).not.toContain("createDocument");
    expect(Object.getOwnPropertyNames(proto)).not.toContain("updateDocument");
    expect(Object.getOwnPropertyNames(proto)).not.toContain("deleteDocument");
    expect(Object.getOwnPropertyNames(proto)).not.toContain("batchWrite");
  });

  it("12: Page/read limits remain <=50", async () => {
    expect(WIF_NATIVE_MAX_READ_LIMIT).toBe(50);
    const client = new WifNativeFirestoreReadClient({
      projectId: "tutorial-multi-language-70gx4j",
      rpcClient: mockRpc(),
    });
    await expect(
      client.query({ collection: "countries", limit: 51, filters: [] }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY_LIMIT" });
    const ok = await client.query({
      collection: "countries",
      limit: 50,
      filters: [],
    });
    expect(ok.docs.length).toBeLessThanOrEqual(50);
  });

  it("13: RBAC/scope preserved via resolveApiActor + ProductionReadContext", () => {
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/productionReadContextFromActor/);
    expect(runtime).toMatch(/serverScopeFilter/);
    expect(runtime).toMatch(/actorUid/);
    const trips = src("src/app/api/trips/route.ts");
    expect(trips).toMatch(/resolveApiActor/);
    expect(trips).toMatch(/requirePermission/);
    const repos = createProductionReadRepositories({
      client: new FakeFirestoreReadClient(),
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(PHASE_4B_LIVE_RESOURCES),
    });
    expect(repos.trips).toBeTruthy();
    expect(repos.drivers).toBeTruthy();
    expect(repos.agents).toBeTruthy();
    expect(repos.customers).toBeTruthy();
    expect(repos.geography).toBeTruthy();
  });

  it("14: Finance FR7 golden / WIF surface unchanged (no calc rewrite)", () => {
    const port = src(
      "src/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort.ts",
    );
    expect(port).toMatch(/Fr7WifNativeFirestoreReadTransport|createWifNativeFirestoreRead/);
    expect(port).not.toMatch(/from ["']firebase-admin["']/);
    expect(port).not.toMatch(/applicationDefault\s*\(/);
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    expect(aggregator).toMatch(/buildDashboardSummary/);
  });

  it("15: Production writes remain zero", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const envExample = src(".env.production.example");
    expect(envExample).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/FINANCE_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/DRIVER_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/AGENT_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/CUSTOMER_WRITE_ENABLED=false/);
  });

  it("F: source label truthful — Production pilot IDs are not synthetic", () => {
    expect(looksLikePilotOrTestDocumentId("test_adminnext_finance_fr5_x")).toBe(
      true,
    );
    const prodPilot = resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: ["test_adminnext_finance_fr5_settlement_payment_001"],
    });
    expect(prodPilot.synthetic).toBe(false);
    expect(prodPilot.label).toBe("production_pilot");

    const pure = resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: ["order_real_001"],
    });
    expect(pure.label).toBe("production");
    expect(pure.synthetic).toBe(false);

    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
  });
});
