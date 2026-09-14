/**
 * Settlement direction helpers (cash vs card).
 */

import type { SettlementDirection } from "@/domain/finance/v2/FinanceImplementationContracts";

export function settlementDirectionForTrip(
  channel: "cash" | "card" | "unknown",
): SettlementDirection {
  if (channel === "cash") return "DRIVER_PAYS_COMPANY";
  if (channel === "card") return "COMPANY_PAYS_DRIVER";
  throw new Error("unknown_payment_channel_no_direction");
}

export function agentSettlementDirection(): SettlementDirection {
  return "COMPANY_PAYS_AGENT";
}

export function isDriverCompanyDirection(d: SettlementDirection): boolean {
  return d === "DRIVER_PAYS_COMPANY" || d === "COMPANY_PAYS_DRIVER";
}

export function isAgentCompanyDirection(d: SettlementDirection): boolean {
  return d === "AGENT_PAYS_COMPANY" || d === "COMPANY_PAYS_AGENT";
}
