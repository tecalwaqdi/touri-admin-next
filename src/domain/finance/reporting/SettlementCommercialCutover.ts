/**
 * Settlement V2 commercial cutover — classify settlements for accountant vs legacy.
 *
 * Commercial / accountant path: certified snapshot-backed Settlement V2 only.
 * Legacy orphans (e.g. fin_set_* without sourceSnapshotId): isolated, never deleted.
 * QA/pilot: excluded from commercial (existing isFinanceQaOrPilotRecordId).
 */

import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import type {
  ReportingSettlementSource,
  ReportingSnapshotSource,
} from "@/domain/finance/reporting/FinanceReportingTypes";

export const SETTLEMENT_V2_STATUSES = new Set([
  "draft",
  "locked",
  "partially_paid",
  "settled",
  "voided",
]);

export type SettlementCommercialClass =
  | "commercial_certified"
  | "legacy_orphan"
  | "qa_pilot";

export type SettlementCommercialClassification = {
  class: SettlementCommercialClass;
  reasons: string[];
};

export function classifySettlementCommercialEligibility(input: {
  settlement: ReportingSettlementSource;
  snapshotsById: ReadonlyMap<string, ReportingSnapshotSource>;
}): SettlementCommercialClassification {
  const s = input.settlement;
  const reasons: string[] = [];

  if (isFinanceQaOrPilotRecordId(s.id)) {
    return { class: "qa_pilot", reasons: ["settlement_id_qa_or_pilot"] };
  }

  const sourceId = s.sourceAccountingSnapshotId?.trim() || null;
  if (!sourceId) {
    reasons.push("missing_source_snapshot_id");
    return { class: "legacy_orphan", reasons };
  }

  if (isFinanceQaOrPilotRecordId(sourceId)) {
    return {
      class: "qa_pilot",
      reasons: ["source_snapshot_qa_or_pilot"],
    };
  }

  const snap = input.snapshotsById.get(sourceId);
  if (!snap) {
    reasons.push("referenced_snapshot_missing");
    return { class: "legacy_orphan", reasons };
  }

  if (isFinanceQaOrPilotRecordId(snap.id) || isFinanceQaOrPilotRecordId(snap.orderId)) {
    return {
      class: "qa_pilot",
      reasons: ["snapshot_document_qa_or_pilot"],
    };
  }

  if (!snap.lifecycleCompleted) {
    reasons.push("snapshot_not_lifecycle_completed");
    return { class: "legacy_orphan", reasons };
  }

  const status = String(s.status || "").trim().toLowerCase();
  if (!SETTLEMENT_V2_STATUSES.has(status)) {
    reasons.push(`status_not_settlement_v2:${status || "empty"}`);
    return { class: "legacy_orphan", reasons };
  }

  return { class: "commercial_certified", reasons: ["certified_snapshot_backed"] };
}

export function buildSnapshotIndex(
  snapshots: readonly ReportingSnapshotSource[],
): Map<string, ReportingSnapshotSource> {
  const map = new Map<string, ReportingSnapshotSource>();
  for (const s of snapshots) {
    map.set(s.id, s);
  }
  return map;
}

export function partitionSettlementsForCommercialCutover(input: {
  settlements: readonly ReportingSettlementSource[];
  snapshots: readonly ReportingSnapshotSource[];
}): {
  commercial: ReportingSettlementSource[];
  legacyOrphan: ReportingSettlementSource[];
  qaPilot: ReportingSettlementSource[];
  classifications: Map<string, SettlementCommercialClassification>;
} {
  const snaps = buildSnapshotIndex(input.snapshots);
  const commercial: ReportingSettlementSource[] = [];
  const legacyOrphan: ReportingSettlementSource[] = [];
  const qaPilot: ReportingSettlementSource[] = [];
  const classifications = new Map<string, SettlementCommercialClassification>();

  for (const s of input.settlements) {
    const cls = classifySettlementCommercialEligibility({
      settlement: s,
      snapshotsById: snaps,
    });
    classifications.set(s.id, cls);
    if (cls.class === "commercial_certified") commercial.push(s);
    else if (cls.class === "qa_pilot") qaPilot.push(s);
    else legacyOrphan.push(s);
  }

  return { commercial, legacyOrphan, qaPilot, classifications };
}

/** Certified commercial snapshots (non-QA, lifecycle completed). */
export function listCertifiedCommercialSnapshots(
  snapshots: readonly ReportingSnapshotSource[],
): ReportingSnapshotSource[] {
  return snapshots.filter(
    (s) =>
      s.lifecycleCompleted &&
      !isFinanceQaOrPilotRecordId(s.id) &&
      !isFinanceQaOrPilotRecordId(s.orderId),
  );
}

export function countUnsettledCertifiedCommercialSnapshots(input: {
  snapshots: readonly ReportingSnapshotSource[];
  settlements: readonly ReportingSettlementSource[];
}): number {
  const certified = listCertifiedCommercialSnapshots(input.snapshots);
  const used = new Set(
    input.settlements
      .map((s) => s.sourceAccountingSnapshotId?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  return certified.filter((s) => !used.has(s.id)).length;
}

export const LEGACY_ORPHAN_REASON_AR =
  "لا توجد لقطة محاسبية معتمدة مرتبطة" as const;
export const LEGACY_ORPHAN_REASON_EN =
  "No linked certified accounting snapshot" as const;
export const NO_CERTIFIED_SETTLEMENTS_AR =
  "لا توجد تسويات مالية معتمدة حتى الآن" as const;
export const NO_CERTIFIED_SETTLEMENTS_EN =
  "No certified settlements yet" as const;
export const NO_CERTIFIED_FINANCE_DATA_AR =
  "لا توجد بيانات مالية معتمدة حتى الآن" as const;
export const NO_CERTIFIED_FINANCE_DATA_EN =
  "No certified financial data yet" as const;
export const LEGACY_SECTION_TITLE_AR =
  "التسويات التاريخية / غير المرتبطة" as const;
export const LEGACY_SECTION_TITLE_EN =
  "Historical / unlinked settlements" as const;
export const LEGACY_REVIEW_COUNTER_AR =
  "تسويات تاريخية تحتاج مراجعة" as const;
export const LEGACY_REVIEW_COUNTER_EN =
  "Historical settlements needing review" as const;
