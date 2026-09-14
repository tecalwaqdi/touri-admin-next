/**
 * Phase 5N — narrow metadata write ports + counters.
 * ONLY success AUDIT_RESULT create + idempotency result.auditResultId patch.
 * Never Driver / Auth / Finance / Trip / Agent / Customer.
 */

export type Phase5NWriteCounter = {
  successAuditResultCreates: number;
  idempotencyPatches: number;
  driverDomainWrites: number;
  authClaimWrites: number;
  financeWrites: number;
  tripWrites: number;
  agentWrites: number;
  customerWrites: number;
  productionReads: number;
};

export function createPhase5NWriteCounter(
  overrides?: Partial<Phase5NWriteCounter>,
): Phase5NWriteCounter {
  return {
    successAuditResultCreates: 0,
    idempotencyPatches: 0,
    driverDomainWrites: 0,
    authClaimWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    productionReads: 0,
    ...overrides,
  };
}

export function phase5NMetadataWritesFromCounter(
  counter: Phase5NWriteCounter,
): number {
  return counter.successAuditResultCreates + counter.idempotencyPatches;
}

export function phase5NForbiddenWritesZero(
  counter: Phase5NWriteCounter,
): boolean {
  return (
    counter.driverDomainWrites === 0 &&
    counter.authClaimWrites === 0 &&
    counter.financeWrites === 0 &&
    counter.tripWrites === 0 &&
    counter.agentWrites === 0 &&
    counter.customerWrites === 0
  );
}

/**
 * Narrow write surface — create-only RESULT + min idempotency patch.
 * Implementations MUST NOT expose Driver/Auth/domain mutators.
 */
export type Phase5NMetadataWritePort = {
  createSuccessAuditResult(input: {
    documentId: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  /**
   * set(merge) ONLY `{ result: { auditResultId } }` on existing idempotency doc.
   * Must not rewrite / normalize other fields.
   */
  patchIdempotencyAuditResultId(input: {
    key: string;
    auditResultId: string;
  }): Promise<void>;
};

export type Phase5NApplyPorts = {
  readonly read: import("@/application/controlled-writes/pilot/Phase5NReadOnlyMetadataPorts").Phase5NMetadataReadPort;
  readonly write: Phase5NMetadataWritePort;
  readonly counter: Phase5NWriteCounter;
};
