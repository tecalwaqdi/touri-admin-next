/**
 * FR7 — PII masking for Finance read models (aggregate-safe).
 * Reuses finance shadow token helpers; never expose raw PII.
 */

import {
  assertFinanceShadowReportSafe,
  financeRecordToken,
} from "@/domain/finance/shadow/financeShadowPii";

export function maskPartyId(
  collection: "drivers" | "agents" | "order" | "party" | "customers",
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return financeRecordToken(collection, id);
}

export function assertFinanceReportPayloadSafe(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const check = assertFinanceShadowReportSafe(serialized);
  if (check.piiViolations > 0) {
    throw new Error(`pii_in_report:${check.reasons.join(",")}`);
  }
}
