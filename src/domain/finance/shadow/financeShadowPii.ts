/**
 * Safe finance shadow reporting — no PII, no raw Firebase UIDs in reports.
 */

import { createHash } from "node:crypto";

const SENSITIVE =
  /phone|email|password|private_key|displayName|display_name|naim_|carmndob|photo|BEGIN PRIVATE|eyJ[A-Za-z0-9_-]{20,}/i;

export function financeRecordToken(
  collection: string,
  documentId: string,
): string {
  return createHash("sha256")
    .update(`${collection}:${documentId}`)
    .digest("hex")
    .slice(0, 16);
}

export function assertFinanceShadowReportSafe(serialized: string): {
  piiViolations: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (SENSITIVE.test(serialized)) reasons.push("sensitive_field_pattern");
  if (/"uid"\s*:/.test(serialized)) reasons.push("raw_uid_key");
  if (/phone_nu/.test(serialized)) reasons.push("phone_field");
  return { piiViolations: reasons.length, reasons };
}
