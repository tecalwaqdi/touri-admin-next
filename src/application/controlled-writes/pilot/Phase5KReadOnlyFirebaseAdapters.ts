/**
 * Phase 5K — read-only Firebase Auth + Firestore adapters (ADC).
 * getUser / getDoc only. No create/update/delete. No write gates required.
 * Must NOT require temporary create IAM.
 */

import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { PHASE_5I_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/Phase5IAuthFixtureModel";
import type { Phase5KAuthUserRecord } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";

export type Phase5KReadOnlyAuthPort = {
  getUser(uid: string): Promise<Phase5KAuthUserRecord | null>;
};

export type Phase5KReadOnlyFirestorePort = {
  getUserDoc(uid: string): Promise<{
    exists: boolean;
    data: Record<string, unknown> | null;
    /** Opaque concurrency token from updateTime when available. */
    preconditionToken: string | null;
  }>;
};

export type Phase5KReadOnlyPorts = {
  auth: Phase5KReadOnlyAuthPort;
  firestore: Phase5KReadOnlyFirestorePort;
  /** Incremented for each Auth/Firestore read. */
  readCounter: { productionReads: number };
};

export class Phase5KReadOnlyAdaptersUnreachableError extends Error {
  readonly code = "PHASE5K_READONLY_ADAPTERS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "Phase5KReadOnlyAdaptersUnreachableError";
  }
}

/**
 * ADC-only Admin handles for getUser + doc get. Refuses SA JSON keys.
 * Does not call createUser / create / set / update / delete.
 */
export async function createPhase5KReadOnlyFirebasePorts(input?: {
  projectId?: string;
}): Promise<Phase5KReadOnlyPorts> {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Phase5KReadOnlyAdaptersUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_5I_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new Phase5KReadOnlyAdaptersUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = "phase5k-verify-provisioned-fixture";
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

  const auth = admin.auth(app);
  const db = admin.firestore(app);
  const readCounter = { productionReads: 0 };

  return {
    readCounter,
    auth: {
      async getUser(uid: string) {
        readCounter.productionReads += 1;
        try {
          const user = await auth.getUser(uid);
          return {
            uid: user.uid,
            disabled: user.disabled === true,
            email: user.email ?? null,
            phoneNumber: user.phoneNumber ?? null,
            displayName: user.displayName ?? null,
            photoURL: user.photoURL ?? null,
            customClaims: (user.customClaims ?? {}) as Record<string, unknown>,
            providerDataCount: Array.isArray(user.providerData)
              ? user.providerData.length
              : 0,
          };
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code: unknown }).code)
              : "";
          if (code === "auth/user-not-found") return null;
          throw err;
        }
      },
    },
    firestore: {
      async getUserDoc(uid: string) {
        readCounter.productionReads += 1;
        const snap = await db.doc(`user/${uid}`).get();
        if (!snap.exists) {
          return { exists: false, data: null, preconditionToken: null };
        }
        const updateTime =
          snap.updateTime?.toDate?.()?.toISOString?.() ??
          snap.updateTime?.toString?.() ??
          null;
        const generation = typeof snap.updateTime === "object"
          ? String(snap.updateTime)
          : null;
        const preconditionToken =
          updateTime || generation
            ? `fs_ut_${updateTime ?? generation}`
            : `fs_exists_${uid.slice(0, 8)}`;
        return {
          exists: true,
          data: (snap.data() ?? {}) as Record<string, unknown>,
          preconditionToken,
        };
      },
    },
  };
}
