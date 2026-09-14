/**
 * FR7-only WIF-native Firestore READ transport.
 * Uses @google-cloud/firestore-api v1 FirestoreClient + GoogleAuth (WIF AuthClient).
 * Never initializes firebase-admin Firestore. Never exposes write RPCs.
 */

import { FirestoreClient } from "@google-cloud/firestore-api";
import type { GoogleAuth } from "google-auth-library";
import { FINANCE_REPORTING_RO_QUERY_LIMIT } from "@/adapters/finance/reporting/FinanceReportingSourcePorts";

export const FR7_FIRESTORE_DATABASE_ID = "(default)" as const;

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

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number | string; details?: string; message?: string };
  if (e.code === 5 || e.code === "NOT_FOUND" || e.code === 404) return true;
  const msg = `${e.message ?? ""} ${e.details ?? ""}`;
  return /NOT_FOUND|No document to update|5 NOT_FOUND/i.test(msg);
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
    );
    const structuredQuery: Record<string, unknown> = {
      from: [{ collectionId: collection }],
      limit: structuredQueryLimit(limit),
    };
    if (input.countryId) {
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: "countryId" },
          op: "EQUAL",
          value: { stringValue: input.countryId },
        },
      };
    }
    const stream = this.rpc.runQuery({
      parent: documentsRoot(this.projectId, this.databaseId),
      structuredQuery,
    });
    const docs = await collectRunQueryDocuments(stream);
    return docs.slice(0, limit).map((doc) => ({
      id: documentIdFromName(doc.name),
      exists: true,
      data: decodeFirestoreFields(doc.fields),
    }));
  }
}
