/**
 * Phase 5M — Production ADC adapters for controlled Pilot apply.
 * Unreachable unless Phase5M operator gates pass (caller must evaluate first).
 * ADC only — no SA JSON keys.
 *
 * Collections:
 * - user/{uid} — allowlisted update only (registration_status)
 * - admin_next_cw_audit/{auditId} — create INTENT/RESULT
 * - admin_next_cw_idempotency/{key} — create then update
 */

import {
  evaluatePhase5MOperatorGates,
  type Phase5MOperatorGateEnv,
} from "@/application/controlled-writes/pilot/Phase5MOperatorGates";
import {
  PHASE_5M_AUDIT_COLLECTION,
  PHASE_5M_DRIVER_COLLECTION,
  PHASE_5M_IDEMPOTENCY_COLLECTION,
} from "@/application/controlled-writes/pilot/Phase5MIamDerivation";
import {
  PHASE_5M_EXPECTED_PROJECT_ID,
} from "@/application/controlled-writes/pilot/isPhase5MDriverPilotApplyEnabled";
import {
  buildNeedsChangesAllowlistedPatch,
} from "@/application/controlled-writes/pilot/Phase5EDriverPilotDiffContract";
import { evaluatePhase5MExactDomainDiff } from "@/application/controlled-writes/pilot/Phase5MExactDomainDiff";
import {
  createPhase5MWriteCounter,
  type Phase5MApplyPorts,
  type Phase5MWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5MApplyPorts";
import type {
  DriverWriteAuditIntent,
  DriverWriteAuditPort,
  DriverWriteAuditResult,
} from "@/application/controlled-writes/drivers/DriverWriteAudit";
import type {
  DriverWriteIdempotencyRecord,
  DriverWriteIdempotencyStore,
} from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import type { DriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import type {
  DriverWriteApplyInput,
  DriverWriteApplyResult,
  DriverWriteSnapshot,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";
import { omitUndefinedDeep } from "@/application/controlled-writes/omitUndefinedForFirestore";
import { withPhase5MStagePermissionDenied } from "@/application/controlled-writes/pilot/Phase5MPermissionDeniedClassification";
import { ApplicationDefaultProductionCredentialProvider } from "@/infrastructure/production/credentials/ProductionCredentialProvider";
import { PHASE_5I_FIXTURE_COUNTRY_ID } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import type { Phase5KAuthUserRecord } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";

/** Build Firestore create/set payload — omit undefined; never enable ignoreUndefinedProperties. */
export function phase5MFirestoreWritePayload(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return omitUndefinedDeep(data) as Record<string, unknown>;
}

/** Default Firestore database id for Admin SDK (no named DB). */
export const PHASE_5M_FIRESTORE_DATABASE_ID = "(default)" as const;
/** Named Admin app — shared by audit / driver / idempotency (ADC only). */
export const PHASE_5M_FIREBASE_ADMIN_APP_NAME =
  "phase5m-driver-pilot-apply" as const;

export class Phase5MFirebaseAdaptersUnreachableError extends Error {
  readonly code = "PHASE5M_FIREBASE_ADAPTERS_UNREACHABLE";
  constructor(message: string) {
    super(message);
    this.name = "Phase5MFirebaseAdaptersUnreachableError";
  }
}

type FirestoreLike = {
  doc: (path: string) => {
    get: () => Promise<{
      exists: boolean;
      data: () => Record<string, unknown> | undefined;
      updateTime?: { toDate?: () => Date; toString?: () => string };
    }>;
    create: (data: Record<string, unknown>) => Promise<void>;
    set: (
      data: Record<string, unknown>,
      opts?: { merge?: boolean },
    ) => Promise<void>;
  };
  runTransaction: <T>(
    fn: (tx: {
      get: (ref: { path: string }) => Promise<{
        exists: boolean;
        data: () => Record<string, unknown> | undefined;
        updateTime?: { toDate?: () => Date; toString?: () => string };
      }>;
      update: (ref: { path: string }, data: Record<string, unknown>) => void;
    }) => Promise<T>,
  ) => Promise<T>;
};

type AuthLike = {
  getUser: (uid: string) => Promise<{
    uid: string;
    disabled: boolean;
    email?: string;
    phoneNumber?: string;
    displayName?: string;
    photoURL?: string;
    customClaims?: Record<string, unknown>;
    providerData?: unknown[];
  }>;
};

type AdminHandles = {
  auth: AuthLike;
  db: FirestoreLike;
};

function tokenFromSnap(snap: {
  exists: boolean;
  updateTime?: { toDate?: () => Date; toString?: () => string };
  uidHint?: string;
}): string | null {
  if (!snap.exists) return null;
  const updateTime =
    snap.updateTime?.toDate?.()?.toISOString?.() ??
    snap.updateTime?.toString?.() ??
    null;
  if (updateTime) return `fs_ut_${updateTime}`;
  return snap.uidHint ? `fs_exists_${snap.uidHint.slice(0, 8)}` : "fs_exists";
}

export async function createPhase5MFirebaseAdminHandles(input?: {
  gates?: Phase5MOperatorGateEnv;
  projectId?: string;
}): Promise<AdminHandles> {
  const gates = evaluatePhase5MOperatorGates(input?.gates);
  if (!gates.ok) {
    throw new Phase5MFirebaseAdaptersUnreachableError(
      `Firebase adapters unreachable: ${gates.code} — ${gates.message}`,
    );
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    throw new Phase5MFirebaseAdaptersUnreachableError(
      "SA JSON keys forbidden — unset GOOGLE_APPLICATION_CREDENTIALS",
    );
  }

  const projectId = input?.projectId ?? PHASE_5M_EXPECTED_PROJECT_ID;
  const creds =
    await new ApplicationDefaultProductionCredentialProvider(
      projectId,
    ).getCredentials();
  if (creds.kind !== "application_default") {
    throw new Phase5MFirebaseAdaptersUnreachableError(
      "Only application_default credentials allowed",
    );
  }

  const admin = await import("firebase-admin");
  const appName = PHASE_5M_FIREBASE_ADMIN_APP_NAME;
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
  // Explicit (default) database — Admin SDK IAM path (not client Security Rules).
  const db = admin.firestore(app);
  void PHASE_5M_FIRESTORE_DATABASE_ID;

  return {
    auth: {
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
              updateTime: snap.updateTime,
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
      runTransaction: (fn) =>
        db.runTransaction(async (tx) => {
          return fn({
            get: async (ref) => {
              const snap = await tx.get(db.doc(ref.path));
              return {
                exists: snap.exists,
                data: () => snap.data() as Record<string, unknown> | undefined,
                updateTime: snap.updateTime,
              };
            },
            update: (ref, data) => {
              tx.update(db.doc(ref.path), data);
            },
          });
        }),
    },
  };
}

function snapshotFromDoc(input: {
  driverId: string;
  data: Record<string, unknown>;
  preconditionToken: string;
}): DriverWriteSnapshot {
  const status = String(input.data.registration_status ?? "unknown");
  return {
    driverId: input.driverId,
    exists: true,
    isOperationalDriver: input.data.ismndob === true,
    registrationStatus: status as DriverWriteSnapshot["registrationStatus"],
    accountEnabled: input.data.actev_mndob === true ? "enabled" : "disabled",
    complianceStatus: "unknown",
    tripState: input.data.on_trip === true ? "busy" : "idle",
    countryId: PHASE_5I_FIXTURE_COUNTRY_ID,
    countryScopeKind: "mapped",
    preconditionToken: input.preconditionToken,
  };
}

/**
 * Production controlled Driver write repository — Phase 5M Pilot only.
 * Allowlisted patch + transaction precondition. Fail-closed on diff violation.
 */
export class Phase5MControlledDriverWriteRepository
  implements DriverWriteRepository
{
  readonly kind = "phase5m_pilot_production_driver_write" as const;
  readonly applied: DriverWriteApplyResult[] = [];

  constructor(
    private readonly db: FirestoreLike,
    private readonly counter: Phase5MWriteCounter,
  ) {}

  async apply(input: DriverWriteApplyInput): Promise<DriverWriteApplyResult> {
    if (input.command.action !== "needs_changes") {
      throw new DriverWriteError(
        "VALIDATION_FAILED",
        "Phase 5M Pilot only allows needs_changes",
      );
    }
    const patch = buildNeedsChangesAllowlistedPatch();
    const diff = evaluatePhase5MExactDomainDiff({
      patch: patch as unknown as Record<string, unknown>,
    });
    if (!diff.ok) {
      throw new DriverWriteError("VALIDATION_FAILED", diff.message);
    }

    const path = `${PHASE_5M_DRIVER_COLLECTION}/${input.command.driverId}`;
    const expectedToken = input.command.preconditionToken;

    const result = await withPhase5MStagePermissionDenied(
      "DRIVER_DOMAIN",
      async () => {
        return this.db.runTransaction(async (tx) => {
          const snap = await tx.get({ path });
          if (!snap.exists) {
            throw new DriverWriteError(
              "DRIVER_NOT_FOUND",
              `Driver ${input.command.driverId} not found at apply`,
            );
          }
          const data = (snap.data() ?? {}) as Record<string, unknown>;
          const currentToken = tokenFromSnap({
            exists: true,
            updateTime: snap.updateTime,
            uidHint: input.command.driverId,
          });
          if (!currentToken || currentToken !== expectedToken) {
            throw new DriverWriteError(
              "PRECONDITION_FAILED",
              "Concurrency token mismatch at Phase 5M apply",
            );
          }
          if (data.registration_status !== input.fromState) {
            throw new DriverWriteError(
              "PRECONDITION_FAILED",
              "fromState mismatch at Phase 5M apply",
            );
          }
          // Allowlisted update only — never spread arbitrary payload.
          tx.update({ path }, { registration_status: "needs_changes" });
          return {
            driverId: input.command.driverId,
            fromState: input.fromState,
            toState: input.toState,
            preconditionTokenAfter: `fs_ut_rotated_${Date.now().toString(36)}`,
            appliedAtUtc: new Date().toISOString(),
          } satisfies DriverWriteApplyResult;
        });
      },
    );

    this.counter.driverDomainWrites += 1;
    this.applied.push(result);
    return result;
  }
}

class Phase5MFirestoreAuditPort implements DriverWriteAuditPort {
  constructor(
    private readonly db: FirestoreLike,
    private readonly counter: Phase5MWriteCounter,
  ) {}

  async recordIntent(intent: DriverWriteAuditIntent): Promise<void> {
    const path = `${PHASE_5M_AUDIT_COLLECTION}/${intent.auditId}`;
    await withPhase5MStagePermissionDenied("AUDIT_INTENT", async () => {
      await this.db.doc(path).create(
        phase5MFirestoreWritePayload({
          ...intent,
          phase: "5M",
        }),
      );
    });
    this.counter.auditIntentWrites += 1;
  }

  async recordResult(result: DriverWriteAuditResult): Promise<void> {
    const path = `${PHASE_5M_AUDIT_COLLECTION}/${result.auditId}`;
    await withPhase5MStagePermissionDenied("AUDIT_RESULT", async () => {
      await this.db.doc(path).create(
        phase5MFirestoreWritePayload({
          ...result,
          phase: "5M",
        }),
      );
    });
    this.counter.auditResultWrites += 1;
  }
}

class Phase5MFirestoreIdempotencyStore implements DriverWriteIdempotencyStore {
  private putCount = 0;
  constructor(
    private readonly db: FirestoreLike,
    private readonly counter: Phase5MWriteCounter,
  ) {}

  async get(key: string): Promise<DriverWriteIdempotencyRecord | null> {
    const path = `${PHASE_5M_IDEMPOTENCY_COLLECTION}/${key}`;
    return withPhase5MStagePermissionDenied("IDEMPOTENCY", async () => {
      const snap = await this.db.doc(path).get();
      if (!snap.exists) return null;
      return snap.data() as unknown as DriverWriteIdempotencyRecord;
    });
  }

  async put(record: DriverWriteIdempotencyRecord): Promise<void> {
    const path = `${PHASE_5M_IDEMPOTENCY_COLLECTION}/${record.key}`;
    this.putCount += 1;
    await withPhase5MStagePermissionDenied("IDEMPOTENCY", async () => {
      const payload = phase5MFirestoreWritePayload({
        ...record,
        phase: "5M",
      });
      if (this.putCount === 1) {
        await this.db.doc(path).create(payload);
        this.counter.idempotencyWrites += 1;
      } else {
        await this.db.doc(path).set(payload, { merge: true });
      }
    });
  }
}

/**
 * Construct Production apply ports. Throws if gates incomplete.
 * Does not mutate by itself.
 */
export async function createPhase5MProductionApplyPorts(input?: {
  gates?: Phase5MOperatorGateEnv;
  projectId?: string;
  counter?: Phase5MWriteCounter;
}): Promise<Phase5MApplyPorts> {
  const handles = await createPhase5MFirebaseAdminHandles(input);
  const counter = input?.counter ?? createPhase5MWriteCounter();

  const auth = {
    async getUser(uid: string): Promise<Phase5KAuthUserRecord | null> {
      counter.productionReads += 1;
      try {
        const user = await handles.auth.getUser(uid);
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
  };

  const firestore = {
    async getUserDoc(uid: string) {
      counter.productionReads += 1;
      const snap = await handles.db
        .doc(`${PHASE_5M_DRIVER_COLLECTION}/${uid}`)
        .get();
      if (!snap.exists) {
        return { exists: false, data: null, preconditionToken: null };
      }
      return {
        exists: true,
        data: (snap.data() ?? {}) as Record<string, unknown>,
        preconditionToken: tokenFromSnap({
          exists: true,
          updateTime: snap.updateTime,
          uidHint: uid,
        }),
      };
    },
  };

  const repository = new Phase5MControlledDriverWriteRepository(
    handles.db,
    counter,
  );

  const loadPort: DriverWriteLoadPort = {
    async loadForWrite(driverId: string) {
      const doc = await firestore.getUserDoc(driverId);
      if (!doc.exists || !doc.data || !doc.preconditionToken) return null;
      return snapshotFromDoc({
        driverId,
        data: doc.data,
        preconditionToken: doc.preconditionToken,
      });
    },
  };

  return {
    auth,
    firestore,
    loadPort,
    repository,
    idempotency: new Phase5MFirestoreIdempotencyStore(handles.db, counter),
    audit: new Phase5MFirestoreAuditPort(handles.db, counter),
    counter,
  };
}
