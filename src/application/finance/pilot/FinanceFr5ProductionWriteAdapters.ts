/**
 * Real Firebase Admin ADC adapters for FR5 Settlement Execution Pilot apply (5 writes).
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * Payment CREATE + settlement UPDATE. NEVER mutates finance_accounting_snapshots /
 * order / FR4 idempotency / wallet / payout / domain surfaces.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR5_AUDIT_COLLECTION,
  FINANCE_FR5_EXPECTED_PROJECT_ID,
  FINANCE_FR5_FR4_IDEMPOTENCY_DOC_ID,
  FINANCE_FR5_IDEMPOTENCY_COLLECTION,
  FINANCE_FR5_PAYMENT_COLLECTION,
  FINANCE_FR5_PAYMENT_DOC_ID,
  FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR5_SETTLEMENT_COLLECTION,
  FINANCE_FR5_SETTLEMENT_DOC_ID,
  FINANCE_FR5_SOURCE_ORDER_ID,
  FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR5_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  createFinanceFr5ApplyWriteCounter,
  type FinanceFr5ApplyCreateResult,
  type FinanceFr5ApplyFirestorePort,
  type FinanceFr5ApplyUpdateResult,
} from "@/application/finance/pilot/FinanceFr5ApplyPorts";

export class FinanceFr5PilotFirebaseUnreachableError extends Error {
  readonly code = "FR5_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr5PilotFirebaseUnreachableError";
  }
}

export const FINANCE_FR5_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr5-settlement-execution-pilot-apply" as const;

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
    throw new FinanceFr5PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr5PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR5_EXPECTED_PROJECT_ID) {
    throw new FinanceFr5PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR5_PILOT_FIREBASE_ADMIN_APP_NAME;
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

export async function createFirebaseFinanceFr5ApplyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr5ApplyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR5_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = createFinanceFr5ApplyWriteCounter();

  const fr1SnapshotPath = `${FINANCE_FR5_SOURCE_SNAPSHOT_COLLECTION}/${FINANCE_FR5_SOURCE_SNAPSHOT_ID}`;
  const fr4IdemPath = `${FINANCE_FR5_IDEMPOTENCY_COLLECTION}/${FINANCE_FR5_FR4_IDEMPOTENCY_DOC_ID}`;
  const settlementPath = `${FINANCE_FR5_SETTLEMENT_COLLECTION}/${FINANCE_FR5_SETTLEMENT_DOC_ID}`;
  const paymentPath = `${FINANCE_FR5_PAYMENT_COLLECTION}/${FINANCE_FR5_PAYMENT_DOC_ID}`;
  const fr5IdemPath = `${FINANCE_FR5_IDEMPOTENCY_COLLECTION}/${FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID}`;
  const orderPath = `order/${FINANCE_FR5_SOURCE_ORDER_ID}`;

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
    async getFr4IdempotencyDoc() {
      const snap = await db.doc(fr4IdemPath).get();
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
    async getPaymentDoc() {
      const snap = await db.doc(paymentPath).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getFr5IdempotencyDoc() {
      const snap = await db.doc(fr5IdemPath).get();
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
      const snap = await db.doc(`${FINANCE_FR5_AUDIT_COLLECTION}/${id}`).get();
      counter.productionReads += 1;
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async createPaymentDoc(data): Promise<FinanceFr5ApplyCreateResult> {
      try {
        await db
          .doc(paymentPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.paymentCreates += 1;
        return { ok: true, id: FINANCE_FR5_PAYMENT_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "payment already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async updateSettlementExecution(
      patch,
    ): Promise<FinanceFr5ApplyUpdateResult> {
      try {
        const before = await db.doc(settlementPath).get();
        counter.productionReads += 1;
        if (!before.exists) {
          return {
            ok: false,
            code: "NOT_FOUND",
            message: "settlement not found",
          };
        }
        const data = before.data();
        if (data?.status !== "locked") {
          return {
            ok: false,
            code: "PRECONDITION_FAILED",
            message: `settlement status ${String(data?.status)} not locked`,
          };
        }
        await db
          .doc(settlementPath)
          .update(omitUndefinedDeep(patch) as Record<string, unknown>);
        counter.settlementUpdates += 1;
        return { ok: true, id: FINANCE_FR5_SETTLEMENT_DOC_ID };
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
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async createAuditDoc(id, data): Promise<FinanceFr5ApplyCreateResult> {
      try {
        await db
          .doc(`${FINANCE_FR5_AUDIT_COLLECTION}/${id}`)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        if (data.action === "payment.confirm.intent") {
          counter.auditIntentWrites += 1;
        } else if (data.action === "payment.confirm.result") {
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
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    async createFr5IdempotencyDoc(
      data,
    ): Promise<FinanceFr5ApplyCreateResult> {
      try {
        await db
          .doc(fr5IdemPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.idempotencyWrites += 1;
        return { ok: true, id: FINANCE_FR5_PILOT_IDEMPOTENCY_DOC_ID };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "fr5 idempotency already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
