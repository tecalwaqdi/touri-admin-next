/**
 * Phase 5B — Validation helpers for activate / deactivate / suspend.
 * Suspend requires reasonCode + optional sanitized note.
 * No PII in notes (phone/email/IBAN/bank/contracts/address).
 */

import type {
  AgentControlledWriteCommand,
  AgentDeactivateReasonCode,
  AgentSuspendReasonCode,
} from "@/application/controlled-writes/agents/AgentWriteTypes";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";

const SUSPEND_CODES: readonly AgentSuspendReasonCode[] = [
  "policy_violation",
  "safety",
  "compliance",
  "operational",
  "other",
];

const DEACTIVATE_CODES: readonly AgentDeactivateReasonCode[] = [
  "operational",
  "contract_ended",
  "replaced",
  "other",
];

const FORBIDDEN_NOTE_PATTERNS = [
  /\+?\d[\d\s-]{8,}\d/,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\bIBAN\b/i,
  /\bnational\s*id\b/i,
  /\bbank\b/i,
  /\bcontract\b/i,
];

/** Strip / reject unsafe notes. Max 280 chars. */
export function sanitizeAgentOperatorNote(
  note: string | undefined,
): string | undefined {
  if (note == null) return undefined;
  const trimmed = note.trim().slice(0, 280);
  if (!trimmed) return undefined;
  for (const re of FORBIDDEN_NOTE_PATTERNS) {
    if (re.test(trimmed)) {
      throw new AgentWriteError(
        "VALIDATION_FAILED",
        "Operator note contains forbidden PII-like content",
      );
    }
  }
  return trimmed;
}

export function validateAgentWriteCommandPayload(
  command: AgentControlledWriteCommand,
): { reasonCode?: string; note?: string } {
  if (!command.agentId?.trim()) {
    throw new AgentWriteError("VALIDATION_FAILED", "agentId is required");
  }
  if (!command.countryId?.trim()) {
    throw new AgentWriteError("VALIDATION_FAILED", "countryId is required");
  }
  if (!command.preconditionToken?.trim()) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "preconditionToken is required",
    );
  }
  if (!command.expectedCurrentState) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "expectedCurrentState is required",
    );
  }
  if (!command.idempotencyKey?.trim()) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "idempotencyKey is required",
    );
  }
  if (!command.correlationId?.trim()) {
    throw new AgentWriteError(
      "VALIDATION_FAILED",
      "correlationId is required",
    );
  }

  switch (command.action) {
    case "activate":
      return {};
    case "deactivate": {
      if (
        command.reasonCode != null &&
        !(DEACTIVATE_CODES as readonly string[]).includes(command.reasonCode)
      ) {
        throw new AgentWriteError(
          "VALIDATION_FAILED",
          `Invalid deactivate reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeAgentOperatorNote(command.note),
      };
    }
    case "suspend": {
      if (!(SUSPEND_CODES as readonly string[]).includes(command.reasonCode)) {
        throw new AgentWriteError(
          "VALIDATION_FAILED",
          `Invalid suspend reasonCode=${command.reasonCode}`,
        );
      }
      return {
        reasonCode: command.reasonCode,
        note: sanitizeAgentOperatorNote(command.note),
      };
    }
  }
}
