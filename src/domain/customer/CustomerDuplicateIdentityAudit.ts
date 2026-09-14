/**
 * Phase 4A-7 — Customer duplicate / identity audit.
 * Hashes only — never raw phone/email in metrics or live-safe summary.
 */

import { createHash } from "node:crypto";
import type { CanonicalCustomerReadModel } from "@/domain/canonical/CanonicalReadModels";

export type CustomerIdentityRow = {
  sourceDocumentId: string;
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  countryId: string | null;
  mappingStatus: string;
  /** SHA-256 of digits-only phone — never raw. */
  phoneHash: string | null;
  /** SHA-256 of lowercased email — never raw. */
  emailHash: string | null;
  testOrNoncanonical?: boolean;
  unmappedCountry?: boolean;
  unmappedCity?: boolean;
  geographyNotRepresented?: boolean;
  unknownDiscriminator?: boolean;
  excludedNonCustomer?: boolean;
  excludedUnknownIdentity?: boolean;
  malformed?: boolean;
  isCustomerCandidate?: boolean;
  hasPositiveCustomerEvidence?: boolean;
  isOperationalCustomer?: boolean;
};

export type CustomerDuplicateAuditMetrics = {
  recordsRead: number;
  customerCandidates: number;
  total: number;
  validMapped: number;
  testOrNoncanonical: number;
  excludedNonCustomer: number;
  excludedUnknownIdentity: number;
  unmappedCountry: number;
  unmappedCity: number;
  geographyNotRepresented: number;
  malformed: number;
  unknownDiscriminator: number;
  exactDocumentIdDuplicates: number;
  authUidCollisions: number;
  phoneHashCollisions: number;
  emailHashCollisions: number;
  missingAuthUid: number;
  authUidMismatch: number;
  unexpectedCollections: number;
};

export function hashCustomerPhoneForAudit(
  phone: string | number | null | undefined,
): string | null {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 6) return null;
  return createHash("sha256").update(`cust-phone:${digits}`).digest("hex");
}

export function hashCustomerEmailForAudit(
  email: string | null | undefined,
): string | null {
  if (email == null) return null;
  const normalized = String(email).trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  return createHash("sha256")
    .update(`cust-email:${normalized}`)
    .digest("hex");
}

export function emptyCustomerDuplicateMetrics(): CustomerDuplicateAuditMetrics {
  return {
    recordsRead: 0,
    customerCandidates: 0,
    total: 0,
    validMapped: 0,
    testOrNoncanonical: 0,
    excludedNonCustomer: 0,
    excludedUnknownIdentity: 0,
    unmappedCountry: 0,
    unmappedCity: 0,
    geographyNotRepresented: 0,
    malformed: 0,
    unknownDiscriminator: 0,
    exactDocumentIdDuplicates: 0,
    authUidCollisions: 0,
    phoneHashCollisions: 0,
    emailHashCollisions: 0,
    missingAuthUid: 0,
    authUidMismatch: 0,
    unexpectedCollections: 0,
  };
}

function countCollisions(keys: Array<string | null>): number {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let collisions = 0;
  for (const n of counts.values()) {
    if (n > 1) collisions += n;
  }
  return collisions;
}

/**
 * Mutually exclusive partition:
 * recordsRead = validMapped + testOrNoncanonical + excludedNonCustomer +
 *   excludedUnknownIdentity + unmappedCountry + unmappedCity +
 *   geographyNotRepresented + malformed + unknownDiscriminator
 *
 * unmappedCountry / unmappedCity only for proven operational Customers.
 * geographyNotRepresented when operational customer lacks Rev_dolh
 * (proven optional by create flows).
 * excludedUnknownIdentity when exclusionary candidate lacks positive CUSTOMER
 * evidence (not Customer, not malformed geography).
 */
export function reconcileCustomerAuditPartition(
  metrics: CustomerDuplicateAuditMetrics,
): {
  ok: boolean;
  partitionedSum: number;
  recordsRead: number;
} {
  const partitionedSum =
    metrics.validMapped +
    metrics.testOrNoncanonical +
    metrics.excludedNonCustomer +
    metrics.excludedUnknownIdentity +
    metrics.unmappedCountry +
    metrics.unmappedCity +
    metrics.geographyNotRepresented +
    metrics.malformed +
    metrics.unknownDiscriminator;
  return {
    ok: partitionedSum === metrics.recordsRead,
    partitionedSum,
    recordsRead: metrics.recordsRead,
  };
}

export function auditCustomerDuplicates(
  rows: CustomerIdentityRow[],
  options?: { unexpectedCollections?: number },
): CustomerDuplicateAuditMetrics {
  const metrics = emptyCustomerDuplicateMetrics();
  metrics.recordsRead = rows.length;
  metrics.total = rows.length;
  metrics.unexpectedCollections = options?.unexpectedCollections ?? 0;

  const docIds: string[] = [];
  const authUids: Array<string | null> = [];
  const phoneHashes: Array<string | null> = [];
  const emailHashes: Array<string | null> = [];

  for (const r of rows) {
    docIds.push(r.sourceDocumentId);
    authUids.push(r.authUid);
    phoneHashes.push(r.phoneHash);
    emailHashes.push(r.emailHash);

    if (r.isCustomerCandidate !== false) metrics.customerCandidates += 1;
    if (r.authUidKnowledge === "missing") metrics.missingAuthUid += 1;
    if (r.authUidKnowledge === "mismatch") metrics.authUidMismatch += 1;

    switch (r.mappingStatus) {
      case "validMapped":
        metrics.validMapped += 1;
        break;
      case "testOrNoncanonical":
        metrics.testOrNoncanonical += 1;
        break;
      case "excludedNonCustomer":
        metrics.excludedNonCustomer += 1;
        break;
      case "excludedUnknownIdentity":
        metrics.excludedUnknownIdentity += 1;
        break;
      case "unmappedCountry":
        metrics.unmappedCountry += 1;
        break;
      case "unmappedCity":
        metrics.unmappedCity += 1;
        break;
      case "geographyNotRepresented":
        metrics.geographyNotRepresented += 1;
        break;
      case "malformed":
        metrics.malformed += 1;
        break;
      case "unknownDiscriminator":
        metrics.unknownDiscriminator += 1;
        break;
      default:
        if (r.excludedNonCustomer) metrics.excludedNonCustomer += 1;
        else if (r.excludedUnknownIdentity)
          metrics.excludedUnknownIdentity += 1;
        else if (r.testOrNoncanonical) metrics.testOrNoncanonical += 1;
        else if (r.malformed) metrics.malformed += 1;
        else if (r.unknownDiscriminator) metrics.unknownDiscriminator += 1;
        else if (r.unmappedCountry) metrics.unmappedCountry += 1;
        else if (r.unmappedCity) metrics.unmappedCity += 1;
        else if (r.geographyNotRepresented)
          metrics.geographyNotRepresented += 1;
        else metrics.validMapped += 1;
        break;
    }
  }

  metrics.exactDocumentIdDuplicates = countCollisions(docIds);
  metrics.authUidCollisions = countCollisions(authUids);
  metrics.phoneHashCollisions = countCollisions(phoneHashes);
  metrics.emailHashCollisions = countCollisions(emailHashes);

  return metrics;
}

export function customerMappingReadyForLiveClose(
  metrics: CustomerDuplicateAuditMetrics,
  options?: { excludedNonCustomerWithoutEvidence?: number },
): boolean {
  return (
    metrics.exactDocumentIdDuplicates === 0 &&
    metrics.unknownDiscriminator === 0 &&
    metrics.unmappedCountry === 0 &&
    metrics.malformed === 0 &&
    metrics.unexpectedCollections === 0 &&
    (options?.excludedNonCustomerWithoutEvidence ?? 0) === 0
  );
}

export function rowFromCanonicalCustomer(
  model: CanonicalCustomerReadModel,
  extras?: {
    phoneHash?: string | null;
    emailHash?: string | null;
  },
): CustomerIdentityRow {
  return {
    sourceDocumentId: model.sourceDocumentId,
    authUid: model.authUid,
    authUidKnowledge: model.authUidKnowledge,
    countryId: model.countryId.value,
    mappingStatus: model.mappingStatus,
    phoneHash: extras?.phoneHash ?? null,
    emailHash: extras?.emailHash ?? null,
    testOrNoncanonical: model.mappingStatus === "testOrNoncanonical",
    unmappedCountry: model.mappingStatus === "unmappedCountry",
    unmappedCity: model.mappingStatus === "unmappedCity",
    geographyNotRepresented:
      model.mappingStatus === "geographyNotRepresented",
    unknownDiscriminator: model.mappingStatus === "unknownDiscriminator",
    excludedNonCustomer: model.mappingStatus === "excludedNonCustomer",
    excludedUnknownIdentity:
      model.mappingStatus === "excludedUnknownIdentity",
    malformed: model.mappingStatus === "malformed",
    isCustomerCandidate: model.isCustomerCandidate,
    hasPositiveCustomerEvidence: model.hasPositiveCustomerEvidence,
    isOperationalCustomer: model.isOperationalCustomer,
  };
}

/** Test/demo markers — evidence required; never delete. */
export function isTestOrNoncanonicalCustomer(input: {
  documentId: string;
  data: Record<string, unknown>;
  countryId?: string | null;
}): boolean {
  const id = input.documentId.toLowerCase();
  if (/^cp5_|^test_|^demo_|^golden_|^qa_/.test(id)) return true;
  if (input.countryId && /^cp5_country_/.test(input.countryId)) return true;
  const markers = [
    input.data.functional_test,
    input.data.is_test,
    input.data.demo,
    input.data.qa_fixture,
  ];
  if (markers.some((m) => m === true || m === "true")) return true;
  const name = String(
    input.data.display_name ?? input.data.email ?? "",
  ).toLowerCase();
  if (
    name.includes("functional test") ||
    name.includes("@touri-taxi-test") ||
    name.includes("@touri-taxi-test.local")
  ) {
    return true;
  }
  return false;
}
