/**
 * Real Firebase Admin ADC adapters for FR1 registry fixture create-only.
 * Unreachable unless caller evaluated gates. No SA JSON keys.
 * NEVER writes order/ or finance_accounting_snapshots.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  FINANCE_FR1_IDEMPOTENCY_COLLECTION,
} from "@/application/finance/pilot/FinanceFr1PilotConstants";
import {
  FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID,
  FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION,
  FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID,
} from "@/application/finance/pilot/FinanceFr1SyntheticFixtureConstants";
import type {
  FinanceFr1RegistryFixtureCreateResult,
  FinanceFr1RegistryFixtureFirestorePort,
} from "@/application/finance/pilot/FinanceFr1RegistryFixturePorts";

export class FinanceFr1RegistryFixtureFirebaseUnreachableError extends Error {
  readonly code = "FR1_REGISTRY_FIXTURE_FIREBASE_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "FinanceFr1RegistryFixtureFirebaseUnreachableError";
  }
}

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
    throw new FinanceFr1RegistryFixtureFirebaseUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new FinanceFr1RegistryFixtureFirebaseUnreachableError(
      "Only application_default credentials allowed",
    );
  }
  if (projectId !== FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID) {
    throw new FinanceFr1RegistryFixtureFirebaseUnreachableError(
      "projectId mismatch",
    );
  }

  const admin = await import("firebase-admin");
  const appName = "finance-fr1-registry-fixture-provision";
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

export async function createFirebaseFinanceFr1RegistryFixtureFirestorePort(input?: {
  projectId?: string;
}): Promise<FinanceFr1RegistryFixtureFirestorePort> {
  const projectId =
    input?.projectId ?? FINANCE_FR1_SYNTHETIC_FIXTURE_EXPECTED_PROJECT_ID;
  const db = await createAdminDb(projectId);
  const registryPath = `${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_REGISTRY_DOC_ID}`;
  const idemPath = `${FINANCE_FR1_IDEMPOTENCY_COLLECTION}/${FINANCE_FR1_SYNTHETIC_FIXTURE_IDEMPOTENCY_KEY}`;

  return {
    async getRegistryDoc() {
      const snap = await db.doc(registryPath).get();
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async getIdempotencyDoc() {
      const snap = await db.doc(idemPath).get();
      return {
        exists: snap.exists,
        data: snap.exists ? (snap.data() ?? null) : null,
      };
    },
    async createRegistryDoc(data): Promise<FinanceFr1RegistryFixtureCreateResult> {
      try {
        await db
          .doc(registryPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        return { ok: true };
      } catch (err) {
        if (isAlreadyExistsError(err)) {
          return {
            ok: false,
            code: "ALREADY_EXISTS",
            message: "registry already exists",
          };
        }
        return {
          ok: false,
          code: "CREATE_FAILED",
          message: err instanceof Error ? err.message : "registry create failed",
        };
      }
    },
    async createIdempotencyDoc(
      data,
    ): Promise<FinanceFr1RegistryFixtureCreateResult> {
      try {
        await db
          .doc(idemPath)
          .create(omitUndefinedDeep(data) as Record<string, unknown>);
        return { ok: true };
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
    forbiddenTouchCounts() {
      return {
        order: 0,
        financial_settlements: 0,
        settlement_payments: 0,
        finance_accounting_snapshots: 0,
        finance_audit_events: 0,
        drivers: 0,
        agents: 0,
        customers: 0,
        user: 0,
        auth: 0,
      };
    },
  };
}
