/**
 * Production Firestore write port — allowlisted field patches only.
 * WIF REST (not firebase-admin Firestore credential). Injectable Fake for tests.
 * Never uses shadow-reader. Never SA JSON / ADC.
 */

import {
  createVercelOidcWifFirebaseCredential,
  type FirebaseAdminAccessTokenCredential,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import {
  PRODUCTION_PROJECT_ID,
  resolveWritePrincipal,
  type WritePrincipalKey,
} from "@/infrastructure/production/writes/ProductionWritePrincipals";

export type ProductionWriteDocSnap = {
  exists: boolean;
  id: string;
  data: Record<string, unknown> | null;
  updateTime: string | null;
};

export type ProductionFirestoreWritePort = {
  readonly kind: "fake_production_firestore_write" | "wif_rest_production_firestore_write";
  getDocument(collection: string, documentId: string): Promise<ProductionWriteDocSnap>;
  createDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
  ): Promise<ProductionWriteDocSnap>;
  updateDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
    opts?: { expectedUpdateTime?: string | null; allowCreate?: boolean },
  ): Promise<ProductionWriteDocSnap>;
  queryEqual(
    collection: string,
    field: string,
    value: string | boolean | number,
    limit?: number,
  ): Promise<ProductionWriteDocSnap[]>;
};

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // DocumentReference shorthand used by geography/identity writers: { path: "countries/x" }
    const keys = Object.keys(obj);
    if (
      keys.length === 1 &&
      keys[0] === "path" &&
      typeof obj.path === "string" &&
      /^[A-Za-z0-9_]+\/[A-Za-z0-9_\-]+$/.test(obj.path.trim())
    ) {
      return {
        referenceValue: `projects/${PRODUCTION_PROJECT_ID}/databases/(default)/documents/${obj.path.trim()}`,
      };
    }
    // GeoPoint shorthand: { latitude, longitude }
    if (
      typeof obj.latitude === "number" &&
      typeof obj.longitude === "number" &&
      Number.isFinite(obj.latitude) &&
      Number.isFinite(obj.longitude) &&
      keys.every((k) => k === "latitude" || k === "longitude")
    ) {
      return {
        geoPointValue: { latitude: obj.latitude, longitude: obj.longitude },
      };
    }
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

/** Decode Firestore REST field values — including DocumentReference resource names. */
export function decodeFirestoreRestValue(
  raw: Record<string, unknown> | undefined,
): unknown {
  if (!raw) return null;
  if ("nullValue" in raw) return null;
  if ("booleanValue" in raw) return raw.booleanValue;
  if ("integerValue" in raw) return Number(raw.integerValue);
  if ("doubleValue" in raw) return raw.doubleValue;
  if ("stringValue" in raw) return raw.stringValue;
  if ("timestampValue" in raw) return raw.timestampValue;
  // Legacy country/agent refs arrive as referenceValue; dropping them caused
  // SCOPE_DENIED "Agent countryId missing" despite detail reads showing country.
  if ("referenceValue" in raw && typeof raw.referenceValue === "string") {
    return raw.referenceValue;
  }
  if ("geoPointValue" in raw && typeof raw.geoPointValue === "object" && raw.geoPointValue) {
    const g = raw.geoPointValue as { latitude?: number; longitude?: number };
    return {
      latitude: typeof g.latitude === "number" ? g.latitude : null,
      longitude: typeof g.longitude === "number" ? g.longitude : null,
    };
  }
  if ("arrayValue" in raw) {
    const values = (raw.arrayValue as { values?: Record<string, unknown>[] })?.values ?? [];
    return values.map(decodeFirestoreRestValue);
  }
  if ("mapValue" in raw) {
    const fields = (raw.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreRestValue(v);
    return out;
  }
  return null;
}

function decodeValue(raw: Record<string, unknown> | undefined): unknown {
  return decodeFirestoreRestValue(raw);
}

function decodeDoc(id: string, body: {
  fields?: Record<string, Record<string, unknown>>;
  updateTime?: string;
  name?: string;
} | null): ProductionWriteDocSnap {
  if (!body) return { exists: false, id, data: null, updateTime: null };
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body.fields ?? {})) {
    data[k] = decodeValue(v);
  }
  return {
    exists: true,
    id,
    data,
    updateTime: body.updateTime ?? null,
  };
}

/** In-memory Fake for unit/integration — never network. */
export class FakeProductionFirestoreWritePort implements ProductionFirestoreWritePort {
  readonly kind = "fake_production_firestore_write" as const;
  private readonly docs = new Map<string, { data: Record<string, unknown>; updateTime: string }>();
  readonly mutations: Array<{ op: string; collection: string; id: string }> = [];

  private key(collection: string, id: string): string {
    return `${collection}/${id}`;
  }

  seed(collection: string, id: string, data: Record<string, unknown>, updateTime = `ut_${id}_0`): void {
    this.docs.set(this.key(collection, id), { data: { ...data }, updateTime });
  }

  async getDocument(collection: string, documentId: string): Promise<ProductionWriteDocSnap> {
    const cur = this.docs.get(this.key(collection, documentId));
    if (!cur) return { exists: false, id: documentId, data: null, updateTime: null };
    return { exists: true, id: documentId, data: { ...cur.data }, updateTime: cur.updateTime };
  }

  async createDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
  ): Promise<ProductionWriteDocSnap> {
    const k = this.key(collection, documentId);
    if (this.docs.has(k)) {
      throw Object.assign(new Error("ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
    }
    const updateTime = `ut_${documentId}_${Date.now().toString(36)}`;
    this.docs.set(k, { data: { ...fields }, updateTime });
    this.mutations.push({ op: "create", collection, id: documentId });
    return { exists: true, id: documentId, data: { ...fields }, updateTime };
  }

  async updateDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
    opts?: { expectedUpdateTime?: string | null; allowCreate?: boolean },
  ): Promise<ProductionWriteDocSnap> {
    const k = this.key(collection, documentId);
    const cur = this.docs.get(k);
    if (!cur) {
      if (opts?.allowCreate) {
        return this.createDocument(collection, documentId, fields);
      }
      throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
    }
    if (
      opts?.expectedUpdateTime != null &&
      opts.expectedUpdateTime !== "" &&
      cur.updateTime !== opts.expectedUpdateTime
    ) {
      throw Object.assign(new Error("PRECONDITION_FAILED"), { code: "PRECONDITION_FAILED" });
    }
    const next = { ...cur.data, ...fields };
    const updateTime = `ut_${documentId}_${Date.now().toString(36)}`;
    this.docs.set(k, { data: next, updateTime });
    this.mutations.push({ op: "update", collection, id: documentId });
    return { exists: true, id: documentId, data: { ...next }, updateTime };
  }

  async queryEqual(
    collection: string,
    field: string,
    value: string | boolean | number,
    limit = 20,
  ): Promise<ProductionWriteDocSnap[]> {
    const out: ProductionWriteDocSnap[] = [];
    for (const [k, v] of this.docs) {
      if (!k.startsWith(`${collection}/`)) continue;
      if (v.data[field] === value) {
        const id = k.slice(collection.length + 1);
        out.push({ exists: true, id, data: { ...v.data }, updateTime: v.updateTime });
        if (out.length >= limit) break;
      }
    }
    return out;
  }
}

export class WifRestProductionFirestoreWritePort implements ProductionFirestoreWritePort {
  readonly kind = "wif_rest_production_firestore_write" as const;
  private readonly credential: FirebaseAdminAccessTokenCredential;
  private readonly base: string;

  constructor(deps: {
    principal: Exclude<WritePrincipalKey, "shadow_reader">;
    projectId?: string;
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    credential?: FirebaseAdminAccessTokenCredential;
  }) {
    const env = deps.env ?? process.env;
    const projectId = deps.projectId ?? PRODUCTION_PROJECT_ID;
    const resolved = resolveWritePrincipal(deps.principal, env);
    if (!resolved.ready) {
      throw Object.assign(new Error(`WRITE_RUNTIME_UNAVAILABLE:${resolved.reason}`), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    if (env.EXPECTED_PROJECT_ID && env.EXPECTED_PROJECT_ID !== projectId) {
      throw Object.assign(new Error("WRITE_RUNTIME_UNAVAILABLE:PROJECT_MISMATCH"), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    const provider = env.GCP_WORKLOAD_IDENTITY_PROVIDER!.trim();
    this.credential =
      deps.credential ??
      createVercelOidcWifFirebaseCredential({
        workloadIdentityProvider: provider,
        serviceAccountEmail: resolved.email,
      });
    this.base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.fetcher = deps.fetcher ?? fetch;
  }

  private readonly fetcher: typeof fetch;

  private async headers(): Promise<Record<string, string>> {
    const token = await this.credential.getAccessToken();
    return {
      Authorization: `Bearer ${token.access_token}`,
      "content-type": "application/json",
    };
  }

  async getDocument(collection: string, documentId: string): Promise<ProductionWriteDocSnap> {
    const headers = await this.headers();
    const response = await this.fetcher(`${this.base}/${collection}/${encodeURIComponent(documentId)}`, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) {
      return { exists: false, id: documentId, data: null, updateTime: null };
    }
    if (!response.ok) {
      throw Object.assign(new Error(`WRITE_RUNTIME_UNAVAILABLE:GET_${response.status}`), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    const body = (await response.json()) as {
      fields?: Record<string, Record<string, unknown>>;
      updateTime?: string;
    };
    return decodeDoc(documentId, body);
  }

  async createDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
  ): Promise<ProductionWriteDocSnap> {
    const headers = await this.headers();
    const encoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) encoded[k] = encodeValue(v);
    const response = await this.fetcher(
      `${this.base}/${collection}?documentId=${encodeURIComponent(documentId)}`,
      {
        method: "POST",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ fields: encoded }),
      },
    );
    if (response.status === 409) {
      throw Object.assign(new Error("ALREADY_EXISTS"), { code: "ALREADY_EXISTS" });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`WRITE_RUNTIME_UNAVAILABLE:CREATE_${response.status}`), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    const body = (await response.json()) as {
      fields?: Record<string, Record<string, unknown>>;
      updateTime?: string;
    };
    return decodeDoc(documentId, body);
  }

  async updateDocument(
    collection: string,
    documentId: string,
    fields: Record<string, unknown>,
    opts?: { expectedUpdateTime?: string | null; allowCreate?: boolean },
  ): Promise<ProductionWriteDocSnap> {
    const headers = await this.headers();
    const encoded: Record<string, unknown> = {};
    const mask: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      encoded[k] = encodeValue(v);
      mask.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
    }
    const currentDoc =
      opts?.expectedUpdateTime != null && opts.expectedUpdateTime !== ""
        ? `&currentDocument.updateTime=${encodeURIComponent(opts.expectedUpdateTime)}`
        : opts?.allowCreate
          ? ""
          : "&currentDocument.exists=true";
    const url = `${this.base}/${collection}/${encodeURIComponent(documentId)}?${mask.join("&")}${currentDoc}`;
    const response = await this.fetcher(url, {
      method: "PATCH",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ fields: encoded }),
    });
    if (response.status === 404) {
      throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
    }
    if (response.status === 409 || response.status === 412) {
      throw Object.assign(new Error("PRECONDITION_FAILED"), { code: "PRECONDITION_FAILED" });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`WRITE_RUNTIME_UNAVAILABLE:PATCH_${response.status}`), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    const body = (await response.json()) as {
      fields?: Record<string, Record<string, unknown>>;
      updateTime?: string;
    };
    return decodeDoc(documentId, body);
  }

  async queryEqual(
    collection: string,
    field: string,
    value: string | boolean | number,
    limit = 20,
  ): Promise<ProductionWriteDocSnap[]> {
    const headers = await this.headers();
    const response = await this.fetcher(`${this.base}:runQuery`, {
      method: "POST",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collection }],
          where: {
            fieldFilter: {
              field: { fieldPath: field },
              op: "EQUAL",
              value: encodeValue(value),
            },
          },
          limit,
        },
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`WRITE_RUNTIME_UNAVAILABLE:QUERY_${response.status}`), {
        code: "WRITE_RUNTIME_UNAVAILABLE",
      });
    }
    const rows = (await response.json()) as Array<{
      document?: {
        name?: string;
        fields?: Record<string, Record<string, unknown>>;
        updateTime?: string;
      };
    }>;
    const out: ProductionWriteDocSnap[] = [];
    for (const row of rows) {
      if (!row.document?.name) continue;
      const id = row.document.name.split("/").pop() ?? "";
      out.push(decodeDoc(id, row.document));
    }
    return out;
  }
}

export function createWifWritePortOrThrow(
  principal: Exclude<WritePrincipalKey, "shadow_reader">,
  env: NodeJS.ProcessEnv = process.env,
): ProductionFirestoreWritePort {
  return new WifRestProductionFirestoreWritePort({ principal, env });
}
