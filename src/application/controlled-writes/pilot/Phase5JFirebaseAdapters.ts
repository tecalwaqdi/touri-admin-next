/**
 * Phase 5J — real Firebase Admin Auth + Firestore adapters.
 * Unreachable unless ALL operator gates pass (caller must evaluate gates first).
 * ADC only — no SA JSON keys. Prefer create-only Firestore semantics.
 *
 * DO NOT invoke from default tests / design session.
 */

import {
  evaluatePhase5JOperatorGates,
  type Phase5JOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5JOperatorGates";
import {
  PHASE_5I_FIXTURE_COUNTRY_PATH,
  PHASE_5I_FIXTURE_CITY_PATH,
  type Phase5ISyntheticDriverFirestoreDoc,
} from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import type {
  Phase5JAuthCreateResult,
  Phase5JAuthGetResult,
  Phase5JAuthPort,
  Phase5JFirestoreCreateResult,
  Phase5JFirestorePort,
  Phase5JGeoExistsResult,
} from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { PHASE_5J_EXPECTED_PROJECT_ID } from "@/application/controlled-writes/pilot/isPhase5JSyntheticDriverProvisionEnabled";

export class Phase5JFirebaseAdaptersUnreachableError extends Error {
  readonly code = "FIREBASE_ADAPTERS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "Phase5JFirebaseAdaptersUnreachableError";
  }
}

type AdminHandles = {
  auth: {
    createUser: (props: { disabled: true }) => Promise<{
      uid: string;
      disabled: boolean;
      email?: string;
      phoneNumber?: string;
      displayName?: string;
      photoURL?: string;
    }>;
    getUser: (uid: string) => Promise<{
      uid: string;
      disabled: boolean;
      email?: string;
      phoneNumber?: string;
      customClaims?: Record<string, unknown>;
    }>;
  };
  db: {
    doc: (path: string) => {
      get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      create: (data: Record<string, unknown>) => Promise<void>;
    };
  };
};

/**
 * Construct real Admin handles via ADC. Throws if gates incomplete or SA key present.
 * Does not create users by itself.
 */
export async function createPhase5JFirebaseAdminHandles(input?: {
  gates?: Phase5JOperatorGateEnv;
  projectId?: string;
}): Promise<AdminHandles> {
  const gates = evaluatePhase5JOperatorGates(input?.gates);
  if (!gates.ok) {
    throw new Phase5JFirebaseAdaptersUnreachableError(
      `Firebase adapters unreachable: ${gates.code} — ${gates.message}`,
    );
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Phase5JFirebaseAdaptersUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_5J_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new Phase5JFirebaseAdaptersUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = "phase5j-synthetic-driver-provision";
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
  return {
    auth: {
      createUser: (props) => auth.createUser(props),
      getUser: (uid) => auth.getUser(uid),
    },
    db: {
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
    },
  };
}

export class FirebasePhase5JAuthPort implements Phase5JAuthPort {
  constructor(private readonly handles: AdminHandles) {}

  async createDisabledSyntheticUser(): Promise<Phase5JAuthCreateResult> {
    try {
      const user = await this.handles.auth.createUser({ disabled: true });
      if (!user.disabled) {
        return {
          ok: false,
          code: "AUTH_NOT_DISABLED",
          message: "Created Auth user is not disabled",
        };
      }
      if (user.email || user.phoneNumber) {
        return {
          ok: false,
          code: "AUTH_UNEXPECTED_CONTACT",
          message: "Auth user must not have email/phone",
        };
      }
      return {
        ok: true,
        user: {
          uid: user.uid,
          disabled: true,
          email: null,
          phoneNumber: null,
          displayName: null,
          photoURL: null,
        },
      };
    } catch (err) {
      return {
        ok: false,
        code: "AUTH_CREATE_FAILED",
        message: err instanceof Error ? err.message : "Auth create failed",
      };
    }
  }

  async getUser(uid: string): Promise<Phase5JAuthGetResult> {
    try {
      const user = await this.handles.auth.getUser(uid);
      return {
        ok: true,
        uid: user.uid,
        disabled: user.disabled,
        email: user.email ?? null,
        phoneNumber: user.phoneNumber ?? null,
        customClaims: { ...(user.customClaims ?? {}) },
      };
    } catch (err) {
      return {
        ok: false,
        code: "AUTH_GET_FAILED",
        message: err instanceof Error ? err.message : "getUser failed",
      };
    }
  }
}

export class FirebasePhase5JFirestorePort implements Phase5JFirestorePort {
  constructor(private readonly handles: AdminHandles) {}

  async verifyGeographyExists(): Promise<Phase5JGeoExistsResult> {
    const country = await this.handles.db.doc(PHASE_5I_FIXTURE_COUNTRY_PATH).get();
    const village = await this.handles.db.doc(PHASE_5I_FIXTURE_CITY_PATH).get();
    if (!country.exists || !village.exists) {
      return {
        ok: false,
        code: "GEOGRAPHY_MISSING",
        message: `${PHASE_5I_FIXTURE_COUNTRY_PATH} and ${PHASE_5I_FIXTURE_CITY_PATH} must exist (no geo create)`,
      };
    }
    return { ok: true, countryExists: true, villageExists: true };
  }

  async userDocExists(uid: string): Promise<boolean> {
    const snap = await this.handles.db.doc(`user/${uid}`).get();
    return snap.exists;
  }

  async createUserDoc(
    uid: string,
    doc: Phase5ISyntheticDriverFirestoreDoc,
  ): Promise<Phase5JFirestoreCreateResult> {
    const path = `user/${uid}`;
    try {
      const existing = await this.handles.db.doc(path).get();
      if (existing.exists) {
        return {
          ok: false,
          code: "FIXTURE_ALREADY_EXISTS",
          message: "user/{uid} already exists — create-only refuse",
        };
      }
      // Firestore create() is create-only (fails if exists).
      await this.handles.db.doc(path).create({
        ...(doc as unknown as Record<string, unknown>),
      });
      return { ok: true, path };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Firestore create failed";
      if (/already exists|ALREADY_EXISTS/i.test(msg)) {
        return {
          ok: false,
          code: "FIXTURE_ALREADY_EXISTS",
          message: "user/{uid} already exists — create-only refuse",
        };
      }
      return {
        ok: false,
        code: "FIRESTORE_CREATE_FAILED",
        message: msg,
      };
    }
  }

  async getUserDoc(
    uid: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; code: string; message: string }
  > {
    const snap = await this.handles.db.doc(`user/${uid}`).get();
    if (!snap.exists) {
      return { ok: false, code: "NOT_FOUND", message: "user doc missing" };
    }
    return { ok: true, data: { ...(snap.data() ?? {}) } };
  }
}

/**
 * Factory — only succeeds when gates open. Still does not provision by itself.
 */
export async function createFirebasePhase5JProvisioningPorts(input?: {
  gates?: Phase5JOperatorGateEnv;
}): Promise<{ auth: Phase5JAuthPort; firestore: Phase5JFirestorePort }> {
  const handles = await createPhase5JFirebaseAdminHandles(input);
  return {
    auth: new FirebasePhase5JAuthPort(handles),
    firestore: new FirebasePhase5JFirestorePort(handles),
  };
}
