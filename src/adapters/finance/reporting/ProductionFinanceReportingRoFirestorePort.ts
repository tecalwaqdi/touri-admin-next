/**
 * Production FR7 read-only Firestore port.
 * Bounded get + country-filtered query. NEVER writes.
 * ADC only — SA JSON keys forbidden.
 */

import {
  FINANCE_FR7_ADJUSTMENT_COLLECTION,
  FINANCE_FR7_ADJUSTMENT_DOC_ID,
  FINANCE_FR7_EXPECTED_PROJECT_ID,
  FINANCE_FR7_PAYMENT_COLLECTION,
  FINANCE_FR7_PAYMENT_DOC_ID,
  FINANCE_FR7_SETTLEMENT_COLLECTION,
  FINANCE_FR7_SETTLEMENT_DOC_ID,
  FINANCE_FR7_SNAPSHOT_COLLECTION,
  FINANCE_FR7_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr7PilotConstants";
import {
  FINANCE_REPORTING_RO_COLLECTIONS,
  FINANCE_REPORTING_RO_QUERY_LIMIT,
  type FinanceReportingRoCollection,
  type FinanceReportingRoDoc,
  type FinanceReportingRoFirestorePort,
} from "@/adapters/finance/reporting/FinanceReportingSourcePorts";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import {
  createVercelOidcWifFirebaseCredential,
  resolveVercelOidcWifConfig,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";

export class FinanceReportingRoFirebaseUnreachableError extends Error {
  readonly code:
    | "FR7_RO_FIREBASE_UNREACHABLE"
    | "FR7_ADC_MISSING"
    | "FR7_WIF_CONFIG_INCOMPLETE"
    | "FR7_WIF_TOKEN_MISSING"
    | "FR7_CREDENTIALS_INVALID";
  constructor(
    message: string,
    code:
      | "FR7_RO_FIREBASE_UNREACHABLE"
      | "FR7_ADC_MISSING"
      | "FR7_WIF_CONFIG_INCOMPLETE"
      | "FR7_WIF_TOKEN_MISSING"
      | "FR7_CREDENTIALS_INVALID" = "FR7_RO_FIREBASE_UNREACHABLE",
  ) {
    super(message);
    this.name = "FinanceReportingRoFirebaseUnreachableError";
    this.code = code;
  }
}

const APP_NAME = "finance-fr7-production-ro-reporting" as const;

type DbDoc = {
  get: () => Promise<{
    id: string;
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
};

type DbQuery = {
  where: (field: string, op: string, value: unknown) => DbQuery;
  limit: (n: number) => DbQuery;
  get: () => Promise<{
    docs: Array<{
      id: string;
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
    }>;
  }>;
};

type AdminDb = {
  collection: (name: string) => {
    doc: (id: string) => DbDoc;
  } & DbQuery;
};

function assertRoCollection(
  collection: string,
): asserts collection is FinanceReportingRoCollection {
  if (
    !(FINANCE_REPORTING_RO_COLLECTIONS as readonly string[]).includes(
      collection,
    )
  ) {
    throw new FinanceReportingRoFirebaseUnreachableError(
      `COLLECTION_NOT_ALLOWED_FOR_FR7_RO:${collection}`,
    );
  }
}

async function resolveFr7FirebaseCredential(projectId: string): Promise<{
  credential: { getAccessToken: () => Promise<{ access_token: string; expires_in: number }> };
  kind: "application_default" | "vercel_oidc_wif";
}> {
  const wif = resolveVercelOidcWifConfig();
  if (wif.status === "incomplete") {
    throw new FinanceReportingRoFirebaseUnreachableError(
      `FR7_WIF_CONFIG_INCOMPLETE: missing ${wif.missing?.join(",") ?? "WIF env"}`,
      "FR7_WIF_CONFIG_INCOMPLETE",
    );
  }
  if (wif.status === "ready" && wif.config) {
    // WIF path — refuse classic SA JSON keys even if GAC is accidentally set.
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new FinanceReportingRoFirebaseUnreachableError(
        "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS (use Vercel OIDC WIF)",
        "FR7_CREDENTIALS_INVALID",
      );
    }
    return {
      kind: "vercel_oidc_wif",
      credential: createVercelOidcWifFirebaseCredential(wif.config),
    };
  }

  // Local / traditional ADC path (no metadata server on Vercel → ADC_MISSING).
  try {
    const creds =
      await new ApplicationDefaultProductionCredentialProvider(
        projectId,
      ).getCredentials();
    if (creds.kind !== "application_default") {
      throw new FinanceReportingRoFirebaseUnreachableError(
        "Only application_default or Vercel OIDC WIF credentials allowed",
        "FR7_CREDENTIALS_INVALID",
      );
    }
  } catch (err) {
    if (err instanceof FinanceReportingRoFirebaseUnreachableError) throw err;
    const msg = err instanceof Error ? err.message : "credentials failed";
    throw new FinanceReportingRoFirebaseUnreachableError(
      msg,
      /GOOGLE_APPLICATION_CREDENTIALS/i.test(msg)
        ? "FR7_CREDENTIALS_INVALID"
        : "FR7_ADC_MISSING",
    );
  }

  const admin = await import("firebase-admin");
  return {
    kind: "application_default",
    credential: admin.credential.applicationDefault(),
  };
}

async function createAdminDb(projectId: string): Promise<AdminDb> {
  if (projectId !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
    throw new FinanceReportingRoFirebaseUnreachableError("projectId mismatch");
  }

  const resolved = await resolveFr7FirebaseCredential(projectId);
  const admin = await import("firebase-admin");
  const existing = admin.apps.find((a) => a?.name === APP_NAME);
  try {
    const app =
      existing ??
      admin.initializeApp(
        {
          credential: resolved.credential,
          projectId,
        },
        APP_NAME,
      );
    return app.firestore() as unknown as AdminDb;
  } catch (err) {
    if (err instanceof FinanceReportingRoFirebaseUnreachableError) throw err;
    const msg = err instanceof Error ? err.message : "Firebase Admin init failed";
    if (/Could not load the default credentials/i.test(msg)) {
      throw new FinanceReportingRoFirebaseUnreachableError(msg, "FR7_ADC_MISSING");
    }
    if (/VERCEL_OIDC_TOKEN|WIF_TOKEN_MISSING/i.test(msg)) {
      throw new FinanceReportingRoFirebaseUnreachableError(
        msg,
        "FR7_WIF_TOKEN_MISSING",
      );
    }
    throw new FinanceReportingRoFirebaseUnreachableError(msg);
  }
}

function toDoc(raw: {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}): FinanceReportingRoDoc {
  return {
    id: raw.id,
    exists: raw.exists,
    data: raw.exists ? (raw.data() ?? null) : null,
  };
}

/** Known FR1→FR6 synthetic Production chain document IDs. */
export const FINANCE_FR7_PRODUCTION_CHAIN_DOC_IDS = {
  snapshot: {
    collection: FINANCE_FR7_SNAPSHOT_COLLECTION as FinanceReportingRoCollection,
    id: FINANCE_FR7_SOURCE_SNAPSHOT_ID,
  },
  settlement: {
    collection:
      FINANCE_FR7_SETTLEMENT_COLLECTION as FinanceReportingRoCollection,
    id: FINANCE_FR7_SETTLEMENT_DOC_ID,
  },
  payment: {
    collection: FINANCE_FR7_PAYMENT_COLLECTION as FinanceReportingRoCollection,
    id: FINANCE_FR7_PAYMENT_DOC_ID,
  },
  adjustment: {
    collection:
      FINANCE_FR7_ADJUSTMENT_COLLECTION as FinanceReportingRoCollection,
    id: FINANCE_FR7_ADJUSTMENT_DOC_ID,
  },
} as const;

export function createFakeFinanceReportingRoFirestorePort(seed?: {
  docs?: Record<string, Record<string, Record<string, unknown> | null>>;
}): FinanceReportingRoFirestorePort {
  const counter = {
    productionReads: 0,
    productionWrites: 0 as const,
    firestoreMutations: 0 as const,
  };
  const store = seed?.docs ?? {};

  return {
    async getDocument(collection, documentId) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      const data = store[collection]?.[documentId] ?? null;
      return {
        id: documentId,
        exists: data != null,
        data,
      };
    },
    async queryByCountry(collection, input) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      const limit = Math.min(
        input.limit,
        FINANCE_REPORTING_RO_QUERY_LIMIT,
      );
      const col = store[collection] ?? {};
      const rows: FinanceReportingRoDoc[] = [];
      for (const [id, data] of Object.entries(col)) {
        if (data == null) continue;
        if (
          input.countryId &&
          String(data.countryId ?? "") !== input.countryId
        ) {
          continue;
        }
        rows.push({ id, exists: true, data });
        if (rows.length >= limit) break;
      }
      return rows;
    },
    getCounter() {
      return { ...counter };
    },
  };
}

export async function createFirebaseFinanceReportingRoFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceReportingRoFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR7_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = {
    productionReads: 0,
    productionWrites: 0 as const,
    firestoreMutations: 0 as const,
  };

  return {
    async getDocument(collection, documentId) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      const snap = await db.collection(collection).doc(documentId).get();
      return toDoc({
        id: snap.id || documentId,
        exists: snap.exists,
        data: () => snap.data(),
      });
    },
    async queryByCountry(collection, input) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      const limit = Math.min(
        Math.max(1, input.limit),
        FINANCE_REPORTING_RO_QUERY_LIMIT,
      );
      let q: DbQuery = db.collection(collection) as unknown as DbQuery;
      if (input.countryId) {
        q = q.where("countryId", "==", input.countryId);
      }
      q = q.limit(limit);
      const snap = await q.get();
      return snap.docs.map((d) =>
        toDoc({
          id: d.id,
          exists: true,
          data: () => d.data(),
        }),
      );
    },
    getCounter() {
      return { ...counter };
    },
  };
}
