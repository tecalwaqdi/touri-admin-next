/**
 * Phase 5C — Validation helpers for disable / block / reactivate.
 * Disable and block require reasonCode (REASON_REQUIRED).
 * Keep disable vs block semantically distinct via reason enums.
 * No PII in notes (phone/email/IBAN/bank/address/national id).
 */

import type {
  CustomerBlockReasonCode,
  CustomerControlledWriteCommand,
  CustomerDisableReasonCode,
  CustomerReactivateReasonCode,
} from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { CustomerWriteError } from "@/application/controlled-writes/customers/CustomerWriteErrors";

const DISABLE_CODES: readonly CustomerDisableReasonCode[] = [
  "operational",
  "safety",
  "abuse",
  "inactivity",
  "other",
];

const BLOCK_CODES: readonly CustomerBlockReasonCode[] = [
  "policy_violation",
  "safety",
  "fraud",
  "abuse",
  "compliance",
  "other",
];

const REACTIVATE_CODES: readonly CustomerReactivateReasonCode[] = [
  "appeal_approved",
  "error_correction",
  "operational",
  "other",
];

const FORBIDDEN_NOTE_PATTERNS = [
  /\+?\d[\d\s-]{8,}\d/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\bIBAN\b/i,
  /\bnational\s*id\b/i,
  /\bbank\b/i,
  /\bpassport\b/i,
];

/** Strip / reject unsafe notes. Max 280 chars. */
export function sanitizeCustomerOperatorNote(
  note: string | undefined,
): string | undefined {
  if (note == null) return undefined;
  const trimmed = note.trim().slice(0, 280);
  if (!trimmed) return undefined;
  for (const re of FORBIDDEN_NOTE_PATTERNS) {
    if (re.test(trimmed)) {
      throw new CustomerWriteError(
        "VALIDATION_FAILED",
        "Operator note contains forbidden PII-like content",
      );
    }
  }
  return trimmed;
}

export function validateCustomerWriteCommandPayload(
  command: CustomerControlledWriteCommand,
): { reasonCode?: string; note?: string } {
  if (!command.customerId?.trim()) {
    throw new CustomerWriteError("VALIDATION_FAILED", "customerId is required");
  }
  if (!command.preconditionToken?.trim()) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "preconditionToken is required",
    );
  }
  if (!command.expectedCurrentState) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "expectedCurrentState is required",
    );
  }
  if (!command.idempotencyKey?.trim()) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey is required",
    );
  }
  if (!command.correlationId?.trim()) {
    throw new CustomerWriteError(
      "VALIDATION_FAILED",
      "correlationId is required",
    );
  }

  switch (command.action) {
    case "disable": {
      if (
        command.reasonCode == null ||
        String(command.reasonCode).trim() === ""
      ) {
        throw new CustomerWriteError(
          "REASON_REQUIRED",
          "disable requires reasonCode",
        );
      }
      if (!(DISABLE_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new CustomerWriteError(
          "VALIDATION_FAILED",
          `Invalid disable reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeCustomerOperatorNote(command.note),
      };
    }
    case "block": {
      if (
        command.reasonCode == null ||
        String(command.reasonCode).trim() === ""
      ) {
        throw new CustomerWriteError(
          "REASON_REQUIRED",
          "block requires reasonCode",
        );
      }
      if (!(BLOCK_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new CustomerWriteError(
          "VALIDATION_FAILED",
          `Invalid block reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeCustomerOperatorNote(command.note),
      };
    }
    case "reactivate": {
      if (
        command.reasonCode != null &&
        !(REACTIVATE_CODES as readonly string[]).includes(command.reasonCode)
      ) {
        throw new CustomerWriteError(
          "VALIDATION_FAILED",
          `Invalid reactivate reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeCustomerOperatorNote(command.note),
      };
    }
  }
}
