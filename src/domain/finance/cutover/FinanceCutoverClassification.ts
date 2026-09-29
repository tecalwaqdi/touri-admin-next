/**
 * Cutover inventory classification — presentation/reporting only.
 * Does not mutate money or delete records.
 */

import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import {
  classifySettlementCommercialEligibility,
  type SettlementCommercialClass,
} from "@/domain/finance/reporting/SettlementCommercialCutover";
import type {
  ReportingSettlementSource,
  ReportingSnapshotSource,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { isPreCutover } from "@/domain/finance/cutover/FinanceCutoverConfig";

export type FinanceCutoverRecordClass =
  | "REAL_CERTIFIED"
  | "REAL_UNPAID"
  | "REAL_INCOMPLETE"
  | "REAL_CONFLICT"
  | "LEGACY_ORPHAN"
  | "QA_TEST"
  | "DEMO_PILOT"
  | "UNCLASSIFIED";

export type FinanceCutoverRecordKind =
  | "order"
  | "snapshot"
  | "settlement"
  | "payment"
  | "wallet_transaction"
  | "adjustment"
  | "reconciliation"
  | "finance_audit"
  | "legacy_fin_set";

export type FinanceCutoverInventoryRow = {
  kind: FinanceCutoverRecordKind;
  id: string;
  class: FinanceCutoverRecordClass;
  reasons: string[];
  countryId: string | null;
  currency: string | null;
  partyType: "driver" | "agent" | null;
  partyId: string | null;
  eventUtc: string | null;
  preCutover: boolean;
  amountMinor: string | null;
  paidConfirmedMinor: string | null;
  outstandingMinor: string | null;
  /** Settlement V2 direction when known. */
  direction: string | null;
  /** Proven synthetic via registry/fixture constants — eligible for delete dry-run. */
  provenanceProvenSynthetic: boolean;
  sourceReferences: string[];
};

export function outstandingMinorOf(
  amountMinor: bigint | null,
  paidConfirmedMinor: bigint | null,
): string | null {
  if (amountMinor == null || paidConfirmedMinor == null) return null;
  return (amountMinor - paidConfirmedMinor).toString();
}

export function mapCommercialToCutoverClass(
  commercial: SettlementCommercialClass,
  unpaid: boolean,
  conflict: boolean,
): FinanceCutoverRecordClass {
  if (commercial === "qa_pilot") return "QA_TEST";
  if (commercial === "legacy_orphan") return "LEGACY_ORPHAN";
  if (conflict) return "REAL_CONFLICT";
  if (unpaid) return "REAL_UNPAID";
  return "REAL_CERTIFIED";
}

export function classifyCutoverSettlement(input: {
  settlement: ReportingSettlementSource;
  snapshotsById: ReadonlyMap<string, ReportingSnapshotSource>;
  cutoverDateUtc: string;
  conflictSettlementIds?: ReadonlySet<string>;
  provenanceProvenIds?: ReadonlySet<string>;
}): FinanceCutoverInventoryRow {
  const s = input.settlement;
  const commercial = classifySettlementCommercialEligibility({
    settlement: s,
    snapshotsById: input.snapshotsById,
  });
  const outstanding = outstandingMinorOf(s.amountMinor, s.paidConfirmedMinor);
  let unpaid = false;
  if (outstanding != null) {
    try {
      unpaid = BigInt(outstanding) !== 0n;
    } catch {
      unpaid = false;
    }
  } else if (commercial.class === "commercial_certified") {
    // Certified but amounts incomplete → incomplete, not unpaid fabrication
    unpaid = false;
  }
  const conflict = input.conflictSettlementIds?.has(s.id) === true;
  let recordClass = mapCommercialToCutoverClass(
    commercial.class,
    unpaid && commercial.class === "commercial_certified",
    conflict,
  );
  if (
    commercial.class === "commercial_certified" &&
    (s.amountMinor == null || s.paidConfirmedMinor == null)
  ) {
    recordClass = "REAL_INCOMPLETE";
  }
  if (
    commercial.class === "qa_pilot" &&
    /demo_|pilot_/i.test(s.id)
  ) {
    recordClass = "DEMO_PILOT";
  }

  const eventUtc = s.periodToUtc ?? s.updatedAtUtc ?? s.periodFromUtc;
  const provenance =
    input.provenanceProvenIds?.has(s.id) === true ||
    (s.sourceAccountingSnapshotId != null &&
      input.provenanceProvenIds?.has(s.sourceAccountingSnapshotId) === true);

  return {
    kind: s.id.startsWith("fin_set_") ? "legacy_fin_set" : "settlement",
    id: s.id,
    class: recordClass,
    reasons: [
      ...commercial.reasons,
      ...(unpaid ? ["outstanding_nonzero"] : []),
      ...(conflict ? ["recon_conflict"] : []),
      ...(recordClass === "REAL_INCOMPLETE"
        ? ["settlement_amounts_incomplete"]
        : []),
    ],
    countryId: s.countryId || null,
    currency: s.currency || null,
    partyType: s.partyType,
    partyId: s.partyId,
    eventUtc,
    preCutover: isPreCutover(eventUtc, input.cutoverDateUtc),
    amountMinor: s.amountMinor?.toString() ?? null,
    paidConfirmedMinor: s.paidConfirmedMinor?.toString() ?? null,
    outstandingMinor: outstanding,
    direction: String(s.direction || "") || null,
    provenanceProvenSynthetic: provenance,
    sourceReferences: [
      s.sourceAccountingSnapshotId
        ? `snapshot:${s.sourceAccountingSnapshotId}`
        : null,
      s.sourceOrderId ? `order:${s.sourceOrderId}` : null,
    ].filter(Boolean) as string[],
  };
}

export function classifyCutoverSnapshot(input: {
  snapshot: ReportingSnapshotSource;
  cutoverDateUtc: string;
  conflictSnapshotIds?: ReadonlySet<string>;
  provenanceProvenIds?: ReadonlySet<string>;
}): FinanceCutoverInventoryRow {
  const s = input.snapshot;
  const qa =
    isFinanceQaOrPilotRecordId(s.id) || isFinanceQaOrPilotRecordId(s.orderId);
  const conflict = input.conflictSnapshotIds?.has(s.id) === true;
  let recordClass: FinanceCutoverRecordClass;
  const reasons: string[] = [];
  if (qa) {
    recordClass = /demo_|pilot_/i.test(s.id) ? "DEMO_PILOT" : "QA_TEST";
    reasons.push("qa_or_pilot_id");
  } else if (conflict) {
    recordClass = "REAL_CONFLICT";
    reasons.push("finance_conflict");
  } else if (!s.lifecycleCompleted || s.grossFareMinor == null) {
    recordClass = "REAL_INCOMPLETE";
    if (!s.lifecycleCompleted) reasons.push("lifecycle_incomplete");
    if (s.grossFareMinor == null) reasons.push("gross_fare_missing");
  } else {
    recordClass = "REAL_CERTIFIED";
    reasons.push("lifecycle_completed");
  }

  return {
    kind: "snapshot",
    id: s.id,
    class: recordClass,
    reasons,
    countryId: s.countryId || null,
    currency: s.currency || null,
    partyType: s.driverId ? "driver" : s.agentId ? "agent" : null,
    partyId: s.driverId ?? s.agentId ?? null,
    eventUtc: s.createdAtUtc,
    preCutover: isPreCutover(s.createdAtUtc, input.cutoverDateUtc),
    amountMinor: s.grossFareMinor?.toString() ?? null,
    paidConfirmedMinor: null,
    outstandingMinor: null,
    direction: null,
    provenanceProvenSynthetic:
      input.provenanceProvenIds?.has(s.id) === true ||
      input.provenanceProvenIds?.has(s.orderId) === true,
    sourceReferences: [`order:${s.orderId}`],
  };
}
