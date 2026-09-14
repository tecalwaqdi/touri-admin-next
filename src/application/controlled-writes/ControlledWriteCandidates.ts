/**
 * Phase 5 — Controlled Writes candidates + explicit deferrals.
 * Scope: Drivers, Agents, Customers only. Finance excluded.
 */

import type {
  AgentWriteAction,
  ControlledWriteAction,
  ControlledWriteResource,
  CustomerWriteAction,
  DriverWriteAction,
} from "@/application/controlled-writes/ControlledWriteTypes";

export const DRIVER_WRITE_CANDIDATES: readonly DriverWriteAction[] = [
  "approve",
  "reject",
  "needs_changes",
  "suspend",
] as const;

export const AGENT_WRITE_CANDIDATES: readonly AgentWriteAction[] = [
  "activate",
  "deactivate",
  "suspend",
] as const;

export const CUSTOMER_WRITE_CANDIDATES: readonly CustomerWriteAction[] = [
  "disable",
  "block",
  "reactivate",
] as const;

/** Explicitly deferred — never part of Phase 5 low-risk set. */
export const DEFERRED_CONTROLLED_WRITE_ACTIONS = [
  "driver.delete",
  "driver.country_reassignment",
  "agent.delete",
  "agent.country_reassignment",
  "customer.delete",
  "customer.country_reassignment",
  "wallet.any",
  "finance.settlement",
  "finance.payout",
  "finance.commission",
  "finance.vat",
  "finance.ledger",
  "finance.refund",
  "trip.mutate",
  "ui_direct_firestore",
] as const;

export type DeferredControlledWriteAction =
  (typeof DEFERRED_CONTROLLED_WRITE_ACTIONS)[number];

export function isDriverWriteCandidate(
  action: string,
): action is DriverWriteAction {
  return (DRIVER_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function isAgentWriteCandidate(
  action: string,
): action is AgentWriteAction {
  return (AGENT_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function isCustomerWriteCandidate(
  action: string,
): action is CustomerWriteAction {
  return (CUSTOMER_WRITE_CANDIDATES as readonly string[]).includes(action);
}

export function isControlledWriteCandidate(
  resource: ControlledWriteResource,
  action: ControlledWriteAction | string,
): boolean {
  switch (resource) {
    case "driver":
      return isDriverWriteCandidate(action);
    case "agent":
      return isAgentWriteCandidate(action);
    case "customer":
      return isCustomerWriteCandidate(action);
    default:
      return false;
  }
}

export function isDeferredControlledWriteAction(token: string): boolean {
  return (DEFERRED_CONTROLLED_WRITE_ACTIONS as readonly string[]).includes(
    token,
  );
}
