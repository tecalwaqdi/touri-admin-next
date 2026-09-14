/**
 * Phase 5J — injectable ports for Auth / Firestore / claim reads / geography / audit.
 * Real Firebase Admin adapters exist but are unreachable without all operator gates.
 */

import type { Phase5ISyntheticDriverFirestoreDoc } from "@/application/controlled-writes/pilot/Phase5ISyntheticDriverFirestoreSchema";

export type Phase5JAuthUserSafeSummary = {
  readonly uid: string;
  readonly disabled: true;
  readonly email: null;
  readonly phoneNumber: null;
  readonly displayName: null;
  readonly photoURL: null;
};

export type Phase5JAuthCreateResult =
  | { ok: true; user: Phase5JAuthUserSafeSummary }
  | { ok: false; code: string; message: string };

export type Phase5JAuthGetResult =
  | {
      ok: true;
      uid: string;
      disabled: boolean;
      email: string | null;
      phoneNumber: string | null;
      customClaims: Record<string, unknown>;
    }
  | { ok: false; code: string; message: string };

export type Phase5JFirestoreCreateResult =
  | { ok: true; path: string }
  | {
      ok: false;
      code: "FIXTURE_ALREADY_EXISTS" | "FIRESTORE_CREATE_FAILED" | string;
      message: string;
    };

export type Phase5JGeoExistsResult =
  | { ok: true; countryExists: true; villageExists: true }
  | { ok: false; code: "GEOGRAPHY_MISSING"; message: string };

export type Phase5JAuditRecord = {
  readonly kind: "intent" | "result";
  readonly requestId: string;
  readonly correlationId: string;
  readonly logicalFixtureName: string;
  readonly uid: string | null;
  readonly status: string;
  readonly outcome?: string;
  readonly code?: string;
  readonly createdAtUtc: string;
};

export interface Phase5JAuthPort {
  createDisabledSyntheticUser(): Promise<Phase5JAuthCreateResult>;
  getUser(uid: string): Promise<Phase5JAuthGetResult>;
}

export interface Phase5JFirestorePort {
  /** Create-only user/{uid}. Must refuse if exists (no merge/update/overwrite). */
  createUserDoc(
    uid: string,
    doc: Phase5ISyntheticDriverFirestoreDoc,
  ): Promise<Phase5JFirestoreCreateResult>;
  userDocExists(uid: string): Promise<boolean>;
  getUserDoc(
    uid: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; code: string; message: string }
  >;
  verifyGeographyExists(): Promise<Phase5JGeoExistsResult>;
}

export interface Phase5JAuditPort {
  recordIntent(record: Phase5JAuditRecord): Promise<void>;
  recordResult(record: Phase5JAuditRecord): Promise<void>;
}

/** Fail-closed audit when architecture cannot safely record. */
export class Phase5JFailClosedAuditPort implements Phase5JAuditPort {
  async recordIntent(): Promise<void> {
    throw new Error(
      "AUDIT_FAIL_CLOSED — intent audit required; no safe sink configured",
    );
  }
  async recordResult(): Promise<void> {
    throw new Error(
      "AUDIT_FAIL_CLOSED — result audit required; no safe sink configured",
    );
  }
}

export class Phase5JMemoryAuditPort implements Phase5JAuditPort {
  readonly intents: Phase5JAuditRecord[] = [];
  readonly results: Phase5JAuditRecord[] = [];

  async recordIntent(record: Phase5JAuditRecord): Promise<void> {
    this.intents.push(record);
  }

  async recordResult(record: Phase5JAuditRecord): Promise<void> {
    this.results.push(record);
  }
}
