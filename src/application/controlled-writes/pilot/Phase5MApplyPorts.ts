/**
 * Phase 5M — injectable ports for controlled Pilot apply.
 * Domain mutation ONLY via DriverWriteRepository.apply (allowlisted).
 * Audit / idempotency are fail-closed Firestore surfaces.
 */

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
import type { DriverWriteSnapshot } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import type { Phase5KAuthUserRecord } from "@/application/controlled-writes/pilot/Phase5KAuthVerification";

export type Phase5MWriteCounter = {
  driverDomainWrites: number;
  auditIntentWrites: number;
  auditResultWrites: number;
  idempotencyWrites: number;
  /** Logical Auth claim writes observed / expected from CF (not operator ADC). */
  authClaimWrites: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
  productionReads: number;
};

export function createPhase5MWriteCounter(): Phase5MWriteCounter {
  return {
    driverDomainWrites: 0,
    auditIntentWrites: 0,
    auditResultWrites: 0,
    idempotencyWrites: 0,
    authClaimWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    productionReads: 0,
  };
}

export type Phase5MAuthPort = {
  getUser(uid: string): Promise<Phase5KAuthUserRecord | null>;
};

export type Phase5MFirestoreReadPort = {
  getUserDoc(uid: string): Promise<{
    exists: boolean;
    data: Record<string, unknown> | null;
    preconditionToken: string | null;
  }>;
};

export type Phase5MApplyPorts = {
  auth: Phase5MAuthPort;
  firestore: Phase5MFirestoreReadPort;
  loadPort: DriverWriteLoadPort;
  repository: DriverWriteRepository;
  idempotency: DriverWriteIdempotencyStore;
  audit: DriverWriteAuditPort;
  counter: Phase5MWriteCounter;
};

export type Phase5MSnapshotSeed = DriverWriteSnapshot;

export type {
  DriverWriteAuditIntent,
  DriverWriteAuditResult,
  DriverWriteIdempotencyRecord,
};
