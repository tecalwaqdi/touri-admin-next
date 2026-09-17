/**
 * Phase 5B — Stable error codes for Agent Controlled Writes.
 * Do not invent aliases at call sites; map pipeline denials to these codes.
 */

export const AGENT_WRITE_ERROR_CODES = [
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "AGENT_NOT_FOUND",
  "NOT_OPERATIONAL_AGENT",
  "INVALID_AGENT_STATE_TRANSITION",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
  "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
  "VALIDATION_FAILED",
  "INTERNAL_WRITE_FAILURE",
] as const;

export type AgentWriteErrorCode = (typeof AGENT_WRITE_ERROR_CODES)[number];

export class AgentWriteError extends Error {
  readonly code: AgentWriteErrorCode;
  readonly productionWriteExecuted = false as const;

  constructor(code: AgentWriteErrorCode, message: string) {
    super(message);
    this.name = "AgentWriteError";
    this.code = code;
  }
}

export function isAgentWriteErrorCode(value: string): value is AgentWriteErrorCode {
  return (AGENT_WRITE_ERROR_CODES as readonly string[]).includes(value);
}
