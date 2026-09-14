/**
 * Phase 5N — offline fixtures mirroring known Phase 5M Production metadata.
 */

import {
  PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
  PHASE_5N_ORIGINAL_CORRELATION_ID,
  PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
  PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
} from "@/application/controlled-writes/pilot/Phase5NConstants";
import type { Phase5NObservedMetadata } from "@/application/controlled-writes/pilot/Phase5NObservedMetadata";

const DRIVER_ID = "driver_fixture_uid";

export function phase5NFixtureProductionIncomplete(): Phase5NObservedMetadata {
  return {
    driverState: "needs_changes",
    driverExists: true,
    auditIntent: {
      auditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
      kind: "AUDIT_INTENT",
      action: "needs_changes",
      driverId: DRIVER_ID,
      countryId: "saudi_arabia",
      fromState: "pending_review",
      toState: "needs_changes",
      reasonCode: "missing_document",
      idempotencyKey: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
      correlationId: PHASE_5N_ORIGINAL_CORRELATION_ID,
      phase: "5M",
      createdAtUtc: "2026-09-13T03:54:44.074Z",
    },
    auditResults: [
      {
        auditId: PHASE_5N_KNOWN_FAILURE_RESULT_AUDIT_ID,
        kind: "AUDIT_RESULT",
        intentAuditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
        outcome: "failed",
        code: "INTERNAL_WRITE_FAILURE",
        action: "needs_changes",
        driverId: DRIVER_ID,
        countryId: "saudi_arabia",
        fromState: "pending_review",
        toState: "needs_changes",
        idempotencyKey: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
        correlationId: PHASE_5N_ORIGINAL_CORRELATION_ID,
        phase: "5M",
        createdAtUtc: "2026-09-13T03:54:46.663Z",
      },
    ],
    idempotency: {
      key: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
      fingerprint:
        "driver|needs_changes|driver_fixture_uid|pending_review|fs_ut_tok|missing_document|",
      result: {
        ok: true,
        status: "applied",
        action: "needs_changes",
        driverId: DRIVER_ID,
        fromState: "pending_review",
        toState: "needs_changes",
        auditIntentId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
        auditResultId: "",
        productionWriteExecuted: false,
      },
      phase: "5M",
      createdAtUtc: "2026-09-13T03:54:46.123Z",
    },
    auth: {
      exists: true,
      disabled: true,
      claimsKeys: ["country_id"],
      countryIdClaimPresent: true,
    },
  };
}

export function phase5NFixtureAlreadyComplete(
  successAuditId = "dwr_success_complete",
): Phase5NObservedMetadata {
  const base = phase5NFixtureProductionIncomplete();
  return {
    ...base,
    auditResults: [
      ...base.auditResults,
      {
        auditId: successAuditId,
        kind: "AUDIT_RESULT",
        intentAuditId: PHASE_5N_ORIGINAL_INTENT_AUDIT_ID,
        outcome: "applied",
        action: "needs_changes",
        driverId: DRIVER_ID,
        countryId: "saudi_arabia",
        fromState: "pending_review",
        toState: "needs_changes",
        idempotencyKey: PHASE_5N_ORIGINAL_IDEMPOTENCY_KEY,
        correlationId: PHASE_5N_ORIGINAL_CORRELATION_ID,
        phase: "5M",
      },
    ],
    idempotency: {
      ...base.idempotency!,
      result: {
        ...base.idempotency!.result,
        auditResultId: successAuditId,
      },
    },
  };
}

export function phase5NFixtureMissingSuccessOnly(): Phase5NObservedMetadata {
  const base = phase5NFixtureProductionIncomplete();
  return {
    ...base,
    auditResults: [], // no failure residue either
  };
}

export function phase5NFixtureSuccessPresentIdempotencyIncomplete(
  successAuditId = "dwr_success_present",
): Phase5NObservedMetadata {
  const complete = phase5NFixtureAlreadyComplete(successAuditId);
  return {
    ...complete,
    idempotency: {
      ...complete.idempotency!,
      result: {
        ...complete.idempotency!.result,
        auditResultId: "",
      },
    },
  };
}

export function phase5NFixtureConflictWrongIdempotencyStatus(): Phase5NObservedMetadata {
  const base = phase5NFixtureProductionIncomplete();
  return {
    ...base,
    idempotency: {
      ...base.idempotency!,
      result: {
        ...base.idempotency!.result,
        ok: false,
        status: "denied",
        auditResultId: "",
      },
    },
  };
}

export function phase5NFixtureConflictDriverNotNeedsChanges(): Phase5NObservedMetadata {
  return {
    ...phase5NFixtureProductionIncomplete(),
    driverState: "pending_review",
  };
}
