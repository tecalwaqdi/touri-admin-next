/**
 * FR7 read-only Firestore port — get-only wrapper over FR6 synthetic docs.
 * NEVER create/update/delete. Production writes always 0.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
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

export type FinanceFr7ReadDocSnap = {
  exists: boolean;
  data: Record<string, unknown> | null;
};

export type FinanceFr7ReadCounter = {
  productionReads: number;
  productionWrites: 0;
  firestoreMutations: 0;
};

export type FinanceFr7ReadOnlyFirestorePort = {
  getFr1SnapshotDoc(): Promise<FinanceFr7ReadDocSnap>;
  getSettlementDoc(): Promise<FinanceFr7ReadDocSnap>;
  getPaymentDoc(): Promise<FinanceFr7ReadDocSnap>;
  getAdjustmentDoc(): Promise<FinanceFr7ReadDocSnap>;
  getCounter(): FinanceFr7ReadCounter;
};

export class FinanceFr7PilotFirebaseUnreachableError extends Error {
  readonly code = "FR7_PILOT_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr7PilotFirebaseUnreachableError";
  }
}

const FINANCE_FR7_PILOT_FIREBASE_ADMIN_APP_NAME =
  "finance-fr7-reporting-pilot-verify" as const;

type DbDoc = {
  get: () => Promise<{
    exists: boolean;
    data: () => Record<string, unknown> | undefined;
  }>;
};

type AdminDb = {
  doc: (path: string) => DbDoc;
};

async function createAdminDb(projectId: string): Promise<AdminDb> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new FinanceFr7PilotFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr7PilotFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR7_EXPECTED_PROJECT_ID) {
    throw new FinanceFr7PilotFirebaseUnreachableError("projectId mismatch");
  }

  const admin = await import("firebase-admin");
  const appName = FINANCE_FR7_PILOT_FIREBASE_ADMIN_APP_NAME;
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
}): FinanceFr7ReadDocSnap {
  return {
    exists: raw.exists,
    data: raw.exists ? (raw.data() ?? null) : null,
  };
}

export function createFakeFinanceFr7ReadOnlyFirestorePort(seed?: {
  snapshot?: Record<string, unknown> | null;
  settlement?: Record<string, unknown> | null;
  payment?: Record<string, unknown> | null;
  adjustment?: Record<string, unknown> | null;
}): FinanceFr7ReadOnlyFirestorePort {
  const counter: FinanceFr7ReadCounter = {
    productionReads: 0,
    productionWrites: 0,
    firestoreMutations: 0,
  };
  const store = {
    snapshot: seed?.snapshot ?? null,
    settlement: seed?.settlement ?? null,
    payment: seed?.payment ?? null,
    adjustment: seed?.adjustment ?? null,
  };
  const snap = (data: Record<string, unknown> | null): FinanceFr7ReadDocSnap => ({
    exists: data != null,
    data,
  });
  return {
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return snap(store.snapshot);
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return snap(store.settlement);
    },
    async getPaymentDoc() {
      counter.productionReads += 1;
      return snap(store.payment);
    },
    async getAdjustmentDoc() {
      counter.productionReads += 1;
      return snap(store.adjustment);
    },
    getCounter() {
      return counter;
    },
  };
}

export async function createFirebaseFinanceFr7ReadOnlyFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr7ReadOnlyFirestorePort> {
  const projectId = input?.projectId ?? FINANCE_FR7_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const counter: FinanceFr7ReadCounter = {
    productionReads: 0,
    productionWrites: 0,
    firestoreMutations: 0,
  };
  return {
    async getFr1SnapshotDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR7_SNAPSHOT_COLLECTION}/${FINANCE_FR7_SOURCE_SNAPSHOT_ID}`,
          )
          .get(),
      );
    },
    async getSettlementDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR7_SETTLEMENT_COLLECTION}/${FINANCE_FR7_SETTLEMENT_DOC_ID}`,
          )
          .get(),
      );
    },
    async getPaymentDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR7_PAYMENT_COLLECTION}/${FINANCE_FR7_PAYMENT_DOC_ID}`,
          )
          .get(),
      );
    },
    async getAdjustmentDoc() {
      counter.productionReads += 1;
      return toSnap(
        await db
          .doc(
            `${FINANCE_FR7_ADJUSTMENT_COLLECTION}/${FINANCE_FR7_ADJUSTMENT_DOC_ID}`,
          )
          .get(),
      );
    },
    getCounter() {
      return counter;
    },
  };
}
