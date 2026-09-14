/**
 * Real Firebase Admin ADC adapters for FR2 Settlement V2 Pilot apply (4 writes).
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * NEVER mutates finance_accounting_snapshots / order / payments / domain surfaces.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR2_AUDIT_COLLECTION,
  FINANCE_FR2_EXPECTED_PROJECT_ID,
  FINANCE_FR2_IDEMPOTENCY_COLLECTION,
  FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SETTLEMENT_COLLECTION,
  FINANCE_FR2_SETTLEMENT_DOC_ID,
  FINANCE_FR2_SOURCE_FR1_IDEMPOTENCY_DOC_ID,
  FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR2_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr2PilotConstants";
import { FINANCE_FR1_SYNTHETIC_ORDER_ID } from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import {
  createFinanceFr2ApplyWriteCounter,
  type FinanceFr2ApplyCreateResult,
  type FinanceFr2ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr2ApplyPorts";

export class FinanceFr2PilotFirebaseUnreachableError extends Error {
  readonly code = "FR2_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr2PilotFirebaseUnreachableError";
  }
}

export const FINANCE_FR2_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr2-settlement-pilot-apply" as const;

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
    throw new FinanceFr2PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr2PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR2_EXPECTED_PROJECT_ID) {
    throw new FinanceFr2PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR2_PILOT_FIREBASE_ADMIN_APP_NAME;
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

export async function createFirebaseFinanceFr2ApplyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr2ApplyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR2_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = createFinanceFr2ApplyWriteCounter();

  const fr1SnapshotPath = `${FINANCE_FR2_SOURCE_SNAPSHOT_COLLECTION}/${FINANCE_FR2_SOURCE_SNAPSHOT_ID}`;
  const fr1IdemPath = `${FINANCE_FR2_IDEMPOTENCY_COLLECTION}/${FINANCE_FR2_SOURCE_FR1_IDEMPOTENCY_DOC_ID}`;
  const settlementPath = `${FINANCE_FR2_SETTLEMENT_COLLECTION}/${FINANCE_FR2_SETTLEMENT_DOC_ID}`;
  const fr2IdemPath = `${FINANCE_FR2_IDEMPOTENCY_COLLECTION}/${FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID}`;
  const orderPath = `order/${FINANCE_FR1_SYNTHETIC_ORDER_ID}`;

  return {
    counter,
    async getFr1SnapshotDoc() {
      const snap = await db.doc(fr1SnapshotPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getFr1IdempotencyDoc() {
      const snap = await db.doc(fr1IdemPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getSettlementDoc() {
      const snap = await db.doc(settlementPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getFr2IdempotencyDoc() {
      const snap = await db.doc(fr2IdemPath).get();
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
      const snap = await db.doc(`${FINANCE_FR2_AUDIT_COLLECTION}/${id}`).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async createSettlementDoc(data): Promise<FinanceFr2ApplyCreateResult> {
      try {
        await db
          .doc(settlementPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.settlementWrites += 1;
        return { ok: true, id: FINANCE_FR2_SETTLEMENT_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "settlement already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message:
            err instanceof Error ? err.message : "settlement create failed",
        };
      }
    },
    async createAuditDoc(id, data): Promise<FinanceFr2ApplyCreateResult> {
      try {
        await db
          .doc(`${FINANCE_FR2_AUDIT_COLLECTION}/${id}`)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        if (data.action === "settlement.create.intent") {
          counter.auditIntentWrites += 1;
        } else if (data.action === "settlement.create.result") {
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
    async createFr2IdempotencyDoc(
      data,
    ): Promise<FinanceFr2ApplyCreateResult> {
      try {
        await db
          .doc(fr2IdemPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.idempotencyWrites += 1;
        return { ok: true, id: FINANCE_FR2_PILOT_IDEMPOTENCY_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "fr2 idempotency already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message:
            err instanceof Error ? err.message : "fr2 idempotency create failed",
        };
      }
    },
  };
}
