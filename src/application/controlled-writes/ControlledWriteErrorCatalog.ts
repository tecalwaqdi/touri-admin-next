/**
 * Phase 5D — normalized Controlled Writes error catalog.
 * Presentation layer must not receive raw Firestore errors.
 */

import { DRIVER_WRITE_ERROR_CODES } from "@/application/controlled-writes/drivers/DriverWriteErrors";
import { AGENT_WRITE_ERROR_CODES } from "@/application/controlled-writes/agents/AgentWriteErrors";
import { CUSTOMER_WRITE_ERROR_CODES } from "@/application/controlled-writes/customers/CustomerWriteErrors";

/** Consolidated codes spanning Drivers + Agents + Customers + facade gates. */
export const CONTROLLED_WRITE_ERROR_CATALOG = [
  "PRODUCTION_WRITE_DISABLED",
  "RESOURCE_WRITE_DISABLED",
  "PERMISSION_DENIED",
  "SCOPE_DENIED",
  "PRECONDITION_FAILED",
  "IDEMPOTENCY_CONFLICT",
  "VALIDATION_FAILED",
  "NOT_OPERATIONAL_DRIVER",
  "NOT_OPERATIONAL_AGENT",
  "NOT_OPERATIONAL_CUSTOMER",
  "INVALID_DRIVER_STATE_TRANSITION",
  "INVALID_AGENT_STATE_TRANSITION",
  "INVALID_CUSTOMER_STATE_TRANSITION",
  "DRIVER_HAS_ACTIVE_TRIP",
  "DRIVER_NOT_READY_FOR_APPROVAL",
  "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY",
  "COUNTRY_REASSIGNMENT_NOT_ALLOWED",
  "CUSTOMER_HAS_ACTIVE_TRIP",
  "UNSUPPORTED_WRITE_RESOURCE",
  "UNSUPPORTED_WRITE_ACTION",
  "INTERNAL_WRITE_FAILURE",
  // Phase 5M stage-scoped Admin SDK IAM denials
  "AUDIT_INTENT_PERMISSION_DENIED",
  "DRIVER_DOMAIN_PERMISSION_DENIED",
  "IDEMPOTENCY_PERMISSION_DENIED",
  "AUDIT_RESULT_PERMISSION_DENIED",
  // Domain extras retained for compatibility
  "DRIVER_NOT_FOUND",
  "AGENT_NOT_FOUND",
  "CUSTOMER_NOT_FOUND",
  "REASON_REQUIRED",
  "AUTH_WRITE_DISABLED",
] as const;

export type ControlledWriteErrorCode =
  (typeof CONTROLLED_WRITE_ERROR_CATALOG)[number];

export function isControlledWriteErrorCode(
  value: string,
): value is ControlledWriteErrorCode {
  return (CONTROLLED_WRITE_ERROR_CATALOG as readonly string[]).includes(value);
}

/** Prove domain catalogs are subsets of the consolidated model (minus aliases). */
export function domainErrorCodesCovered(): {
  driver: boolean;
  agent: boolean;
  customer: boolean;
} {
  const set = new Set<string>(CONTROLLED_WRITE_ERROR_CATALOG);
  return {
    driver: DRIVER_WRITE_ERROR_CODES.every((c) => set.has(c)),
    agent: AGENT_WRITE_ERROR_CODES.every((c) => set.has(c)),
    customer: CUSTOMER_WRITE_ERROR_CODES.every((c) => set.has(c)),
  };
}

export class ControlledWriteConsolidationError extends Error {
  readonly code: ControlledWriteErrorCode;
  readonly productionWriteExecuted = false as const;
  readonly authWriteExecuted = false as const;
  readonly financeWriteExecuted = false as const;
  readonly tripWriteExecuted = false as const;

  constructor(code: ControlledWriteErrorCode, message: string) {
    super(message);
    this.name = "ControlledWriteConsolidationError";
    this.code = code;
  }
}
