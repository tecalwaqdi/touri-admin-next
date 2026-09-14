/**
 * Phase 3.7 — Canonical Customer Read contract + PII permission gate.
 * customers:read does NOT imply full phone/email.
 */

import type { Permission } from "@/types/roles";
import {
  presentEmail,
  presentPhone,
  type PiiPresentationMode,
} from "@/domain/pii/maskIdentity";
import type { Provenanced } from "@/domain/canonical/CanonicalReadModels";
import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";

export type CanonicalCustomerReadContract = {
  customerId: string;
  name: Provenanced<string>;
  phone: Provenanced<string>;
  email: Provenanced<string>;
  verification: Provenanced<string>;
  countryId: Provenanced<string>;
  cityId: Provenanced<string>;
  blocked: Provenanced<boolean>;
  createdAtUtc: Provenanced<string>;
  lastActivityAtUtc: Provenanced<string>;
  incompleteReasons: string[];
  mappingConfidence: MappingConfidence;
  mappingVersion: string;
  legacyCollection: "user";
};

export type CustomerPiiView = {
  phone: string | null;
  email: string | null;
  mode: PiiPresentationMode;
  redacted: boolean;
};

/**
 * Resolve PII presentation from permissions.
 * customers:read alone → masked; customers:read_pii → full.
 */
export function resolveCustomerPiiMode(
  permissions: Permission[],
): PiiPresentationMode {
  if (permissions.includes("customers:read_pii")) return "full";
  return "masked";
}

export function projectCustomerPii(
  raw: { phone?: string | null; email?: string | null },
  permissions: Permission[],
): CustomerPiiView {
  const hasRead = permissions.includes("customers:read");
  if (!hasRead && !permissions.includes("customers:read_pii")) {
    return { phone: null, email: null, mode: "masked", redacted: true };
  }
  const mode = resolveCustomerPiiMode(permissions);
  return {
    phone: presentPhone(raw.phone, mode),
    email: presentEmail(raw.email, mode),
    mode,
    redacted: mode === "masked",
  };
}

export function resolveDriverPiiMode(
  permissions: Permission[],
): PiiPresentationMode {
  if (permissions.includes("drivers:read_pii")) return "full";
  return "masked";
}
