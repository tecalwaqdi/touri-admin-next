/**
 * Phase 5D — resource + action allowlists for consolidated Controlled Writes.
 * Unknown resource → UNSUPPORTED_WRITE_RESOURCE.
 * No genericWrite / rawFirestoreMutation surface.
 */

import {
  AGENT_WRITE_CANDIDATES,
  CUSTOMER_WRITE_CANDIDATES,
  DRIVER_WRITE_CANDIDATES,
} from "@/application/controlled-writes/ControlledWriteCandidates";
import type {
  AgentWriteAction,
  ControlledWriteResource,
  CustomerWriteAction,
  DriverWriteAction,
} from "@/application/controlled-writes/ControlledWriteTypes";

export const ALLOWED_WRITE_RESOURCES = [
  "driver",
  "agent",
  "customer",
] as const satisfies readonly ControlledWriteResource[];

/** Explicitly denied until a dedicated phase permits them. */
export const DENIED_WRITE_RESOURCES = [
  "trip",
  "order",
  "wallet",
  "payment",
  "settlement",
  "finance",
  "country",
  "city",
  "landmark",
  "auth",
  "storage",
] as const;

export type DeniedWriteResource = (typeof DENIED_WRITE_RESOURCES)[number];

export function isAllowedWriteResource(
  resource: string,
): resource is ControlledWriteResource {
  return (ALLOWED_WRITE_RESOURCES as readonly string[]).includes(resource);
}

export function isDeniedWriteResource(
  resource: string,
): resource is DeniedWriteResource {
  return (DENIED_WRITE_RESOURCES as readonly string[]).includes(resource);
}

export function isAllowedDriverAction(
  action: string,
): action is DriverWriteAction {
  return (DRIVER_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function isAllowedAgentAction(
  action: string,
): action is AgentWriteAction {
  return (AGENT_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function isAllowedCustomerAction(
  action: string,
): action is CustomerWriteAction {
  return (CUSTOMER_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function assertResourceAllowlisted(resource: string): void {
  if (!isAllowedWriteResource(resource)) {
    throw Object.assign(new Error(`Unsupported write resource: ${resource}`), {
      code: "UNSUPPORTED_WRITE_RESOURCE" as const,
    });
  }
}
