/**
 * Phase 5N — Production ADC adapters for metadata-only reconcile writes.
 * Unreachable unless Phase5N operator gates pass.
 * ADC only — no SA JSON keys.
 * Surfaces: create-only AUDIT_RESULT + set(merge) idempotency auditResultId.
 * Never Driver / Auth claims / INTENT / Finance / Trip / Agent / Customer.
 */

import {
  evaluatePhase5NOperatorGates,
  type Phase5NOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5NOperatorGates";
import {
  PHASE_5N_AUDIT_COLLECTION,
  PHASE_5N_IDEMPOTENCY_COLLECTION,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
} from "@/application/controlled-writes/pilot/Phase5NConstants";
import { PHASE_5N_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5NMetadataReconcileDryRunEnabled";
import {
  assertFirestoreDocumentHasNoUndefined,
  omitUndefinedDeep,
} from "@/application/controlled-writes/omitUndefinedForFirestore";
import {
  createPhase5NWriteCounter,
  type Phase5NApplyPorts,
  type Phase5NMetadataWritePort,
  type Phase5NWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5NApplyPorts";
import {
  createPhase5NReadOnlyMetadataPorts,
  type Phase5NMetadataReadPort,
} from "@/application/controlled-writes/pilot/Phase5NReadOnlyMetadataPorts";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";

export class Phase5NFirebaseWriteAdaptersUnreachableError extends Error {
  readonly code = "PHASE5N_WRITE_ADAPTERS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "Phase5NFirebaseWriteAdaptersUnreachableError";
  }
}

export const PHASE_5N_FIREBASE_ADMIN_APP_NAME =
  "phase5n-metadata-reconcile-apply" as const;

type FirestoreLike = {
  doc: (path: string) => {
    get: () => Promise<{
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
    }>;
    create: (data: Record<string, unknown>) => Promise<void>;
    set: (
      data: Record<string, unknown>,
      opts?: { merge?: boolean },
    ) => Promise<void>;
  };
};

export function phase5NFirestoreWritePayload(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const payload = omitUndefinedDeep(data) as Record<string, unknown>;
  assertFirestoreDocumentHasNoUndefined(payload);
  return payload;
}

async function createPhase5NFirebaseAdminDb(input?: {
  gates?: Phase5NOperatorGateEnv;
  projectId?: string;
}): Promise<FirestoreLike> {
  const gates = evaluatePhase5NOperatorGates(input?.gates);
  if (!gates.ok) {
    throw new Phase5NFirebaseWriteAdaptersUnreachableError(
      `Firebase write adapters unreachable: ${gates.code} — ${gates.message}`,
    );
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Phase5NFirebaseWriteAdaptersUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_5N_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new Phase5NFirebaseWriteAdaptersUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = PHASE_5N_FIREBASE_ADMIN_APP_NAME;
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

  const db = admin.firestore(app);
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
        set: async (data, opts) => {
          if (opts) await ref.set(data, opts);
          else await ref.set(data);
        },
      };
    },
  };
}

export function createPhase5NMetadataWritePort(input: {
  db: FirestoreLike;
  counter: Phase5NWriteCounter;
}): Phase5NMetadataWritePort {
  const { db, counter } = input;
  return {
    async createSuccessAuditResult({ documentId, payload }) {
      const path = `${PHASE_5N_AUDIT_COLLECTION}/${documentId}`;
      const clean = phase5NFirestoreWritePayload(payload);
      if (Object.prototype.hasOwnProperty.call(clean, "code")) {
        throw new Phase5NFirebaseWriteAdaptersUnreachableError(
          "success AUDIT_RESULT must omit code field entirely",
        );
      }
      await db.doc(path).create(clean);
      counter.successAuditResultCreates += 1;
    },

    async patchIdempotencyAuditResultId({ key, auditResultId }) {
      if (key !== PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY) {
        throw new Phase5NFirebaseWriteAdaptersUnreachableError(
          `idempotency key must be ${PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY}`,
        );
      }
      const path = `${PHASE_5N_IDEMPOTENCY_COLLECTION}/${key}`;
      const snap = await db.doc(path).get();
      if (!snap.exists) {
        throw new Phase5NFirebaseWriteAdaptersUnreachableError(
          "idempotency document missing — refuse patch",
        );
      }
      // Minimum merge patch ONLY — do not rewrite other fields.
      const patch = phase5NFirestoreWritePayload({
        result: {
          auditResultId,
        },
      });
      await db.doc(path).set(patch, { merge: true });
      counter.idempotencyPatches += 1;
    },
  };
}

/**
 * Construct Production apply ports (read + narrow write). Throws if gates incomplete.
 * Does not mutate by itself.
 */
export async function createPhase5NProductionApplyPorts(input?: {
  gates?: Phase5NOperatorGateEnv;
  projectId?: string;
  counter?: Phase5NWriteCounter;
}): Promise<Phase5NApplyPorts> {
  const gates = evaluatePhase5NOperatorGates(input?.gates);
  if (!gates.ok) {
    throw new Phase5NFirebaseWriteAdaptersUnreachableError(
      `Firebase apply ports unreachable: ${gates.code} — ${gates.message}`,
    );
  }

  const counter = input?.counter ?? createPhase5NWriteCounter();
  const db = await createPhase5NFirebaseAdminDb(input);
  const write = createPhase5NMetadataWritePort({ db, counter });

  // Reuse read-only port construction (separate named app) for observed metadata.
  const { port: read } = await createPhase5NReadOnlyMetadataPorts({
    projectId: input?.projectId,
    counter: { productionReads: 0 },
  });

  const countingRead: Phase5NMetadataReadPort = {
    async loadObservedMetadata(args) {
      const observed = await read.loadObservedMetadata(args);
      counter.productionReads += 1;
      return observed;
    },
  };

  return {
    read: countingRead,
    write,
    counter,
  };
}
