/**
 * Phase 4A-4 — Trip duplicate / identity audit (offline metrics).
 * Evidence-based: document id is identity; IDorder is display alias only.
 */

import type { TripMappingStatus } from "@/domain/trip/TripRecordClassification";

export type TripDuplicateKind =
  | "exact_canonical"
  | "same_idorder_alias"
  | "semantic_customer_time"
  | "active_operational";

export type TripIdentityRow = {
  sourceDocumentId: string;
  canonicalTripId: string;
  iDorder: string | null;
  customerId: string | null;
  createdAtUtc: string | null;
  mappingStatus: TripMappingStatus;
  lifecycleStatus: string;
  activeOrderFlag: boolean | null;
  /** customerIdKnowledge === "unknown" (malformed USER ref). */
  unknownCustomerReference?: boolean;
  /** driverIdKnowledge === "unknown". */
  unknownDriverReference?: boolean;
  /** lifecycleStatus === "unmapped". */
  unknownLifecycleStatus?: boolean;
  /** Proven cancel-actor / lifecycle conflict (e.g. actorKnowledge conflicting). */
  conflictingLifecycleStatus?: boolean;
  /** Any financial field knowledge === "unknown" (legacy aggregate). */
  financialUnknown?: boolean;
  /** Any financial field knowledge === "conflicting". */
  financialConflicting?: boolean;
  /** Split financial knowledge flags (Phase 4A-4 missing-city audit). */
  financialPersistedComplete?: boolean;
  financialAmountUnknown?: boolean;
  financialRateUnknown?: boolean;
  financialNotRepresented?: boolean;
  financialDerived?: boolean;
};

export type TripDuplicateHit = {
  kind: TripDuplicateKind;
  leftSourceDocumentId: string;
  rightSourceDocumentId: string;
  evidence: string;
};

export type TripDuplicateAuditMetrics = {
  recordsRead: number;
  validMapped: number;
  unmappedCountry: number;
  unmappedCity: number;
  unmappedStatus: number;
  ambiguousCountry: number;
  ambiguousCity: number;
  malformed: number;
  testOrNoncanonical: number;
  unknownCustomerReference: number;
  unknownDriverReference: number;
  unknownLifecycleStatus: number;
  conflictingLifecycleStatus: number;
  financialUnknown: number;
  financialConflicting: number;
  financialPersistedComplete: number;
  financialAmountUnknown: number;
  financialRateUnknown: number;
  financialNotRepresented: number;
  financialDerived: number;
  exactCanonicalDuplicates: number;
  sameIdOrderAliasDuplicates: number;
  semanticCustomerTimeDuplicates: number;
  /** Alias for live summary field `semanticDuplicates`. */
  semanticDuplicates: number;
  activeOperationalDuplicates: number;
  hits: TripDuplicateHit[];
};

export function emptyTripDuplicateAuditMetrics(): TripDuplicateAuditMetrics {
  return {
    recordsRead: 0,
    validMapped: 0,
    unmappedCountry: 0,
    unmappedCity: 0,
    unmappedStatus: 0,
    ambiguousCountry: 0,
    ambiguousCity: 0,
    malformed: 0,
    testOrNoncanonical: 0,
    unknownCustomerReference: 0,
    unknownDriverReference: 0,
    unknownLifecycleStatus: 0,
    conflictingLifecycleStatus: 0,
    financialUnknown: 0,
    financialConflicting: 0,
    financialPersistedComplete: 0,
    financialAmountUnknown: 0,
    financialRateUnknown: 0,
    financialNotRepresented: 0,
    financialDerived: 0,
    exactCanonicalDuplicates: 0,
    sameIdOrderAliasDuplicates: 0,
    semanticCustomerTimeDuplicates: 0,
    semanticDuplicates: 0,
    activeOperationalDuplicates: 0,
    hits: [],
  };
}

export function tallyTripMappingStatus(
  metrics: TripDuplicateAuditMetrics,
  status: TripMappingStatus,
): void {
  metrics.recordsRead += 1;
  switch (status) {
    case "validMapped":
      metrics.validMapped += 1;
      break;
    case "unmappedCountry":
      metrics.unmappedCountry += 1;
      break;
    case "unmappedCity":
      metrics.unmappedCity += 1;
      break;
    case "unmappedStatus":
      metrics.unmappedStatus += 1;
      break;
    case "ambiguousCountry":
      metrics.ambiguousCountry += 1;
      break;
    case "ambiguousCity":
      metrics.ambiguousCity += 1;
      break;
    case "malformed":
      metrics.malformed += 1;
      break;
    case "testOrNoncanonical":
      metrics.testOrNoncanonical += 1;
      break;
  }
}

function tallyExtendedRowFlags(
  metrics: TripDuplicateAuditMetrics,
  row: TripIdentityRow,
): void {
  if (row.unknownCustomerReference) metrics.unknownCustomerReference += 1;
  if (row.unknownDriverReference) metrics.unknownDriverReference += 1;
  if (row.unknownLifecycleStatus) metrics.unknownLifecycleStatus += 1;
  if (row.conflictingLifecycleStatus) metrics.conflictingLifecycleStatus += 1;
  if (row.financialUnknown) metrics.financialUnknown += 1;
  if (row.financialConflicting) metrics.financialConflicting += 1;
  if (row.financialPersistedComplete) metrics.financialPersistedComplete += 1;
  if (row.financialAmountUnknown) metrics.financialAmountUnknown += 1;
  if (row.financialRateUnknown) metrics.financialRateUnknown += 1;
  if (row.financialNotRepresented) metrics.financialNotRepresented += 1;
  if (row.financialDerived) metrics.financialDerived += 1;
}

/**
 * Offline duplicate audit. Never auto-merges identities.
 */
export function auditTripDuplicates(
  rows: TripIdentityRow[],
): TripDuplicateAuditMetrics {
  const metrics = emptyTripDuplicateAuditMetrics();
  for (const r of rows) {
    tallyTripMappingStatus(metrics, r.mappingStatus);
    tallyExtendedRowFlags(metrics, r);
  }

  const byCanonical = new Map<string, TripIdentityRow[]>();
  const byIdOrder = new Map<string, TripIdentityRow[]>();
  const byCustomerTime = new Map<string, TripIdentityRow[]>();

  for (const r of rows) {
    if (r.mappingStatus === "testOrNoncanonical") continue;
    const cList = byCanonical.get(r.canonicalTripId) ?? [];
    cList.push(r);
    byCanonical.set(r.canonicalTripId, cList);

    if (r.iDorder) {
      const key = r.iDorder.trim().toLowerCase();
      const list = byIdOrder.get(key) ?? [];
      list.push(r);
      byIdOrder.set(key, list);
    }

    if (r.customerId && r.createdAtUtc) {
      const ct = `${r.customerId}|${r.createdAtUtc}`;
      const list = byCustomerTime.get(ct) ?? [];
      list.push(r);
      byCustomerTime.set(ct, list);
    }
  }

  for (const [, list] of byCanonical) {
    if (list.length < 2) continue;
    const distinct = new Set(list.map((x) => x.sourceDocumentId));
    if (distinct.size < 2) continue;
    metrics.exactCanonicalDuplicates += distinct.size - 1;
    const [a, b] = list;
    metrics.hits.push({
      kind: "exact_canonical",
      leftSourceDocumentId: a.sourceDocumentId,
      rightSourceDocumentId: b.sourceDocumentId,
      evidence: `same canonicalTripId=${a.canonicalTripId}`,
    });
  }

  for (const [idOrder, list] of byIdOrder) {
    const distinctDocs = new Set(list.map((x) => x.sourceDocumentId));
    if (distinctDocs.size < 2) continue;
    metrics.sameIdOrderAliasDuplicates += distinctDocs.size - 1;
    const [a, b] = list;
    metrics.hits.push({
      kind: "same_idorder_alias",
      leftSourceDocumentId: a.sourceDocumentId,
      rightSourceDocumentId: b.sourceDocumentId,
      evidence: `same IDorder=${idOrder}`,
    });
  }

  for (const [ct, list] of byCustomerTime) {
    const distinctDocs = new Set(list.map((x) => x.sourceDocumentId));
    if (distinctDocs.size < 2) continue;
    metrics.semanticCustomerTimeDuplicates += distinctDocs.size - 1;
    metrics.semanticDuplicates += distinctDocs.size - 1;
    const [a, b] = list;
    metrics.hits.push({
      kind: "semantic_customer_time",
      leftSourceDocumentId: a.sourceDocumentId,
      rightSourceDocumentId: b.sourceDocumentId,
      evidence: `same customer+createdAt=${ct}`,
    });
  }

  const active = rows.filter(
    (r) =>
      r.activeOrderFlag === true &&
      r.mappingStatus !== "testOrNoncanonical" &&
      r.mappingStatus !== "malformed",
  );
  const byCustomerActive = new Map<string, TripIdentityRow[]>();
  for (const r of active) {
    if (!r.customerId) continue;
    const list = byCustomerActive.get(r.customerId) ?? [];
    list.push(r);
    byCustomerActive.set(r.customerId, list);
  }
  for (const [cust, list] of byCustomerActive) {
    if (list.length < 2) continue;
    metrics.activeOperationalDuplicates += list.length - 1;
    const [a, b] = list;
    metrics.hits.push({
      kind: "active_operational",
      leftSourceDocumentId: a.sourceDocumentId,
      rightSourceDocumentId: b.sourceDocumentId,
      evidence: `multiple ActiveOrder=true for customer=${cust}`,
    });
  }

  return metrics;
}

export const EMPTY_TRIP_WINDOW_BLOCKER = "EMPTY_TRIP_WINDOW" as const;

/**
 * Live-close gate for trips window (offline readiness uses same thresholds).
 * Zero-row pages cannot prove mapping readiness → not ready.
 * cityNotRepresented (optional Legacy vill absent) does NOT block.
 * Only unmappedCity / malformed / cityMissingUnresolved (among city states) block.
 * financialUnknown / financialNotRepresented alone do NOT block; financialConflicting does.
 */
export function tripMappingReadyForLiveClose(
  metrics: TripDuplicateAuditMetrics,
  geography?: {
    cityMissingUnresolved?: number;
    cityNotRepresented?: number;
  },
): boolean {
  if (metrics.recordsRead <= 0) return false;
  // cityNotRepresented is intentionally ignored — does not fail the gate.
  if ((geography?.cityMissingUnresolved ?? 0) > 0) return false;
  return (
    metrics.unmappedCountry === 0 &&
    metrics.unmappedCity === 0 &&
    metrics.unmappedStatus === 0 &&
    metrics.ambiguousCountry === 0 &&
    metrics.ambiguousCity === 0 &&
    metrics.malformed === 0 &&
    metrics.unknownLifecycleStatus === 0 &&
    metrics.conflictingLifecycleStatus === 0 &&
    metrics.financialConflicting === 0 &&
    metrics.activeOperationalDuplicates === 0
  );
}

/** Classify empty-window live result for harness / summary. */
export function classifyEmptyTripWindow(metrics: {
  recordsRead: number;
}): {
  overallStatus: "NO_GO";
  mappingReadyForLiveClose: false;
  blocker: typeof EMPTY_TRIP_WINDOW_BLOCKER;
} | null {
  if (metrics.recordsRead > 0) return null;
  return {
    overallStatus: "NO_GO",
    mappingReadyForLiveClose: false,
    blocker: EMPTY_TRIP_WINDOW_BLOCKER,
  };
}
