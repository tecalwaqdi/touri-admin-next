/**
 * Phase 4 DESIGN — collection allowlist (default DENY).
 * Unknown collections are rejected. NO index deploy in this phase.
 */

export const PRODUCTION_READ_COLLECTION_ALLOWLIST = [
  "countries",
  "cities", // Legacy regions (country→region cascade); not product cities
  "villages", // Legacy product cities (Admin/Customer/Driver SoT)
  "mkan", // Legacy landmarks / tourist attractions (Admin/Customer/Driver/Functions SoT)
  "order", // trips
  "user", // drivers / agents / customers (resource repos differentiate)
] as const;

export type AllowedProductionCollection =
  (typeof PRODUCTION_READ_COLLECTION_ALLOWLIST)[number];

/** Explicitly denied / out of Phase 4A initial scope. */
export const PRODUCTION_READ_COLLECTION_DENY = [
  "settlements",
  "settlement_v2",
  "ledger",
  "journal",
  "finance_controls",
  "refunds",
  "chargebacks",
  "payment_gateway",
  "admin_users_mutations",
] as const;

export function isCollectionAllowedForProductionRead(
  collection: string,
): boolean {
  const c = collection.trim();
  if (!c) return false;
  if (
    (PRODUCTION_READ_COLLECTION_DENY as readonly string[]).includes(c)
  ) {
    return false;
  }
  return (PRODUCTION_READ_COLLECTION_ALLOWLIST as readonly string[]).includes(c);
}

export function assertCollectionAllowed(collection: string): void {
  if (!isCollectionAllowedForProductionRead(collection)) {
    throw new Error(`COLLECTION_NOT_ALLOWED: ${collection}`);
  }
}
