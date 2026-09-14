/**
 * Phase 5M — Fake/offline ports for unit tests.
 * Never touches Firebase. Counts writes for exact-count assertions.
 */

import {
  InMemoryDriverWriteAuditPort,
  type DriverWriteAuditIntent,
  type DriverWriteAuditResult,
} from "@/application/controlled-writes/drivers/DriverWriteAudit";
import {
  InMemoryDriverWriteIdempotencyStore,
  type DriverWriteIdempotencyRecord,
} from "@/application/controlled-writes/drivers/DriverWriteIdempotency";
import { FakeDriverWriteRepository } from "@/application/controlled-writes/drivers/DriverWriteRepository";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";
import type { DriverWriteLoadPort } from "@/application/controlled-writes/drivers/DriverWritePreconditions";
import type { DriverWriteSnapshot } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { Phase5KAuthUserRecord } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";
import { PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import {
  createPhase5MWriteCounter,
  type Phase5MApplyPorts,
  type Phase5MAuthPort,
  type Phase5MFirestoreReadPort,
  type Phase5MWriteCounter,
} from "@/application/controlled-writes/pilot/Phase5MApplyPorts";

export type Phase5MFakePortsOptions = {
  uid: string;
  /** Override Firestore doc fields. */
  firestoreData?: Record<string, unknown>;
  preconditionToken?: string | null;
  authUser?: Phase5KAuthUserRecord | null;
  /** Seed Fake repository snapshot (required for apply path). */
  snapshot?: DriverWriteSnapshot;
  /** Force audit.recordIntent to throw. */
  failAuditIntent?: boolean;
  /** Force audit.recordResult to throw after domain apply. */
  failAuditResult?: boolean;
  /** Stage-scoped Admin SDK IAM denial simulation (no later writes). */
  failAuditIntentPermissionDenied?: boolean;
  failDriverDomainPermissionDenied?: boolean;
  /** Deny on idempotency GET (pipeline check) — no writes. */
  failIdempotencyGetPermissionDenied?: boolean;
  /** Deny on idempotency PUT after domain — domain may have committed in Fake. */
  failIdempotencyPutPermissionDenied?: boolean;
  failAuditResultPermissionDenied?: boolean;
  /** Pre-seed idempotency record (PILOT_ALREADY_APPLIED / replay). */
  existingIdempotency?: DriverWriteIdempotencyRecord | null;
};

class CountingAuditPort extends InMemoryDriverWriteAuditPort {
  constructor(
    private readonly counter: Phase5MWriteCounter,
    private readonly opts: {
      failIntent?: boolean;
      failResult?: boolean;
      failIntentPermissionDenied?: boolean;
      failResultPermissionDenied?: boolean;
    },
  ) {
    super();
  }

  override async recordIntent(intent: DriverWriteAuditIntent): Promise<void> {
    if (this.opts.failIntentPermissionDenied) {
      throw new DriverWriteError(
        "AUDIT_INTENT_PERMISSION_DENIED",
        "AUDIT_INTENT_PERMISSION_DENIED: gRPC 7 PERMISSION_DENIED (Firebase Admin SDK → IAM; not Security Rules)",
      );
    }
    if (this.opts.failIntent) {
      throw new Error("AUDIT_INTENT_FAILED");
    }
    this.counter.auditIntentWrites += 1;
    return super.recordIntent(intent);
  }

  override async recordResult(result: DriverWriteAuditResult): Promise<void> {
    if (this.opts.failResultPermissionDenied) {
      throw new DriverWriteError(
        "AUDIT_RESULT_PERMISSION_DENIED",
        "AUDIT_RESULT_PERMISSION_DENIED: gRPC 7 PERMISSION_DENIED (Firebase Admin SDK → IAM; not Security Rules)",
      );
    }
    if (this.opts.failResult) {
      throw new Error("AUDIT_RESULT_FAILED");
    }
    this.counter.auditResultWrites += 1;
    return super.recordResult(result);
  }
}

class CountingIdempotencyStore extends InMemoryDriverWriteIdempotencyStore {
  private pendingSeed: DriverWriteIdempotencyRecord | null;
  constructor(
    private readonly counter: Phase5MWriteCounter,
    existing?: DriverWriteIdempotencyRecord | null,
    private readonly failGetPermissionDenied?: boolean,
    private readonly failPutPermissionDenied?: boolean,
  ) {
    super();
    this.pendingSeed = existing ?? null;
  }

  override async get(key: string): Promise<DriverWriteIdempotencyRecord | null> {
    if (this.failGetPermissionDenied) {
      throw new DriverWriteError(
        "IDEMPOTENCY_PERMISSION_DENIED",
        "IDEMPOTENCY_PERMISSION_DENIED: gRPC 7 PERMISSION_DENIED (Firebase Admin SDK → IAM; not Security Rules)",
      );
    }
    if (this.pendingSeed && this.pendingSeed.key === key) {
      await super.put(this.pendingSeed);
      this.pendingSeed = null;
    }
    return super.get(key);
  }

  override async put(record: DriverWriteIdempotencyRecord): Promise<void> {
    if (this.failPutPermissionDenied) {
      throw new DriverWriteError(
        "IDEMPOTENCY_PERMISSION_DENIED",
        "IDEMPOTENCY_PERMISSION_DENIED: gRPC 7 PERMISSION_DENIED (Firebase Admin SDK → IAM; not Security Rules)",
      );
    }
    await super.put(record);
    // Logical idempotency write surface counted once per Pilot apply.
    if (this.counter.idempotencyWrites === 0) {
      this.counter.idempotencyWrites = 1;
    }
  }
}

class CountingFakeRepository extends FakeDriverWriteRepository {
  constructor(
    private readonly counter: Phase5MWriteCounter,
    private readonly failPermissionDenied?: boolean,
  ) {
    super();
  }

  override async apply(
    input: Parameters<FakeDriverWriteRepository["apply"]>[0],
  ): Promise<Awaited<ReturnType<FakeDriverWriteRepository["apply"]>>> {
    if (this.failPermissionDenied) {
      throw new DriverWriteError(
        "DRIVER_DOMAIN_PERMISSION_DENIED",
        "DRIVER_DOMAIN_PERMISSION_DENIED: gRPC 7 PERMISSION_DENIED (Firebase Admin SDK → IAM; not Security Rules)",
      );
    }
    const result = await super.apply(input);
    this.counter.driverDomainWrites += 1;
    // CF side-effect expectation after successful domain update.
    this.counter.authClaimWrites += 1;
    return result;
  }
}

export function createPhase5MFakeApplyPorts(
  opts: Phase5MFakePortsOptions,
): Phase5MApplyPorts & { fakeRepo: CountingFakeRepository } {
  const counter = createPhase5MWriteCounter();
  const data = {
    ...(PHASE_5I_SYNTHETIC_DRIVER_FIRESTORE_DOC as unknown as Record<
      string,
      unknown
    >),
    ...(opts.firestoreData ?? {}),
  };
  const token =
    opts.preconditionToken === undefined
      ? "tok_phase5m_offline"
      : opts.preconditionToken;

  const authUser: Phase5KAuthUserRecord | null =
    opts.authUser === undefined
      ? {
          uid: opts.uid,
          disabled: true,
          email: null,
          phoneNumber: null,
          displayName: null,
          photoURL: null,
          customClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
          providerDataCount: 0,
        }
      : opts.authUser;

  const auth: Phase5MAuthPort = {
    async getUser(uid: string) {
      counter.productionReads += 1;
      if (!authUser || authUser.uid !== uid) return null;
      return { ...authUser, customClaims: { ...authUser.customClaims } };
    },
  };

  const fakeRepo = new CountingFakeRepository(
    counter,
    opts.failDriverDomainPermissionDenied,
  );
  const snapshot: DriverWriteSnapshot =
    opts.snapshot ??
    ({
      driverId: opts.uid,
      exists: true,
      isOperationalDriver: true,
      registrationStatus: "pending_review",
      accountEnabled: "disabled",
      complianceStatus: "unknown",
      tripState: "idle",
      countryId: "saudi_arabia",
      countryScopeKind: "mapped",
      preconditionToken: token ?? "tok_phase5m_offline",
    } satisfies DriverWriteSnapshot);
  fakeRepo.seed(snapshot);

  const firestore: Phase5MFirestoreReadPort = {
    async getUserDoc(uid: string) {
      counter.productionReads += 1;
      if (uid !== opts.uid) {
        return { exists: false, data: null, preconditionToken: null };
      }
      const live = fakeRepo.get(uid);
      const status =
        live?.registrationStatus ??
        (typeof data.registration_status === "string"
          ? data.registration_status
          : "pending_review");
      return {
        exists: true,
        data: {
          ...data,
          registration_status: status,
          actev_mndob: live?.accountEnabled === "enabled",
          on_trip: live?.tripState === "busy",
        },
        preconditionToken: live?.preconditionToken ?? token,
      };
    },
  };

  const loadPort: DriverWriteLoadPort = {
    async loadForWrite(driverId: string) {
      counter.productionReads += 1;
      return fakeRepo.get(driverId) ?? null;
    },
  };

  const idempotency = new CountingIdempotencyStore(
    counter,
    opts.existingIdempotency,
    opts.failIdempotencyGetPermissionDenied,
    opts.failIdempotencyPutPermissionDenied,
  );

  const audit = new CountingAuditPort(counter, {
    failIntent: opts.failAuditIntent,
    failResult: opts.failAuditResult,
    failIntentPermissionDenied: opts.failAuditIntentPermissionDenied,
    failResultPermissionDenied: opts.failAuditResultPermissionDenied,
  });

  return {
    auth,
    firestore,
    loadPort,
    repository: fakeRepo,
    idempotency,
    audit,
    counter,
    fakeRepo,
  };
}
