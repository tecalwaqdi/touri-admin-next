/**
 * Accountant-facing data classification badges — presentation only.
 * Does NOT change certified totals or commercial cutover math.
 */

import { isFinanceQaOrPilotRecordId } from "@/domain/catalog/QaTestRecordFilter";
import { classifySettlementCommercialEligibility } from "@/domain/finance/reporting/SettlementCommercialCutover";
import type {
  ReportingSettlementSource,
  ReportingSnapshotSource,
} from "@/domain/finance/reporting/FinanceReportingTypes";

/** UI classification codes for accountant workspace V2. */
export type AccountantDataClass =
  | "certified"
  | "operational"
  | "historical"
  | "qa_test"
  | "incomplete"
  | "conflict"
  | "uncertified";

export type AccountantClassifiedRow = {
  dataClass: AccountantDataClass;
  reasons: string[];
};

export function classifyAccountantSnapshot(input: {
  snapshot: ReportingSnapshotSource;
  hasConflict?: boolean;
}): AccountantClassifiedRow {
  const s = input.snapshot;
  const reasons: string[] = [];
  if (isFinanceQaOrPilotRecordId(s.id) || isFinanceQaOrPilotRecordId(s.orderId)) {
    return { dataClass: "qa_test", reasons: ["qa_or_pilot_id"] };
  }
  if (input.hasConflict) {
    return { dataClass: "conflict", reasons: ["recon_or_finance_conflict"] };
  }
  if (!s.lifecycleCompleted) {
    reasons.push("lifecycle_incomplete");
    return { dataClass: "incomplete", reasons };
  }
  if (s.grossFareMinor == null) {
    reasons.push("gross_fare_missing");
    return { dataClass: "incomplete", reasons };
  }
  return { dataClass: "certified", reasons: ["lifecycle_completed"] };
}

export function classifyAccountantSettlement(input: {
  settlement: ReportingSettlementSource;
  snapshotsById: ReadonlyMap<string, ReportingSnapshotSource>;
  reconFail?: boolean;
}): AccountantClassifiedRow {
  const commercial = classifySettlementCommercialEligibility({
    settlement: input.settlement,
    snapshotsById: input.snapshotsById,
  });
  if (commercial.class === "qa_pilot") {
    return { dataClass: "qa_test", reasons: commercial.reasons };
  }
  if (commercial.class === "legacy_orphan") {
    return { dataClass: "historical", reasons: commercial.reasons };
  }
  if (input.reconFail) {
    return { dataClass: "conflict", reasons: ["recon_difference"] };
  }
  if (commercial.class === "commercial_certified") {
    return { dataClass: "certified", reasons: commercial.reasons };
  }
  return { dataClass: "uncertified", reasons: commercial.reasons };
}

export function classifyAccountantGenericId(
  id: string | null | undefined,
): AccountantClassifiedRow {
  if (isFinanceQaOrPilotRecordId(id)) {
    return { dataClass: "qa_test", reasons: ["qa_or_pilot_id"] };
  }
  return { dataClass: "operational", reasons: [] };
}

/** Terminology keys for badges (financeTerminology). */
export const ACCOUNTANT_CLASS_TERM_KEYS: Record<AccountantDataClass, string> = {
  certified: "classCertified",
  operational: "classOperational",
  historical: "classHistorical",
  qa_test: "classQaTest",
  incomplete: "classIncomplete",
  conflict: "classConflict",
  uncertified: "classUncertified",
};
