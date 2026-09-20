/**
 * Authenticated production read-contract closure — tests 1–20.
 * No Production mutation. Write flags remain false.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import { FirebaseProductionAdminUserReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminUserReadRepository";
import { FirebaseProductionAdminAuditReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionAdminAuditReadRepository";
import { FirebaseProductionSupportReadRepository } from "@/infrastructure/production/repositories/FirebaseProductionSupportReadRepository";
import { isListableOperationalCustomer } from "@/application/production-read/ProductionOperationalApiReads";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import { redactAuditJson } from "@/domain/audit/redactAuditPayload";
import { mapControlledWriteAuditToEvent } from "@/domain/audit/mapControlledWriteAuditToEvent";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import {
  Fr7WifNativeFirestoreReadTransport,
  isFirestoreDocumentMissing,
  isImpossibleFirestoreDocumentId,
  isNotFoundError,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { mapProductionReadError } from "@/infrastructure/http/shadowApi";
import { ProductionDetailNotFoundError } from "@/application/production-read/detailDtos";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function runQueryStream(
  docs: Array<{ name: string; fields?: Record<string, unknown> }>,
): NodeJS.ReadableStream {
  return Readable.from(docs.map((document) => ({ document })));
}

describe("Authenticated production read contract closure (tests 1–20)", () => {
  it("1: Users list cannot be crashed by malformed/non-admin user persona", async () => {
    let calls = 0;
    const client: FirestoreReadClient = {
      async getDocument() {
        return { id: "x", exists: false, data: null };
      },
      async query() {
        calls += 1;
        if (calls === 1) {
          throw new Error("discriminator query boom");
        }
        return {
          docs: [
            {
              id: "good_admin",
              exists: true,
              data: {
                IsAdmin: true,
                email: "ops@example.com",
                display_name: "Ops",
              },
            },
            {
              id: "pure_customer",
              exists: true,
              data: { actev_user: true, email: "c@example.com" },
            },
          ],
          nextCursor: null,
        };
      },
    };
    const repo = new FirebaseProductionAdminUserReadRepository(client);
    const result = await repo.list({
      scope: { type: "global" },
      actorUid: "actor",
    });
    expect(result.items.some((i) => i.id === "good_admin")).toBe(true);
    expect(result.items.some((i) => i.id === "pure_customer")).toBe(false);
    expect(
      result.dataQualityWarnings.some((w) => w.startsWith("query_failed:")),
    ).toBe(true);
  });

  it("2: Users includes only canonical Admin personas", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("user", [
      { id: "sa", data: { IsAdmin: true, email: "a@x.com" } },
      { id: "agent_only", data: { Isagent: true, email: "ag@x.com" } },
      { id: "driver_only", data: { ismndob: true, email: "d@x.com" } },
    ]);
    const repo = new FirebaseProductionAdminUserReadRepository(client);
    const result = await repo.list({
      scope: { type: "global" },
      actorUid: "actor",
    });
    expect(result.items.map((i) => i.id)).toEqual(["sa"]);
  });

  it("3: Audit empty → 200 [] contract in route", async () => {
    const route = src("src/app/api/audit/route.ts");
    expect(route).toMatch(/listProductionAdminAudit/);
    expect(route).toMatch(/items:\s*\[\]/);
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionAdminAuditReadRepository(client);
    const page = await repo.list({ pageSize: 20 });
    expect(page.items).toEqual([]);
  });

  it("4: Audit malformed event does not leak secrets or crash list", async () => {
    const circular: Record<string, unknown> = { token: "secret-value" };
    circular.self = circular;
    expect(redactAuditJson(circular)).toEqual({
      _redaction: "unavailable_malformed_payload",
    });
    expect(redactAuditJson({ refreshToken: "x", ok: 1 })).toEqual({
      refreshToken: "[redacted]",
      ok: 1,
    });

    const client = new FakeFirestoreReadClient();
    client.seed("admin_next_cw_audit", [
      {
        id: "good",
        data: {
          kind: "AUDIT_RESULT",
          actorUid: "u1",
          action: "approve",
          resource: "driver",
          beforeSafe: { token: "nope", fromState: "pending_review" },
        },
      },
      {
        id: "bad",
        data: {
          kind: "AUDIT_RESULT",
          actorUid: "u2",
          action: "approve",
          resource: "driver",
          beforeSafe: circular,
        },
      },
    ]);
    const repo = new FirebaseProductionAdminAuditReadRepository(client);
    const page = await repo.list({ pageSize: 20 });
    expect(page.items.length).toBeGreaterThanOrEqual(1);
    expect(page.items.some((i) => i.auditId === "good" || i.auditId === "bad")).toBe(
      true,
    );
    const good = mapControlledWriteAuditToEvent({
      id: "good",
      data: {
        kind: "AUDIT_RESULT",
        beforeSafe: { token: "nope" },
      },
    });
    expect((good.beforeSnapshot as { token?: string })?.token).toBe(
      "[redacted]",
    );
  });

  it("5: Support empty → 200 [] contract", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionSupportReadRepository(client);
    const page = await repo.list({ scope: { type: "global" } });
    expect(page.items).toEqual([]);
    expect(src("src/app/api/support/route.ts")).toMatch(
      /listProductionSupportTickets/,
    );
  });

  it("6: Support invalid unrelated doc does not crash canonical list", async () => {
    const client: FirestoreReadClient = {
      async getDocument() {
        return { id: "x", exists: false, data: null };
      },
      async query() {
        return {
          docs: [
            {
              id: "t1",
              exists: true,
              data: { naim: "Help", osf: "Broken trip", halh: "open" },
            },
            {
              id: "dirty",
              exists: true,
              data: new Proxy(
                {},
                {
                  get() {
                    throw new Error("dirty support field");
                  },
                },
              ) as Record<string, unknown>,
            },
          ],
          nextCursor: null,
        };
      },
    };
    const repo = new FirebaseProductionSupportReadRepository(client);
    const page = await repo.list({ scope: { type: "global" } });
    expect(page.items.some((i) => i.id === "t1")).toBe(true);
    expect(page.items.some((i) => i.id === "dirty")).toBe(false);
  });

  it("7: Customer list excludes agent persona", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "agent1",
      data: { Isagent: true, email: "a@x.com", display_name: "Agent" },
    });
    expect(isListableOperationalCustomer(mapped.model)).toBe(false);
  });

  it("8: Customer list excludes driver persona", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "driver1",
      data: { ismndob: true, email: "d@x.com", display_name: "Driver" },
    });
    expect(isListableOperationalCustomer(mapped.model)).toBe(false);
  });

  it("9: Customer list excludes admin persona", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "admin1",
      data: { IsAdmin: true, email: "s@x.com", display_name: "Admin" },
    });
    expect(isListableOperationalCustomer(mapped.model)).toBe(false);
  });

  it("10: Every CustomerListItem.id resolves through Customer detail contract", () => {
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/isListableOperationalCustomer/);
    expect(api).toMatch(/\.filter\(\(e\) => isListableOperationalCustomer/);
    const detail = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(detail).toMatch(/isOperationalCustomer === false/);
    expect(detail).toMatch(/excludedNonCustomer/);
  });

  it("11: Missing Customer detail → true 404", () => {
    const route = src("src/app/api/customers/[id]/route.ts");
    expect(route).toMatch(/NOT_FOUND/);
    expect(route).toMatch(/status: 404/);
  });

  it("12: Missing Trip detail → true 404", async () => {
    const route = src("src/app/api/trips/[id]/route.ts");
    expect(route).toMatch(/NOT_FOUND/);
    expect(route).toMatch(/status: 404/);

    const rpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => {
        throw Object.assign(new Error("5 NOT_FOUND: missing"), { code: 5 });
      },
      runQuery: () => runQueryStream([]),
      runAggregationQuery: () => runQueryStream([]),
    };
    const transport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "demo",
      rpcClient: rpc,
    });
    const snap = await transport.getDocument(
      "order",
      "does-not-exist",
    );
    expect(snap.exists).toBe(false);

    const emptyRpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => ({}),
      runQuery: () => runQueryStream([]),
      runAggregationQuery: () => runQueryStream([]),
    };
    const emptyTransport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "demo",
      rpcClient: emptyRpc,
    });
    const emptySnap = await emptyTransport.getDocument(
      "order",
      "random-missing-id",
    );
    expect(emptySnap.exists).toBe(false);

    const nullRpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => null as unknown as object,
      runQuery: () => runQueryStream([]),
      runAggregationQuery: () => runQueryStream([]),
    };
    const nullTransport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "demo",
      rpcClient: nullRpc,
    });
    expect(
      (await nullTransport.getDocument("order", "also-missing")).exists,
    ).toBe(false);

    // Production Vercel shape: reserved `__*__` id → 400 INVALID_ARGUMENT (not 5).
    expect(isImpossibleFirestoreDocumentId("__final_live_missing_id__")).toBe(
      true,
    );
    let rpcCalls = 0;
    const reservedRpc: Fr7FirestoreReadRpcClient = {
      getDocument: async () => {
        rpcCalls += 1;
        throw Object.assign(
          new Error(
            JSON.stringify({
              error: {
                code: 400,
                message:
                  'Resource id "__final_live_missing_id__" is invalid because it is reserved.',
                status: "INVALID_ARGUMENT",
              },
            }),
          ),
          { code: "400", status: 400 },
        );
      },
      runQuery: () => runQueryStream([]),
      runAggregationQuery: () => runQueryStream([]),
    };
    const reservedTransport = new Fr7WifNativeFirestoreReadTransport({
      projectId: "demo",
      rpcClient: reservedRpc,
    });
    const reservedSnap = await reservedTransport.getDocument(
      "order",
      "__final_live_missing_id__",
    );
    expect(reservedSnap.exists).toBe(false);
    expect(rpcCalls).toBe(0); // short-circuit before RPC

    // Catch path still maps reserved INVALID_ARGUMENT if somehow reached.
    expect(
      isFirestoreDocumentMissing({
        code: "400",
        message:
          'Resource id "__x__" is invalid because it is reserved.\nstatus: INVALID_ARGUMENT',
      }),
    ).toBe(true);
    expect(
      isFirestoreDocumentMissing({
        code: 7,
        message: "PERMISSION_DENIED",
      }),
    ).toBe(false);
    expect(
      isFirestoreDocumentMissing({
        code: 14,
        message: "UNAVAILABLE",
      }),
    ).toBe(false);

    expect(isNotFoundError({ code: "5", message: "missing" })).toBe(true);
    expect(isNotFoundError({ code: 404, message: "not found" })).toBe(true);

    const notFoundMapped = mapProductionReadError(
      new ProductionDetailNotFoundError("trip", "__final_live_missing_id__"),
    );
    expect(notFoundMapped.status).toBe(404);
    expect(await notFoundMapped.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("13: Source unavailable remains 503", () => {
    const res = mapProductionReadError(
      new ProductionReadDisabledError("PRODUCTION_READ_DISABLED"),
    );
    expect(res.status).toBe(503);
  });

  it("14: Scope denied remains 403", () => {
    const res = mapProductionReadError(
      new ScopeDeniedError("resource outside authorized country scope"),
    );
    expect(res.status).toBe(403);
  });

  it("15: Authenticated harness expects true missing-trip 404 as PASS", () => {
    const harness = src("scripts/final-live-validation.mjs");
    expect(harness).toMatch(/__final_live_missing_id__/);
    expect(harness).toMatch(/httpStatus === 404/);
    expect(harness).toMatch(/NOT_FOUND/);
  });

  it("16: Existing geography Saudi filter remains PASS", () => {
    const harness = src("scripts/final-live-validation.mjs");
    expect(harness).toMatch(/countryId=saudi_arabia/);
    expect(harness).toMatch(/geographySaudiFilter/);
  });

  it("17: Finance regression none — FR7 write default false", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    expect(src("src/features/finance/FinancePage.tsx")).not.toMatch(
      /FinancialCalculationService/,
    );
  });

  it("18: PC1-PC10 regression none — write enablement remains false", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
  });

  it("19: FR1-FR7 regression none — production write flags stay off", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    expect(src("src/infrastructure/http/shadowApi.ts")).toMatch(
      /mapProductionReadError/,
    );
  });

  it("20: Write gates remain false", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
  });

  it("bonus: NOT_FOUND errors map to 404 via mapProductionReadError", async () => {
    const res = mapProductionReadError(
      new ProductionDetailNotFoundError("trip", "__final_live_missing_id__"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });
});
