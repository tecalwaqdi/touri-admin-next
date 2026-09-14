/**
 * Phase 5A — Validation helpers for reject / needs_changes / suspend notes.
 */

import type {
  DriverChangesReasonCode,
  DriverControlledWriteCommand,
  DriverRejectReasonCode,
  DriverSuspendReasonCode,
} from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { DriverWriteError } from "@/application/controlled-writes/drivers/DriverWriteErrors";

const REJECT_CODES: readonly DriverRejectReasonCode[] = [
  "missing_document",
  "invalid_document",
  "identity_mismatch",
  "vehicle_incomplete",
  "compliance_incomplete",
  "other",
];

const CHANGES_CODES: readonly DriverChangesReasonCode[] = [
  "missing_document",
  "invalid_document",
  "photo_quality",
  "vehicle_incomplete",
  "compliance_incomplete",
  "other",
];

const SUSPEND_CODES: readonly DriverSuspendReasonCode[] = [
  "policy_violation",
  "safety",
  "compliance",
  "operational",
  "other",
];

const FORBIDDEN_NOTE_PATTERNS = [
  /\+?\d[\d\s-]{8,}\d/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\bIBAN\b/i,
  /\bnational\s*id\b/i,
];

/** Strip / reject unsafe notes. Max 280 chars. */
export function sanitizeOperatorNote(note: string | undefined): string | undefined {
  if (note == null) return undefined;
  const trimmed = note.trim().slice(0, 280);
  if (!trimmed) return undefined;
  for (const re of FORBIDDEN_NOTE_PATTERNS) {
    if (re.test(trimmed)) {
      throw new DriverWriteError(
        "VALIDATION_FAILED",
        "Operator note contains forbidden PII-like content",
      );
    }
  }
  return trimmed;
}

export function validateDriverWriteCommandPayload(
  command: DriverControlledWriteCommand,
): { reasonCode?: string; note?: string } {
  if (!command.driverId?.trim()) {
    throw new DriverWriteError("VALIDATION_FAILED", "driverId is required");
  }
  if (!command.preconditionToken?.trim()) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "preconditionToken is required",
    );
  }
  if (!command.expectedCurrentState) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "expectedCurrentState is required",
    );
  }
  if (!command.idempotencyKey?.trim()) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey is required",
    );
  }
  if (!command.correlationId?.trim()) {
    throw new DriverWriteError(
      "VALIDATION_FAILED",
      "correlationId is required",
    );
  }

  switch (command.action) {
    case "approve":
      return {};
    case "reject": {
      if (!(REJECT_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new DriverWriteError(
          "VALIDATION_FAILED",
          `Invalid reject reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeOperatorNote(command.note),
      };
    }
    case "needs_changes": {
      if (!(CHANGES_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new DriverWriteError(
          "VALIDATION_FAILED",
          `Invalid needs_changes reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeOperatorNote(command.note),
      };
    }
    case "suspend": {
      if (!(SUSPEND_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new DriverWriteError(
          "VALIDATION_FAILED",
          `Invalid suspend reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeOperatorNote(command.note),
      };
    }
  }
}
