/**
 * Phase 5I — exact expected write counts from design (code-backed).
 * This session (design/offline): all zeros.
 * Future operator provision WHEN gates open: counted below — NOT authorized now.
 */

export type Phase5IExpectedWriteCounts = {
  readonly authCreate: number;
  readonly firestoreUserCreates: number;
  readonly claimsSetCustomUserClaims: number;
  readonly auditWrites: number;
  readonly idempotencyWrites: number;
  readonly triggerInvocations: number;
  readonly financeWrites: number;
  readonly tripWrites: number;
  readonly agentWrites: number;
  readonly customerWrites: number;
};

/** Design / offline / dry-run session — Production/Auth/Finance/Trip = 0. */
export const PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION: Phase5IExpectedWriteCounts =
  {
    authCreate: 0,
    firestoreUserCreates: 0,
    claimsSetCustomUserClaims: 0,
    auditWrites: 0,
    idempotencyWrites: 0,
    triggerInvocations: 0,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
  };

/**
 * Hypothetical ONE successful Auth-safe provision (gates open + operator arm).
 * Derived from Functions path:
 * - authCreate 1 (Admin createUser)
 * - firestoreUserCreates 1 (user/{uid})
 * - triggerInvocations 1 (syncUserClaimsOnWrite)
 * - claimsSetCustomUserClaims 1 (inside trigger)
 * - auditWrites 2 (intent+result) if Admin Next audit used
 * - idempotencyWrites 1 (operator registry / idemp doc)
 * - finance/trip/agent/customer 0
 */
export const PHASE_5I_EXPECTED_WRITE_COUNTS_FUTURE_PROVISION: Phase5IExpectedWriteCounts =
  {
    authCreate: 1,
    firestoreUserCreates: 1,
    claimsSetCustomUserClaims: 1,
    auditWrites: 2,
    idempotencyWrites: 1,
    triggerInvocations: 1,
    financeWrites: 0,
    tripWrites: 0,
    agentWrites: 0,
    customerWrites: 0,
  };

/** Dry-run / provision arm with write gates still false — mutation refused. */
export const PHASE_5I_EXPECTED_WRITE_COUNTS_GATED_REFUSAL: Phase5IExpectedWriteCounts =
  PHASE_5I_EXPECTED_WRITE_COUNTS_DESIGN_SESSION;
