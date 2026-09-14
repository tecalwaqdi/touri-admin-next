/**
 * Production FR7 read-only Firestore port.
 * Bounded get + country-filtered query. NEVER writes.
 * WIF → GoogleAuth(AuthClient) → GAPIC FirestoreClient. ADC fallback for local.
 * Never routes WIF through Admin SDK Firestore credential type checks.
 * SA JSON keys forbidden.
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
  createVercelOidcWifGoogleAuth,
  resolveVercelOidcWifConfig,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import {
  Fr7WifNativeFirestoreReadTransport,
  type Fr7FirestoreReadRpcClient,
} from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";

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

function mapTransportError(err: unknown): never {
  if (err instanceof FinanceReportingRoFirebaseUnreachableError) throw err;
  const msg = err instanceof Error ? err.message : "Firestore read failed";
  if (/Could not load the default credentials/i.test(msg)) {
    throw new FinanceReportingRoFirebaseUnreachableError(msg, "FR7_ADC_MISSING");
  }
  if (/VERCEL_OIDC_TOKEN|OIDC token|WIF_TOKEN_MISSING/i.test(msg)) {
    throw new FinanceReportingRoFirebaseUnreachableError(
      msg,
      "FR7_WIF_TOKEN_MISSING",
    );
  }
  if (/GOOGLE_APPLICATION_CREDENTIALS/i.test(msg)) {
    throw new FinanceReportingRoFirebaseUnreachableError(
      msg,
      "FR7_CREDENTIALS_INVALID",
    );
  }
  throw new FinanceReportingRoFirebaseUnreachableError(msg);
}

async function createFr7ReadTransport(projectId: string): Promise<{
  transport: Fr7WifNativeFirestoreReadTransport;
  kind: "application_default" | "vercel_oidc_wif";
}> {
  if (projectId !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
    throw new FinanceReportingRoFirebaseUnreachableError("projectId mismatch");
  }

  const wif = resolveVercelOidcWifConfig();
  if (wif.status === "incomplete") {
    throw new FinanceReportingRoFirebaseUnreachableError(
      `FR7_WIF_CONFIG_INCOMPLETE: missing ${wif.missing?.join(",") ?? "WIF env"}`,
      "FR7_WIF_CONFIG_INCOMPLETE",
    );
  }

  if (wif.status === "ready" && wif.config) {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
      throw new FinanceReportingRoFirebaseUnreachableError(
        "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS (use Vercel OIDC WIF)",
        "FR7_CREDENTIALS_INVALID",
      );
    }
    const auth = createVercelOidcWifGoogleAuth(wif.config, projectId);
    return {
      kind: "vercel_oidc_wif",
      transport: new Fr7WifNativeFirestoreReadTransport({
        projectId,
        auth,
      }),
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

  return {
    kind: "application_default",
    transport: new Fr7WifNativeFirestoreReadTransport({ projectId }),
  };
}

function wrapTransportAsPort(
  transport: Fr7WifNativeFirestoreReadTransport,
): FinanceReportingRoFirestorePort {
  const counter = {
    productionReads: 0,
    productionWrites: 0 as const,
    firestoreMutations: 0 as const,
  };

  return {
    async getDocument(collection, documentId) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      try {
        return await transport.getDocument(collection, documentId);
      } catch (err) {
        mapTransportError(err);
      }
    },
    async queryByCountry(collection, input) {
      assertRoCollection(collection);
      counter.productionReads += 1;
      const limit = Math.min(
        Math.max(1, input.limit),
        FINANCE_REPORTING_RO_QUERY_LIMIT,
      );
      try {
        return await transport.queryByCountry(collection, {
          countryId: input.countryId,
          limit,
        });
      } catch (err) {
        mapTransportError(err);
      }
    },
    getCounter() {
      return { ...counter };
    },
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
  /** Test-only: inject GAPIC-shaped read RPC client (no network / no Admin). */
  rpcClient?: Fr7FirestoreReadRpcClient;
}): Promise<FinanceReportingRoFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR7_EXPECTED_PROJECT_ID;
  try {
    if (input?.rpcClient) {
      if (projectId !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
        throw new FinanceReportingRoFirebaseUnreachableError("projectId mismatch");
      }
      return wrapTransportAsPort(
        new Fr7WifNativeFirestoreReadTransport({
          projectId,
          rpcClient: input.rpcClient,
        }),
      );
    }
    const { transport } = await createFr7ReadTransport(projectId);
    return wrapTransportAsPort(transport);
  } catch (err) {
    mapTransportError(err);
  }
}
