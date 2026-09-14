/**
 * Phase 4A-7 — Customer account semantics (AdminCustomerAccountStatus).
 * actev_user is orthogonal to Auth enabled / emailVerified (Auth Admin never queried).
 */

export type CustomerAccountState = "enabled" | "disabled" | "unknown";

/**
 * SoT: admin_customers_adapter.accountStatusFromData
 * - actev_user === true → active/enabled
 * - actev_user === false → suspended/disabled
 * - missing → unknown (do NOT invent active)
 */
export function mapCustomerAccountState(
  data: Record<string, unknown>,
): CustomerAccountState {
  if (!Object.prototype.hasOwnProperty.call(data, "actev_user")) {
    return "unknown";
  }
  if (data.actev_user === true) return "enabled";
  if (data.actev_user === false) return "disabled";
  return "unknown";
}

/**
 * Trip lock hint from user doc only — no order N+1.
 * AdminCustomerTripHint.lockPresent when active_order_id / activeOrderId present.
 */
export type CustomerTripLockHint = "none" | "lockPresent";

export function mapCustomerTripLockHint(
  data: Record<string, unknown>,
): CustomerTripLockHint {
  const a = data.active_order_id ?? data.activeOrderId;
  if (a == null) return "none";
  const s = String(a).trim();
  return s.length ? "lockPresent" : "none";
}
