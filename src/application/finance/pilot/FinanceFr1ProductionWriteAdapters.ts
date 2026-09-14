/**
 * Real Firebase Admin ADC adapters for FR1 Finance Pilot apply (4 writes).
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * NEVER writes order/, Settlement V2, Drivers/Agents/Customers/Auth, registry.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR1_AUDIT_COLLECTION,
  FINANCE_FR1_EXPECTED_PROJECT_ID,
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
  FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR1_SNAPSHOT_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
  FINANCE_FR1_SYNTHETIC_ORDER_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  createFinanceFr1ApplyWriteCounter,
  type FinanceFr1ApplyCreateResult,
  type FinanceFr1ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr1ApplyPorts";

export class FinanceFr1PilotFirebaseUnreachableError extends Error {
  readonly code = "FR1_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr1PilotFirebaseUnreachableError";
  }
}

export const FINANCE_FR1_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr1-pilot-apply" as const;

type DbDoc = {
  get: () => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  create: (data: Record<string, unknown>) => Promise<void>;
};

type AdminDb = {
  doc: (path: string) => DbDoc;
};

async function createAdminDb(projectId: string): Promise<AdminDb> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new FinanceFr1PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr1PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR1_EXPECTED_PROJECT_ID) {
    throw new FinanceFr1PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR1_PILOT_FIREBASE_ADMIN_APP_NAME;
  const existing = admin.apps.find((a) => a?.name === appName);
  const app =
    existing ??
    admin.initializeApp(
      {
        credential: admin.credential.applicationDefault(),
        projectId,
      },
      appName,
    );
  const db = app.firestore();
  return {
    doc: (path: string) => {
      const ref = db.doc(path);
      return {
        get: async () => {
          const snap = await ref.get();
          return {
            exists: snap.exists,
            data: () => snap.data() as Record<string, unknown> | undefined,
          };
        },
        create: async (data) => {
          await ref.create(data);
        },
      };
    },
  };
}

function isAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    /already exists|ALREADY_EXISTS/i.test(msg) ||
    code === "6" ||
    code === "already-exists"
  );
}

export async function createFirebaseFinanceFr1ApplyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr1ApplyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR1_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = createFinanceFr1ApplyWriteCounter();

  const registryPath = `${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID}`;
  const snapshotPath = `${FINANCE_FR1_SNAPSHOT_COLLECTION}/${FINANCE_FR1_SYNTHETIC_ORDER_ID}`;
  const idemPath = `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/${FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID}`;
  const orderPath = `order/${FINANCE_FR1_SYNTHETIC_ORDER_ID}`;

  return {
    counter,
    async getRegistryDoc() {
      const snap = await db.doc(registryPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getSnapshotDoc() {
      const snap = await db.doc(snapshotPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getIdempotencyDoc() {
      const snap = await db.doc(idemPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getOrderDoc() {
      const snap = await db.doc(orderPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getAuditDoc(id) {
      const snap = await db.doc(`${FINANCE_FR1_AUDIT_COLLECTION}/${id}`).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async createSnapshotDoc(data): Promise<FinanceFr1ApplyCreateResult> {
      try {
        await db
          .doc(snapshotPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.snapshotWrites += 1;
        return { ok: true, id: FINANCE_FR1_SYNTHETIC_ORDER_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "snapshot already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : "snapshot create failed",
        };
      }
    },
    async createAuditDoc(id, data): Promise<FinanceFr1ApplyCreateResult> {
      try {
        await db
          .doc(`${FINANCE_FR1_AUDIT_COLLECTION}/${id}`)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        if (data.action === "snapshot.materialize.intent") {
          counter.auditIntentWrites += 1;
        } else if (data.action === "snapshot.materialize.result") {
          counter.auditResultWrites += 1;
        }
        return { ok: true, id };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "audit already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : "audit create failed",
        };
      }
    },
    async createIdempotencyDoc(data): Promise<FinanceFr1ApplyCreateResult> {
      try {
        await db
          .doc(idemPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.idempotencyWrites += 1;
        return { ok: true, id: FINANCE_FR1_PILOT_IDEMPOTENCY_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "idempotency already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message:
            err instanceof Error ? err.message : "idempotency create failed",
        };
      }
    },
  };
}
