/**
 * Geography live-read regression — landmarks + data-quality preflight blockers.
 * No Production network calls. No write-gate arming.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";

vi.mock("@/infrastructure/production/mappers/LegacyProductionMappers", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/infrastructure/production/mappers/LegacyProductionMappers")
    >();
  return {
    ...actual,
    mapLandmarkFromLegacyDoc: vi.fn((input: { documentId: string; data: Record<string, unknown> }) => {
      if (input.documentId === "lm_toxic") {
        throw new Error("boom_mapper");
      }
      return actual.mapLandmarkFromLegacyDoc(input);
    }),
  };
});

import {
  Fr7WifNativeFirestoreReadTransport,
  WIF_NATIVE_MAX_READ_LIMIT,
  WIF_NATIVE_QUERY_STREAM_TIMEOUT_MS,
  WifNativeQueryStreamTimeoutError,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { FirebaseProductionGeographyReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import { mapProductionReadError } from "@/infrastructure/http/shadowApi";
import { PRODUCTION_READ_COLLECTION_ALLOWLIST } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { OPERATIONAL_LIVE_READ_RESOURCES } from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { DEFAULT_P0_WRITE_FLAGS_FALSE } from "@/application/controlled-writes/P0WriteGates";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function ctx(): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "geo-regression",
    permissions: ["geography:read"],
    requestId: "req-geo-reg",
    correlationId: "corr-geo-reg",
  };
}

function hangingStream(): NodeJS.ReadableStream {
  // Never emits end/error — reproduces the live hang that blocked preflight.
  return new EventEmitter() as unknown as NodeJS.ReadableStream;
}

describe("geography live-read regression (landmarks + data-quality)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("live-production repository contract: landmarks query mkan via allowlisted WIF path", () => {
    expect(PRODUCTION_READ_COLLECTION_ALLOWLIST).toContain("mkan");
    expect(OPERATIONAL_LIVE_READ_RESOURCES).toContain("landmarks");
    const repo = src(
      "src/infrastructure/production/repositories/FirebaseProductionGeographyReadRepository.ts",
    );
    expect(repo).toMatch(/collection:\s*"mkan"/);
    expect(repo).toMatch(/orderBy:\s*\[\s*\{\s*field:\s*"naim"/);
    expect(repo).not.toMatch(/FakeFirestoreReadClient/);
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/createWifNativeFirestoreRead/);
    expect(runtime).toMatch(/No synthetic fallback/);
  });

  it("malformed landmark record isolation: mapper throw does not fail the page", async () => {
    const client = new FakeFirestoreReadClient();
    const good = {
      id: "lm_sa_riyadh_ok",
      data: {
        naim: "برج المملكة",
        Rev_dolh: "countries/saudi_arabia",
        id_vill: "villages/city_sa_riyadh",
        acctev: true,
      },
    };
    const toxic = {
      id: "lm_toxic",
      data: {
        naim: "toxic",
        Rev_dolh: "countries/saudi_arabia",
        id_vill: "villages/city_sa_riyadh",
      },
    };
    client.seed("mkan", [good, toxic]);

    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(ctx(), {}, { limit: 20 });
    expect(page.items.length).toBe(2);
    const toxicItem = page.items.find(
      (e) => e.data.sourceDocumentId === "lm_toxic",
    );
    expect(toxicItem?.data.mappingStatus).toBe("malformed");
    expect(
      page.items.some((e) => e.data.sourceDocumentId === "lm_sa_riyadh_ok"),
    ).toBe(true);
  });

  it("source unavailable semantics: hung runQuery stream → DEADLINE_EXCEEDED → canonical 503", async () => {
    vi.useFakeTimers();
    const rpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => {
        throw Object.assign(new Error("5 NOT_FOUND"), { code: 5 });
      },
      runQuery: () => hangingStream(),
      runAggregationQuery: () => Readable.from([]),
    };
    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "tutorial-multi-language-70gx4j",
      rpcClient: rpc,
    });
    const pending = transport.query({
      collection: "mkan",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit: WIF_NATIVE_MAX_READ_LIMIT,
    });
    const expectation = expect(pending).rejects.toBeInstanceOf(
      WifNativeQueryStreamTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(WIF_NATIVE_QUERY_STREAM_TIMEOUT_MS + 50);
    await expectation;

    const timeoutErr = new WifNativeQueryStreamTimeoutError("test");
    const res = mapProductionReadError(timeoutErr);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toMatch(/DEADLINE_EXCEEDED|PRODUCTION_DATA_UNAVAILABLE/);
  });

  it("empty valid result semantics: empty mkan page returns items=[] without synthetic fallback", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("mkan", []);
    const geo = new FirebaseProductionGeographyReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: new Set(["landmarks"]),
    });
    const page = await geo.listLandmarks(ctx(), {}, { limit: 20 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("DQ dependency behavior: Promise.allSettled + source failure maps to unavailable (no bare 500)", () => {
    const api = src(
      "src/application/production-read/ProductionGeographyApiReads.ts",
    );
    expect(api).toMatch(/Promise\.allSettled/);
    expect(api).toMatch(/PRODUCTION_DATA_UNAVAILABLE/);
    expect(api).toMatch(/listLandmarks/);
    expect(api).toMatch(/listCountries/);
    expect(api).toMatch(/listCities/);
    // Must not swallow source failures into fake empty DQ.
    expect(api).not.toMatch(/items:\s*\[\]\s*,\s*synthetic:\s*true/);
  });

  it("no fixture fallback on geography production API routes", () => {
    const landmarksRoute = src("src/app/api/geography/landmarks/route.ts");
    const dqRoute = src("src/app/api/geography/data-quality/route.ts");
    expect(landmarksRoute).toMatch(/listProductionLandmarksApi/);
    expect(dqRoute).toMatch(/getProductionGeographyDqSummaryApi/);
    expect(landmarksRoute).toMatch(/maxDuration\s*=\s*60/);
    expect(dqRoute).toMatch(/maxDuration\s*=\s*60/);
    expect(landmarksRoute).not.toMatch(/FakeFirestore|fixture|syntheticSource/);
    expect(dqRoute).not.toMatch(/FakeFirestore|fixture|syntheticSource/);
  });

  it("no write gate changes: production write defaults remain false", () => {
    expect(DEFAULT_P0_WRITE_FLAGS_FALSE.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(
      false,
    );
    expect(DEFAULT_P0_WRITE_FLAGS_FALSE.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(DEFAULT_P0_WRITE_FLAGS_FALSE.GEOGRAPHY_WRITE_ENABLED).toBe(false);
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const gates = src("src/application/controlled-writes/P0WriteGates.ts");
    expect(gates).toMatch(/PRODUCTION_WRITE_ENABLED/);
    expect(gates).not.toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED:\s*true/);
  });

  it("healthy runQuery stream still resolves documents", async () => {
    const rpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => {
        throw Object.assign(new Error("5 NOT_FOUND"), { code: 5 });
      },
      runQuery: () =>
        Readable.from([
          {
            document: {
              name: "projects/p/databases/(default)/documents/mkan/lm1",
              fields: { naim: { stringValue: "A" } },
            },
          },
        ]),
      runAggregationQuery: () => Readable.from([]),
    };
    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "tutorial-multi-language-70gx4j",
      rpcClient: rpc,
    });
    const page = await transport.query({
      collection: "mkan",
      filters: [],
      orderBy: [{ field: "naim", direction: "asc" }],
      limit: 10,
    });
    expect(page.docs).toHaveLength(1);
    expect(page.docs[0]?.id).toBe("lm1");
  });
});
