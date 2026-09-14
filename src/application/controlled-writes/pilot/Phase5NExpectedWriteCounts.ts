/**
 * Phase 5N — bounded metadata write counts only.
 * Domain / Auth / Finance / Trip / Agent / Customer must stay 0.
 */

export type Phase5NExpectedWriteCounts = {
  readonly driverDomainWrites: 0;
  readonly auditIntentWrites: 0;
  readonly successAuditResultCreates: number;
  readonly idempotencyPatches: number;
  readonly authClaimWrites: 0;
  readonly financeWrites: 0;
  readonly tripWrites: 0;
  readonly agentWrites: 0;
  readonly customerWrites: 0;
  /** Sum of metadata-only writes (RESULT create + idempotency patch). */
  readonly metadataWrites: number;
};

export function buildPhase5NExpectedWriteCounts(input: {
  successAuditResultCreates: number;
  idempotencyPatches: number;
}): Phase5NExpectedWriteCounts {
  const successAuditResultCreates = Math.max(
    0,
    Math.floor(input.successAuditResultCreates),
  );
  const idempotencyPatches = Math.max(0, Math.floor(input.idempotencyPatches));
  return {
    driverDomainWrites: 0,
    auditIntentWrites: 0,
    successAuditResultCreates,
    idempotencyPatches,
    authClaimWrites: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
    metadataWrites: successAuditResultCreates + idempotencyPatches,
  };
}

export const PHASE_5N_ZERO_WRITE_COUNTS = buildPhase5NExpectedWriteCounts({
  successAuditResultCreates: 0,
  idempotencyPatches: 0,
});
