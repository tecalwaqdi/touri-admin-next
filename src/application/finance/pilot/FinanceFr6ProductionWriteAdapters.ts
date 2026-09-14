/**
 * Real Firebase Admin ADC adapters for FR6 Adjustment Pilot apply (4 writes).
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * NEVER mutates finance_accounting_snapshots / financial_settlements /
 * financial_settlement_payments / order / refund / chargeback.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR6_ADJUSTMENT_COLLECTION,
  FINANCE_FR6_ADJUSTMENT_DOC_ID,
  FINANCE_FR6_AUDIT_COLLECTION,
  FINANCE_FR6_EXPECTED_PROJECT_ID,
  FINANCE_FR6_IDEMPOTENCY_COLLECTION,
  FINANCE_FR6_PAYMENT_DOC_ID,
  FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID,
  FINANCE_FR6_SETTLEMENT_COLLECTION,
  FINANCE_FR6_SETTLEMENT_DOC_ID,
  FINANCE_FR6_SOURCE_ORDER_ID,
  FINANCE_FR6_SOURCE_SNAPSHOT_COLLECTION,
  FINANCE_FR6_SOURCE_SNAPSHOT_ID,
} from "@/application/finance/pilot/FinanceFr6PilotConstants";
import { FINANCE_FR5_PAYMENT_COLLECTION } from "@/application/finance/pilot/FinanceFr5PilotConstants";
import {
  createFinanceFr6ApplyWriteCounter,
  type FinanceFr6ApplyCreateResult,
  type FinanceFr6ApplyFirestorePort,
} from "@/application/finance/pilot/FinanceFr6ApplyPorts";

export class FinanceFr6PilotFirebaseUnreachableError extends Error {
  readonly code = "FR6_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr6PilotFirebaseUnreachableError";
  }
}

export const FINANCE_FR6_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr6-adjustment-pilot-apply" as const;

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
    throw new FinanceFr6PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr6PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR6_EXPECTED_PROJECT_ID) {
    throw new FinanceFr6PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR6_PILOT_FIREBASE_ADMIN_APP_NAME;
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
  return app.firestore() as unknown as AdminDb;
}

function toSnap(raw: {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}): { exists: boolean; data: Record<string, unknown> | null } {
  return {
    exists: raw.exists,
    data: raw.exists ? (raw.data() ?? null) : null,
  };
}

export async function createFirebaseFinanceFr6ApplyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr6ApplyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR6_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter = createFinanceFr6ApplyWriteCounter();

  return {
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR6_SOURCE_SNAPSHOT_COLLECTION}/${FINANCE_FR6_SOURCE_SNAPSHOT_ID}`,
          )
          .get(),
      );
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR6_SETTLEMENT_COLLECTION}/${FINANCE_FR6_SETTLEMENT_DOC_ID}`,
          )
          .get(),
      );
    },
    async getPaymentDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(`${FINANCE_FR5_PAYMENT_COLLECTION}/${FINANCE_FR6_PAYMENT_DOC_ID}`)
          .get(),
      );
    },
    async getAdjustmentDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR6_ADJUSTMENT_COLLECTION}/${FINANCE_FR6_ADJUSTMENT_DOC_ID}`,
          )
          .get(),
      );
    },
    async getFr6IdempotencyDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR6_IDEMPOTENCY_COLLECTION}/${FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID}`,
          )
          .get(),
      );
    },
    async getOrderDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db.doc(`order/${FINANCE_FR6_SOURCE_ORDER_ID}`).get(),
      );
    },
    async getAuditDoc(id) {
      counter.productionReads += 1;
      return toSnap(
        await db.doc(`${FINANCE_FR6_AUDIT_COLLECTION}/${id}`).get(),
      );
    },
    async createAdjustmentDoc(data): Promise<FinanceFr6ApplyCreateResult> {
      try {
        await db
          .doc(
            `${FINANCE_FR6_ADJUSTMENT_COLLECTION}/${FINANCE_FR6_ADJUSTMENT_DOC_ID}`,
          )
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.adjustmentCreates += 1;
        return { ok: true, id: FINANCE_FR6_ADJUSTMENT_DOC_ID };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ALREADY_EXISTS|already exists/i.test(msg)) {
          return { ok: false, code: "ALREADY_EXISTS", message: msg };
        }
        return { ok: false, code: "CREATE_FAILED", message: msg };
      }
    },
    async createAuditDoc(id, data): Promise<FinanceFr6ApplyCreateResult> {
      try {
        await db
          .doc(`${FINANCE_FR6_AUDIT_COLLECTION}/${id}`)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        if (String(data.action).includes("intent")) {
          counter.auditIntentWrites += 1;
        } else {
          counter.auditResultWrites += 1;
        }
        return { ok: true, id };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ALREADY_EXISTS|already exists/i.test(msg)) {
          return { ok: false, code: "ALREADY_EXISTS", message: msg };
        }
        return { ok: false, code: "CREATE_FAILED", message: msg };
      }
    },
    async createIdempotencyDoc(data): Promise<FinanceFr6ApplyCreateResult> {
      try {
        await db
          .doc(
            `${FINANCE_FR6_IDEMPOTENCY_COLLECTION}/${FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID}`,
          )
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        counter.idempotencyWrites += 1;
        return { ok: true, id: FINANCE_FR6_PILOT_IDEMPOTENCY_DOC_ID };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/ALREADY_EXISTS|already exists/i.test(msg)) {
          return { ok: false, code: "ALREADY_EXISTS", message: msg };
        }
        return { ok: false, code: "CREATE_FAILED", message: msg };
      }
    },
    getWriteCounter() {
      return counter;
    },
  };
}
