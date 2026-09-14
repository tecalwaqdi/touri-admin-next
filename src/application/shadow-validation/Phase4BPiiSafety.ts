/**
 * Phase 4B — Customer + Driver PII safety assertions.
 * FULL_PII_SHADOW_ENABLED must remain false.
 * Fail if raw PII appears in summary / observability / DTO / errors.
 */

import { customerLiveReportHasSensitiveLeak } from "@/domain/customer/CustomerMappingDiagnostic";
import { driverLiveReportHasSensitiveLeak } from "@/domain/driver/DriverMappingDiagnostic";
import { agentLiveReportHasSensitiveLeak } from "@/domain/agent/AgentMappingDiagnostic";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";

export type PiiSafetyResult = {
  piiViolations: number;
  reasons: string[];
};

const RAW_PHONE = /\+966\d{8,}/;
const STORAGE_URL = /firebasestorage\.googleapis\.com/i;
const FCMish = /fcm_token|messaging_token/i;

function looksLikeRawEmail(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Masked hints contain "***@" — allow those.
  if (value.includes("***")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function looksLikeRawPhone(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const s = String(value);
  if (s.includes("***")) return false;
  return RAW_PHONE.test(s) || /^\+?\d{10,15}$/.test(s.replace(/[\s-]/g, ""));
}

/**
 * Scan a serialized safe summary / observability blob for PII leaks.
 */
export function assertSerializedHasNoRawPii(serialized: string): PiiSafetyResult {
  const reasons: string[] = [];
  if (customerLiveReportHasSensitiveLeak(serialized)) {
    reasons.push("customer_sensitive_leak_pattern");
  }
  if (driverLiveReportHasSensitiveLeak(serialized)) {
    reasons.push("driver_sensitive_leak_pattern");
  }
  if (agentLiveReportHasSensitiveLeak(serialized)) {
    reasons.push("agent_sensitive_leak_pattern");
  }
  if (STORAGE_URL.test(serialized)) {
    reasons.push("document_storage_url");
  }
  if (FCMish.test(serialized)) {
    reasons.push("fcm_token");
  }
  if (/\bSA\d{2}[A-Z0-9]{10,}\b/i.test(serialized)) {
    reasons.push("bank_data");
  }
  return {
    piiViolations: reasons.length > 0 ? 1 : 0,
    reasons: [...new Set(reasons)],
  };
}

/**
 * Inspect Customer DTO fields for raw phone/email (hints with *** are OK).
 */
export function assertCustomerDtoPiiSafe(
  model: CanonicalCustomerReadModel,
): PiiSafetyResult {
  const reasons: string[] = [];
  const fields = [
    model.phone.value,
    model.email.value,
    model.phoneHint.value,
    model.emailHint.value,
  ];
  for (const f of fields) {
    if (looksLikeRawPhone(f)) reasons.push("customer_raw_phone");
    if (looksLikeRawEmail(f)) reasons.push("customer_raw_email");
  }
  // Provenance must not stash raw contacts.
  const provBlob = JSON.stringify({
    phone: model.phone.provenance,
    email: model.email.provenance,
  });
  if (RAW_PHONE.test(provBlob) || looksLikeRawEmail(model.email.provenance?.sourceValue)) {
    // sourceValue on hints should already be masked; flag only raw.
    if (
      looksLikeRawPhone(model.phone.provenance?.sourceValue) ||
      looksLikeRawEmail(model.email.provenance?.sourceValue)
    ) {
      reasons.push("customer_provenance_raw");
    }
  }
  return {
    piiViolations: reasons.length > 0 ? 1 : 0,
    reasons: [...new Set(reasons)],
  };
}

/**
 * Inspect Driver DTO for document URLs / national ID / license / FCM / bank.
 * Documented DO_NOT_EXPOSE field *names* in financial.fieldsPresent are allowed
 * (inventory only) — raw IBAN/account values and storage URLs are not.
 */
export function assertDriverDtoPiiSafe(
  model: CanonicalDriverReadModel,
): PiiSafetyResult {
  const reasons: string[] = [];
  // Exclude intentional field-name inventories before pattern scan.
  const scrubbed = {
    ...model,
    financial: {
      ...model.financial,
      fieldsPresent: [],
      fieldsMissing: [],
    },
  };
  const blob = JSON.stringify(scrubbed);
  if (STORAGE_URL.test(blob)) reasons.push("driver_document_url");
  if (FCMish.test(blob)) reasons.push("driver_fcm");
  // Raw IBAN value shape (e.g. SA03…) — not the inventory name "ipanBank".
  if (/\bSA\d{2}[A-Z0-9]{10,}\b/i.test(blob) || /"bankIdAcc"\s*:\s*"[^"]+"/i.test(blob)) {
    reasons.push("driver_bank");
  }
  if (/"ID_hoyh_MNDOB"\s*:\s*"[^"]+"/i.test(blob)) {
    reasons.push("driver_national_id_value");
  }
  // normalizedPlateExposed is typed literal false on CanonicalDriverReadModel —
  // any true would be a contract break caught by the type system / mapper tests.
  if ((model.vehicle as { normalizedPlateExposed: boolean }).normalizedPlateExposed) {
    reasons.push("driver_normalized_plate_exposed");
  }
  if (looksLikeRawPhone(model.displayName.value)) {
    reasons.push("driver_phone_as_display");
  }
  return {
    piiViolations: reasons.length > 0 ? 1 : 0,
    reasons: [...new Set(reasons)],
  };
}

export function accumulatePiiViolations(
  results: PiiSafetyResult[],
): PiiSafetyResult {
  const reasons = [...new Set(results.flatMap((r) => r.reasons))];
  return {
    piiViolations: reasons.length,
    reasons,
  };
}
