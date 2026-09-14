/**
 * Phase 4A-5 — Driver duplicate / identity audit (offline + live-safe metrics).
 * Never expose phone values — hashed fingerprint only when auditing collisions.
 */

import { createHash } from "node:crypto";
import type { CanonicalDriverReadModel } from "@/domain/canonical/CanonicalReadModels";

export type DriverIdentityRow = {
  sourceDocumentId: string;
  authUid: string | null;
  authUidKnowledge: "known" | "missing" | "unknown" | "mismatch";
  countryId: string | null;
  cityId: string | null;
  registrationStatus: string;
  mappingStatus: string;
  /** SHA-256 of digits-only phone — never raw phone. */
  phoneHash: string | null;
  plateHash: string | null;
  testOrNoncanonical?: boolean;
  unmappedCountry?: boolean;
  unmappedCity?: boolean;
  unknownDiscriminator?: boolean;
  excludedNonDriver?: boolean;
  malformed?: boolean;
  conflictingRegistration?: boolean;
  isDriverCandidate?: boolean;
  isOperationalDriver?: boolean;
};

export type DriverDuplicateAuditMetrics = {
  recordsRead: number;
  driverCandidates: number;
  /** @deprecated use recordsRead — retained for prior callers */
  total: number;
  validMapped: number;
  testOrNoncanonical: number;
  excludedNonDriver: number;
  unmappedCountry: number;
  unmappedCity: number;
  malformed: number;
  unknownRegistration: number;
  conflictingRegistration: number;
  exactDocumentIdDuplicates: number;
  activeOperationalDuplicates: number;
  authUidCollisions: number;
  phoneHashCollisions: number;
  plateHashCollisions: number;
  unknownDiscriminator: number;
  missingAuthUid: number;
  authUidMismatch: number;
  unexpectedCollections: number;
};

export function hashDriverPhoneForAudit(
  phone: string | number | null | undefined,
): string | null {
  if (phone == null) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 6) return null;
  return createHash("sha256").update(`drv-phone:${digits}`).digest("hex");
}

export function hashDriverPlateForAudit(
  plate: string | null | undefined,
): string | null {
  if (plate == null) return null;
  const compact = String(plate).trim().replace(/[\s-]/g, "").toUpperCase();
  if (compact.length < 3) return null;
  return createHash("sha256").update(`drv-plate:${compact}`).digest("hex");
}

export function emptyDriverDuplicateMetrics(): DriverDuplicateAuditMetrics {
  return {
    recordsRead: 0,
    driverCandidates: 0,
    total: 0,
    validMapped: 0,
    testOrNoncanonical: 0,
    excludedNonDriver: 0,
    unmappedCountry: 0,
    unmappedCity: 0,
    malformed: 0,
    unknownRegistration: 0,
    conflictingRegistration: 0,
    exactDocumentIdDuplicates: 0,
    activeOperationalDuplicates: 0,
    authUidCollisions: 0,
    phoneHashCollisions: 0,
    plateHashCollisions: 0,
    unknownDiscriminator: 0,
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
 * Partition counts must reconcile:
 * recordsRead = validMapped + testOrNoncanonical + excludedNonDriver +
 *   unmappedCountry + unmappedCity + malformed + unknownDiscriminator
 */
export function reconcileDriverAuditPartition(
  metrics: DriverDuplicateAuditMetrics,
): {
  ok: boolean;
  partitionedSum: number;
  recordsRead: number;
} {
  const partitionedSum =
    metrics.validMapped +
    metrics.testOrNoncanonical +
    metrics.excludedNonDriver +
    metrics.unmappedCountry +
    metrics.unmappedCity +
    metrics.malformed +
    metrics.unknownDiscriminator;
  return {
    ok: partitionedSum === metrics.recordsRead,
    partitionedSum,
    recordsRead: metrics.recordsRead,
  };
}

export function auditDriverDuplicates(
  rows: DriverIdentityRow[],
  options?: { unexpectedCollections?: number },
): DriverDuplicateAuditMetrics {
  const metrics = emptyDriverDuplicateMetrics();
  metrics.recordsRead = rows.length;
  metrics.total = rows.length;
  metrics.unexpectedCollections = options?.unexpectedCollections ?? 0;

  const docIds = rows.map((r) => r.sourceDocumentId);
  const docCounts = new Map<string, number>();
  for (const id of docIds) {
    docCounts.set(id, (docCounts.get(id) ?? 0) + 1);
  }
  for (const n of docCounts.values()) {
    if (n > 1) metrics.exactDocumentIdDuplicates += n;
  }

  metrics.authUidCollisions = countCollisions(
    rows.map((r) => (r.authUid ? r.authUid : null)),
  );
  metrics.phoneHashCollisions = countCollisions(rows.map((r) => r.phoneHash));
  metrics.plateHashCollisions = countCollisions(rows.map((r) => r.plateHash));

  // Active operational duplicates: Auth UID collisions among operational Driver rows.
  // Plate/phone hashes remain observational (masking / fixture reuse is not identity).
  const operational = rows.filter(
    (r) =>
      r.isOperationalDriver === true ||
      r.mappingStatus === "validMapped" ||
      r.mappingStatus === "unmappedCountry" ||
      r.mappingStatus === "unmappedCity",
  );
  metrics.activeOperationalDuplicates = countCollisions(
    operational.map((r) => (r.authUid ? r.authUid : null)),
  );

  for (const r of rows) {
    if (r.isDriverCandidate !== false) metrics.driverCandidates += 1;
    if (r.mappingStatus === "validMapped") metrics.validMapped += 1;
    if (r.testOrNoncanonical || r.mappingStatus === "testOrNoncanonical") {
      metrics.testOrNoncanonical += 1;
    }
    if (r.excludedNonDriver || r.mappingStatus === "excludedNonDriver") {
      metrics.excludedNonDriver += 1;
    }
    if (r.unmappedCountry || r.mappingStatus === "unmappedCountry") {
      metrics.unmappedCountry += 1;
    }
    if (r.unmappedCity || r.mappingStatus === "unmappedCity") {
      metrics.unmappedCity += 1;
    }
    if (r.malformed || r.mappingStatus === "malformed") {
      metrics.malformed += 1;
    }
    if (r.conflictingRegistration) metrics.conflictingRegistration += 1;
    if (r.registrationStatus === "unknown") metrics.unknownRegistration += 1;
    if (
      r.unknownDiscriminator ||
      r.mappingStatus === "unknownDiscriminator"
    ) {
      metrics.unknownDiscriminator += 1;
    }
    if (r.authUidKnowledge === "missing") metrics.missingAuthUid += 1;
    if (r.authUidKnowledge === "mismatch") metrics.authUidMismatch += 1;
  }

  return metrics;
}

export function driverMappingReadyForLiveClose(
  metrics: DriverDuplicateAuditMetrics,
  options?: { excludedNonDriverWithoutEvidence?: number },
): boolean {
  return (
    metrics.exactDocumentIdDuplicates === 0 &&
    metrics.unknownDiscriminator === 0 &&
    metrics.unmappedCountry === 0 &&
    metrics.unmappedCity === 0 &&
    metrics.malformed === 0 &&
    metrics.conflictingRegistration === 0 &&
    metrics.activeOperationalDuplicates === 0 &&
    metrics.unexpectedCollections === 0 &&
    (options?.excludedNonDriverWithoutEvidence ?? 0) === 0
  );
}

export function rowFromCanonicalDriver(
  model: CanonicalDriverReadModel,
  extras?: {
    phoneHash?: string | null;
    plateHash?: string | null;
    unknownDiscriminator?: boolean;
    conflictingRegistration?: boolean;
  },
): DriverIdentityRow {
  return {
    sourceDocumentId: model.sourceDocumentId,
    authUid: model.authUid,
    authUidKnowledge: model.authUidKnowledge,
    countryId: model.countryId.value,
    cityId: model.cityId.value,
    registrationStatus: model.registrationStatus,
    mappingStatus: model.mappingStatus,
    phoneHash: extras?.phoneHash ?? null,
    plateHash: extras?.plateHash ?? null,
    testOrNoncanonical: model.mappingStatus === "testOrNoncanonical",
    unmappedCountry: model.mappingStatus === "unmappedCountry",
    unmappedCity: model.mappingStatus === "unmappedCity",
    unknownDiscriminator:
      extras?.unknownDiscriminator ??
      model.mappingStatus === "unknownDiscriminator",
    excludedNonDriver: model.mappingStatus === "excludedNonDriver",
    malformed: model.mappingStatus === "malformed",
    conflictingRegistration:
      extras?.conflictingRegistration ??
      model.incompleteReasons.includes("conflicting_registration"),
    isDriverCandidate: model.isDriverCandidate,
    isOperationalDriver: model.isOperationalDriver,
  };
}

/** Test/demo markers — never delete; classify only. */
export function isTestOrNoncanonicalDriver(input: {
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
  const name = String(input.data.display_name ?? input.data.email ?? "").toLowerCase();
  if (name.includes("functional test") || name.includes("@touri-taxi-test")) {
    return true;
  }
  return false;
}
