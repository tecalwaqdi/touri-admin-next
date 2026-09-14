/**
 * Real Firebase Admin ADC adapters for FR4 Settlement Approval Pilot apply (4 writes).
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * Settlement UPDATE only. NEVER mutates finance_accounting_snapshots / order /
 * payments / FR2 create payloads / domain surfaces.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR4_AUDIT_COLLECTION,
  FINANCE_FR4_EXPECTED_PROJECT_ID,
  FINANCE_FR4_FR2_IDEMPOTENCY_DOC_ID,
  FINANCE_FR4_IDEMPOTENCY_COLLECTION,
  FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR4_SETTLEMENT_COLLECTION,
  FINANCE_FR4_SETTLEMENT_DOC_ID,
  FINANCE_FR4_SOURCE_ORDER_ID,
  FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR4_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr4PilotConstants";
import {
  createFinanceFr4ApplyWriteCounter,
  type FinanceFr4ApplyCreateResult,
  type FinanceFr4ApplyFirestorePort,
  type FinanceFr4ApplyUpdateResult,
} from "@/application/finance/pilot/FinanceFr4ApplyPorts";

export class FinanceFr4PilotFirebaseUnreachableError extends Error {
  readonly code = "FR4_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr4PilotFirebaseUnreachableError";
  }
}

export const FINANCE_FR4_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr4-settlement-approval-pilot-apply" as const;

type DbDoc = {
  get: () => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
  create: (data: Record<string, unknown>) => Promise<void>;
  update: (data: Record<string, unknown>) => Promise<void>;
};

type AdminDb = {
  doc: (path: string) => DbDoc;
};

async function createAdminDb(projectId: string): Promise<AdminDb> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new FinanceFr4PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr4PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR4_EXPECTED_PROJECT_ID) {
    throw new FinanceFr4PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR4_PILOT_FIREBASE_ADMIN_APP_NAME;
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
        update: async (data) => {
          await ref.update(data);
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

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return (
    /not.?found|NOT_FOUND/i.test(msg) ||
    code === "5" ||
    code === "not-found"
  );
}

export async function createFirebaseFinanceFr4ApplyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr4ApplyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR4_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = createFinanceFr4ApplyWriteCounter();

  const fr1SnapshotPath = `${FINANCE_FR4_SOURCE_SNAPSHOT_COLLECTION}/${FINANCE_FR4_SOURCE_SNAPSHOT_ID}`;
  const fr2IdemPath = `${FINANCE_FR4_IDEMPOTENCY_COLLECTION}/${FINANCE_FR4_FR2_IDEMPOTENCY_DOC_ID}`;
  const settlementPath = `${FINANCE_FR4_SETTLEMENT_COLLECTION}/${FINANCE_FR4_SETTLEMENT_DOC_ID}`;
  const fr4IdemPath = `${FINANCE_FR4_IDEMPOTENCY_COLLECTION}/${FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID}`;
  const orderPath = `order/${FINANCE_FR4_SOURCE_ORDER_ID}`;

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
    async getFr2IdempotencyDoc() {
      const snap = await db.doc(fr2IdemPath).get();
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
    async getFr4IdempotencyDoc() {
      const snap = await db.doc(fr4IdemPath).get();
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
      const snap = await db.doc(`${FINANCE_FR4_AUDIT_COLLECTION}/${id}`).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async updateSettlementApproval(
      patch,
    ): Promise<FinanceFr4ApplyUpdateResult> {
      try {
        const before = await db.doc(settlementPath).get();
        if (!before.exists) {
          return {
            ok: false,
            code: "NOT_FOUND",
            message: "settlement not found",
          };
        }
        const data = before.data() ?? {};
        if (data.status !== "draft") {
          return {
            ok: false,
            code: "PRECONDITION_FAILED",
            message: `settlement status ${String(data.status)} not draft`,
          };
        }
        await db
          .doc(settlementPath)
          .update(omitUndefinedDeep(patch) as Record<string, unknown>);
        counter.settlementUpdates += 1;
        return { ok: true, id: FINANCE_FR4_SETTLEMENT_DOC_ID };
      } catch (err) {
        if (isNotFoundError(err)) {
          return {
            ok: false,
            code: "NOT_FOUND",
            message: "settlement not found",
          };
        }
        return {
          ok: false,
          code: "UPDATE_FAILED",
          message:
            err instanceof Error ? err.message : "settlement update failed",
        };
      }
    },
    async createAuditDoc(id, data): Promise<FinanceFr4ApplyCreateResult> {
      try {
        await db
          .doc(`${FINANCE_FR4_AUDIT_COLLECTION}/${id}`)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        if (data.action === "settlement.lock.intent") {
          counter.auditIntentWrites += 1;
        } else if (data.action === "settlement.lock.result") {
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
    async createFr4IdempotencyDoc(
      data,
    ): Promise<FinanceFr4ApplyCreateResult> {
      try {
        await db
          .doc(fr4IdemPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.idempotencyWrites += 1;
        return { ok: true, id: FINANCE_FR4_PILOT_IDEMPOTENCY_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "fr4 idempotency already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message:
            err instanceof Error ? err.message : "fr4 idempotency create failed",
        };
      }
    },
  };
}
