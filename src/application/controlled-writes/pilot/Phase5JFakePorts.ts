/**
 * Phase 5J — in-memory fake Auth/Firestore ports for unit tests.
 * No real Firebase. No Production calls.
 */

import type { Phase5ISyntheticDriverFirestoreDoc } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";
import type {
  Phase5JAuthCreateResult,
  Phase5JAuthGetResult,
  Phase5JAuthPort,
  Phase5JFirestoreCreateResult,
  Phase5JFirestorePort,
  Phase5JGeoExistsResult,
} from "@/application/controlled-writes/pilot/Phase5JProvisioningPorts";
import { PHASE_5I_EXPECTED_CUSTOM_CLAIMS } from "@/application/controlled-writes/pilot/Phase5IClaimsAnalysis";

export type FakePhase5JAuthBehavior = {
  failCreate?: boolean;
  createCode?: string;
  /** Claims returned by getUser after N calls (1-based). */
  claimsByAttempt?: Record<number, Record<string, unknown>>;
  /** Fixed claims once "synced". */
  syncedClaims?: Record<string, unknown>;
  syncAfterAttempts?: number;
  disabled?: boolean;
  email?: string | null;
  phoneNumber?: string | null;
};

export class FakePhase5JAuthPort implements Phase5JAuthPort {
  createCalls = 0;
  getUserCalls = 0;
  lastCreatedUid: string | null = null;
  private users = new Map<
    string,
    {
      disabled: boolean;
      email: string | null;
      phoneNumber: string | null;
      customClaims: Record<string, unknown>;
    }
  >();

  constructor(private readonly behavior: FakePhase5JAuthBehavior = {}) {}

  seedUser(
    uid: string,
    data: {
      disabled?: boolean;
      email?: string | null;
      phoneNumber?: string | null;
      customClaims?: Record<string, unknown>;
    },
  ): void {
    this.users.set(uid, {
      disabled: data.disabled ?? true,
      email: data.email ?? null,
      phoneNumber: data.phoneNumber ?? null,
      customClaims: data.customClaims ?? {},
    });
  }

  async createDisabledSyntheticUser(): Promise<Phase5JAuthCreateResult> {
    this.createCalls += 1;
    if (this.behavior.failCreate) {
      return {
        ok: false,
        code: this.behavior.createCode ?? "AUTH_CREATE_FAILED",
        message: "Fake Auth create failed",
      };
    }
    const uid = `fake_uid_${this.createCalls}_${Math.random().toString(36).slice(2, 10)}`;
    this.lastCreatedUid = uid;
    this.users.set(uid, {
      disabled: this.behavior.disabled ?? true,
      email: this.behavior.email ?? null,
      phoneNumber: this.behavior.phoneNumber ?? null,
      customClaims: {},
    });
    return {
      ok: true,
      user: {
        uid,
        disabled: true,
        email: null,
        phoneNumber: null,
        displayName: null,
        photoURL: null,
      },
    };
  }

  async getUser(uid: string): Promise<Phase5JAuthGetResult> {
    this.getUserCalls += 1;
    const u = this.users.get(uid);
    if (!u) {
      return { ok: false, code: "AUTH_USER_NOT_FOUND", message: "not found" };
    }

    let claims = u.customClaims;
    const byAttempt = this.behavior.claimsByAttempt?.[this.getUserCalls];
    if (byAttempt) {
      claims = byAttempt;
      u.customClaims = byAttempt;
    } else if (
      this.behavior.syncedClaims &&
      this.getUserCalls >= (this.behavior.syncAfterAttempts ?? 1)
    ) {
      claims = this.behavior.syncedClaims;
      u.customClaims = claims;
    }

    return {
      ok: true,
      uid,
      disabled: u.disabled,
      email: u.email,
      phoneNumber: u.phoneNumber,
      customClaims: { ...claims },
    };
  }

  /** Test helper — simulate trigger setCustomUserClaims. */
  setClaims(uid: string, claims: Record<string, unknown>): void {
    const u = this.users.get(uid);
    if (u) u.customClaims = claims;
  }
}

export type FakePhase5JFirestoreBehavior = {
  failCreate?: boolean;
  alreadyExists?: boolean;
  geographyMissing?: boolean;
  /** Override stored doc for canonical fail scenarios. */
  mutateStoredDoc?: (doc: Record<string, unknown>) => Record<string, unknown>;
};

export class FakePhase5JFirestorePort implements Phase5JFirestorePort {
  createCalls = 0;
  docs = new Map<string, Record<string, unknown>>();

  constructor(private readonly behavior: FakePhase5JFirestoreBehavior = {}) {}

  async verifyGeographyExists(): Promise<Phase5JGeoExistsResult> {
    if (this.behavior.geographyMissing) {
      return {
        ok: false,
        code: "GEOGRAPHY_MISSING",
        message: "countries/saudi_arabia or villages/city_sa_riyadh missing",
      };
    }
    return { ok: true, countryExists: true, villageExists: true };
  }

  async userDocExists(uid: string): Promise<boolean> {
    return this.docs.has(uid);
  }

  async createUserDoc(
    uid: string,
    doc: Phase5ISyntheticDriverFirestoreDoc,
  ): Promise<Phase5JFirestoreCreateResult> {
    this.createCalls += 1;
    if (this.behavior.alreadyExists || this.docs.has(uid)) {
      return {
        ok: false,
        code: "FIXTURE_ALREADY_EXISTS",
        message: "user/{uid} already exists — create-only refuse",
      };
    }
    if (this.behavior.failCreate) {
      return {
        ok: false,
        code: "FIRESTORE_CREATE_FAILED",
        message: "Fake Firestore create failed",
      };
    }
    let stored = { ...(doc as unknown as Record<string, unknown>) };
    if (this.behavior.mutateStoredDoc) {
      stored = this.behavior.mutateStoredDoc(stored);
    }
    this.docs.set(uid, stored);
    return { ok: true, path: `user/${uid}` };
  }

  async getUserDoc(
    uid: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; code: string; message: string }
  > {
    const data = this.docs.get(uid);
    if (!data) {
      return { ok: false, code: "NOT_FOUND", message: "missing" };
    }
    return { ok: true, data: { ...data } };
  }
}

/** Happy-path fakes: Auth create + claims sync to expected country_id. */
export function createHappyPathPhase5JFakes(): {
  auth: FakePhase5JAuthPort;
  firestore: FakePhase5JFirestorePort;
} {
  return {
    auth: new FakePhase5JAuthPort({
      syncedClaims: { ...PHASE_5I_EXPECTED_CUSTOM_CLAIMS },
      syncAfterAttempts: 1,
    }),
    firestore: new FakePhase5JFirestorePort(),
  };
}
