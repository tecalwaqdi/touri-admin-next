/**
 * Shared WIF-native Firestore READ transport (FR7 + operational Production reads).
 * Uses @google-cloud/firestore-api v1 FirestoreClient + GoogleAuth (WIF AuthClient).
 * Never initializes firebase-admin Firestore. Never exposes write RPCs.
 */

import { FirestoreClient } from "@google-cloud/firestore-api";
import type { GoogleAuth } from "google-auth-library";
import { FINANCE_REPORTING_RO_QUERY_LIMIT } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import {
  isDocumentIdOrderField,
  type FirestoreQueryFilter,
  type FirestoreQueryOrder,
  type FirestoreQueryRequest,
  type FirestoreQueryResult,
} from "@/infrastructure/production/firestore/FirestoreReadClient";

export const FR7_FIRESTORE_DATABASE_ID = "(default)" as const;

/** Hard cap for all WIF-native Production reads (FR7 + operational). */
export const WIF_NATIVE_MAX_READ_LIMIT = 50 as const;

/** Plain document shape — no GAPIC types leak past this module. */
export type Fr7RoTransportDoc = {
  id: string;
  exists: boolean;
  data: Record<string, unknown> | null;
};

type GapicValue = {
  nullValue?: unknown;
  booleanValue?: boolean;
  integerValue?: string | number | { toString(): string };
  doubleValue?: number;
  stringValue?: string;
  timestampValue?:
    | string
    | {
        seconds?: string | number | { toString(): string };
        nanos?: number;
      };
  bytesValue?: string | Uint8Array;
  referenceValue?: string;
  arrayValue?: { values?: GapicValue[] };
  mapValue?: { fields?: Record<string, GapicValue> };
  geoPointValue?: { latitude?: number; longitude?: number };
};

type GapicDocument = {
  name?: string | null;
  fields?: Record<string, GapicValue> | null;
};

/** Narrow read surface — get + runQuery only; no mutation RPCs. */
export type Fr7FirestoreReadRpcClient = {
  getDocument(request: {
    name: string;
  }): Promise<unknown>;
  runQuery(request: {
    parent: string;
    structuredQuery: Record<string, unknown>;
  }): NodeJS.ReadableStream;
};

export type Fr7WifNativeFirestoreReadTransportOptions = {
  projectId: string;
  databaseId?: string;
  /**
   * GoogleAuth wrapping a real WIF AuthClient (IdentityPoolClient).
   * Passed via ClientOptions.auth — gax expects GoogleAuth, not a bare AuthClient.
   */
  auth?: GoogleAuth;
  /** Test injection — skips FirestoreClient construction. */
  rpcClient?: Fr7FirestoreReadRpcClient;
};

function documentsRoot(projectId: string, databaseId: string): string {
  return `projects/${projectId}/databases/${databaseId}/documents`;
}

function documentResourceName(
  projectId: string,
  databaseId: string,
  collection: string,
  documentId: string,
): string {
  return `${documentsRoot(projectId, databaseId)}/${collection}/${documentId}`;
}

function documentIdFromName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.split("/");
  return parts[parts.length - 1] ?? "";
}

function decodeTimestamp(
  ts: NonNullable<GapicValue["timestampValue"]>,
): string {
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toISOString();
  }
  const seconds = Number(ts.seconds?.toString?.() ?? ts.seconds ?? 0);
  const nanos = Number(ts.nanos ?? 0);
  return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
}

function decodeInteger(
  raw: NonNullable<GapicValue["integerValue"]>,
): number | string {
  const asString = typeof raw === "string" ? raw : raw.toString();
  const n = Number(asString);
  if (
    Number.isFinite(n) &&
    Number.isSafeInteger(n) &&
    String(n) === asString.replace(/^\+/, "")
  ) {
    return n;
  }
  return asString;
}

/** Convert Firestore proto Value → plain JS (Admin data()-like). */
export function decodeFirestoreValue(value: GapicValue | null | undefined): unknown {
  if (value == null) return null;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return decodeInteger(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.timestampValue !== undefined) {
    return decodeTimestamp(value.timestampValue);
  }
  if (value.bytesValue !== undefined) return value.bytesValue;
  if (value.referenceValue !== undefined) return value.referenceValue;
  if (value.geoPointValue !== undefined) {
    return {
      latitude: value.geoPointValue.latitude ?? 0,
      longitude: value.geoPointValue.longitude ?? 0,
    };
  }
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values ?? []).map((v) => decodeFirestoreValue(v));
  }
  if (value.mapValue !== undefined) {
    return decodeFirestoreFields(value.mapValue.fields);
  }
  return null;
}

export function decodeFirestoreFields(
  fields: Record<string, GapicValue> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeFirestoreValue(value);
  }
  return out;
}

function unwrapGetDocumentResult(result: unknown): GapicDocument {
  if (Array.isArray(result)) {
    const first = result[0];
    if (first && typeof first === "object") {
      return first as GapicDocument;
    }
    return {};
  }
  if (result && typeof result === "object") {
    return result as GapicDocument;
  }
  return {};
}

/** True when a Firestore/GAPIC error means the document does not exist. */
export function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: number | string;
    status?: number | string;
    details?: string;
    message?: string;
  };
  const code = e.code;
  const status = e.status;
  if (
    code === 5 ||
    code === "5" ||
    code === "NOT_FOUND" ||
    code === 404 ||
    code === "404" ||
    status === 5 ||
    status === "5" ||
    status === "NOT_FOUND" ||
    status === 404 ||
    status === "404"
  ) {
    return true;
  }
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return /NOT_FOUND|No document to update|5 NOT_FOUND|\b404\b/i.test(msg);
}

/**
 * GAPIC REST StructuredQuery.limit is google.protobuf.Int32Value — must be
 * `{ value: n }`, not a bare number (bare number → encode fail → `{cancel}`
 * stub return → stream.on is not a function).
 */
export function structuredQueryLimit(limit: number): { value: number } {
  return { value: limit };
}

function assertReadableStream(
  stream: unknown,
): asserts stream is NodeJS.ReadableStream {
  if (
    !stream ||
    typeof stream !== "object" ||
    typeof (stream as { on?: unknown }).on !== "function"
  ) {
    throw new Error(
      "FR7_GAPIC_RUN_QUERY_STREAM_INVALID: runQuery did not return a Readable stream (StructuredQuery encoding or GAPIC client mismatch)",
    );
  }
}

async function collectRunQueryDocuments(
  stream: NodeJS.ReadableStream,
): Promise<GapicDocument[]> {
  assertReadableStream(stream);
  const docs: GapicDocument[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (resp: { document?: GapicDocument | null }) => {
      if (resp?.document) docs.push(resp.document);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return docs;
}

function wrapFirestoreClientAsReadRpc(
  gapic: FirestoreClient,
): Fr7FirestoreReadRpcClient {
  return {
    getDocument: (request) => gapic.getDocument(request),
    runQuery: (request) => {
      const stream: unknown = gapic.runQuery(request);
      assertReadableStream(stream);
      return stream;
    },
  };
}

/**
 * Read-only FR7 transport. Structurally cannot call write RPCs.
 */
export class Fr7WifNativeFirestoreReadTransport {
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly rpc: Fr7FirestoreReadRpcClient;

  constructor(options: Fr7WifNativeFirestoreReadTransportOptions) {
    this.projectId = options.projectId;
    this.databaseId = options.databaseId ?? FR7_FIRESTORE_DATABASE_ID;
    if (options.rpcClient) {
      this.rpc = options.rpcClient;
    } else {
      // Public ClientOptions.auth path (GoogleAuth wrapping WIF AuthClient).
      const gapic = new FirestoreClient({
        projectId: options.projectId,
        fallback: true,
        ...(options.auth ? { auth: options.auth } : {}),
      });
      this.rpc = wrapFirestoreClientAsReadRpc(gapic);
    }
  }

  async getDocument(
    collection: string,
    documentId: string,
  ): Promise<Fr7RoTransportDoc> {
    const name = documentResourceName(
      this.projectId,
      this.databaseId,
      collection,
      documentId,
    );
    try {
      const raw = unwrapGetDocumentResult(await this.rpc.getDocument({ name }));
      // GAPIC/REST occasionally returns an empty payload instead of NOT_FOUND.
      // A real document always has a resource name.
      if (!raw.name) {
        return { id: documentId, exists: false, data: null };
      }
      return {
        id: documentIdFromName(raw.name) || documentId,
        exists: true,
        data: decodeFirestoreFields(raw.fields),
      };
    } catch (err) {
      if (isNotFoundError(err)) {
        return { id: documentId, exists: false, data: null };
      }
      throw err;
    }
  }

  async queryByCountry(
    collection: string,
    input: { countryId?: string | null; limit: number },
  ): Promise<Fr7RoTransportDoc[]> {
    const limit = Math.min(
      Math.max(1, input.limit),
      FINANCE_REPORTING_RO_QUERY_LIMIT,
      WIF_NATIVE_MAX_READ_LIMIT,
    );
    const filters: FirestoreQueryFilter[] = [];
    if (input.countryId) {
      filters.push({
        field: "countryId",
        op: "==",
        value: input.countryId,
      });
    }
    const result = await this.query({
      collection,
      filters,
      orderBy: [],
      limit,
    });
    return result.docs;
  }

  /**
   * Bounded structured query — equality/range/in/array-contains + orderBy + cursor.
   * Hard-capped at WIF_NATIVE_MAX_READ_LIMIT (50).
   */
  async query(request: FirestoreQueryRequest): Promise<FirestoreQueryResult> {
    const limit = Math.min(
      Math.max(1, request.limit),
      WIF_NATIVE_MAX_READ_LIMIT,
    );
    const orderBy = request.orderBy ?? [];
    const filters = request.filters ?? [];
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: request.collection }],
      limit: structuredQueryLimit(limit),
    };

    const where = buildStructuredWhere(filters);
    if (where) structuredQuery.where = where;

    if (orderBy.length) {
      structuredQuery.orderBy = orderBy.map((o) => ({
        field: {
          fieldPath: isDocumentIdOrderField(o.field) ? "__name__" : o.field,
        },
        direction: o.direction === "desc" ? "DESCENDING" : "ASCENDING",
      }));
    }

    if (request.startAfterCursor) {
      structuredQuery.startAt = await buildStartAfterCursor({
        transport: this,
        projectId: this.projectId,
        databaseId: this.databaseId,
        collection: request.collection,
        cursorId: request.startAfterCursor,
        orderBy,
      });
    }

    const stream = this.rpc.runQuery({
      parent: documentsRoot(this.projectId, this.databaseId),
      structuredQuery,
    });
    const docs = await collectRunQueryDocuments(stream);
    const mapped = docs.slice(0, limit).map((doc) => ({
      id: documentIdFromName(doc.name),
      exists: true as const,
      data: decodeFirestoreFields(doc.fields),
    }));
    const nextCursor =
      mapped.length === limit ? mapped[mapped.length - 1]?.id ?? null : null;
    return { docs: mapped, nextCursor };
  }
}

async function buildStartAfterCursor(input: {
  transport: Fr7WifNativeFirestoreReadTransport;
  projectId: string;
  databaseId: string;
  collection: string;
  cursorId: string;
  orderBy: FirestoreQueryOrder[];
}): Promise<{ values: GapicValue[]; before: boolean }> {
  const { transport, projectId, databaseId, collection, cursorId, orderBy } =
    input;
  const documentIdOnly =
    orderBy.length === 1 && isDocumentIdOrderField(orderBy[0]!.field);
  if (documentIdOnly || orderBy.length === 0) {
    return {
      values: [
        {
          referenceValue: documentResourceName(
            projectId,
            databaseId,
            collection,
            cursorId,
          ),
        },
      ],
      before: false,
    };
  }

  const cursorDoc = await transport.getDocument(collection, cursorId);
  const values: GapicValue[] = [];
  for (const order of orderBy) {
    if (isDocumentIdOrderField(order.field)) {
      values.push({
        referenceValue: documentResourceName(
          projectId,
          databaseId,
          collection,
          cursorId,
        ),
      });
      continue;
    }
    const raw = cursorDoc.data?.[order.field];
    values.push(encodeJsValueToGapic(raw));
  }
  return { values, before: false };
}

const FILTER_OP_MAP: Record<FirestoreQueryFilter["op"], string> = {
  "==": "EQUAL",
  in: "IN",
  ">=": "GREATER_THAN_OR_EQUAL",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  "<": "LESS_THAN",
  "array-contains": "ARRAY_CONTAINS",
};

function encodeJsValueToGapic(value: unknown): GapicValue {
  if (value === null || value === undefined) {
    return { nullValue: "NULL_VALUE" };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return {
      timestampValue: {
        seconds: String(Math.floor(ms / 1000)),
        nanos: (ms % 1000) * 1e6,
      },
    };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: { values: value.map((v) => encodeJsValueToGapic(v)) },
    };
  }
  // Timestamp-like { seconds, nanos } or Admin Timestamp toDate()
  if (typeof value === "object") {
    const maybe = value as {
      toDate?: () => Date;
      seconds?: string | number;
      nanos?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    if (typeof maybe.toDate === "function") {
      return encodeJsValueToGapic(maybe.toDate());
    }
    if (maybe.seconds != null || maybe._seconds != null) {
      return {
        timestampValue: {
          seconds: String(maybe.seconds ?? maybe._seconds ?? 0),
          nanos: Number(maybe.nanos ?? maybe._nanoseconds ?? 0),
        },
      };
    }
  }
  return { stringValue: String(value) };
}

function buildFieldFilter(filter: FirestoreQueryFilter): Record<string, unknown> {
  if (filter.op === "in") {
    const arr = Array.isArray(filter.value) ? filter.value : [filter.value];
    return {
      fieldFilter: {
        field: { fieldPath: filter.field },
        op: "IN",
        value: {
          arrayValue: { values: arr.map((v) => encodeJsValueToGapic(v)) },
        },
      },
    };
  }
  return {
    fieldFilter: {
      field: { fieldPath: filter.field },
      op: FILTER_OP_MAP[filter.op],
      value: encodeJsValueToGapic(filter.value),
    },
  };
}

function buildStructuredWhere(
  filters: FirestoreQueryFilter[],
): Record<string, unknown> | null {
  if (!filters.length) return null;
  if (filters.length === 1) return buildFieldFilter(filters[0]!);
  return {
    compositeFilter: {
      op: "AND",
      filters: filters.map((f) => buildFieldFilter(f)),
    },
  };
}

/** Alias — shared transport is the canonical WIF-native read layer. */
export { Fr7WifNativeFirestoreReadTransport as WifNativeFirestoreReadTransport };
