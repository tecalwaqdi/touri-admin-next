/**
 * Dashboard KPI QA / pilot exclusion (default OFF for test records).
 * Classification only — never deletes Production documents.
 */

import {
  classifyProductionRecord,
  type RecordClass,
} from "@/domain/production-read/RecordClassification";

export type DashboardQaRow = {
  id: string | null | undefined;
  mappingStatus?: string | null;
  domainTestOrNoncanonical?: boolean;
};

/**
 * When includeTestRecords is false (default), exclude pilot/test rows from KPIs.
 * Uncertain/unknown rows stay included (fail-open for real ops data).
 */
export function includeRowInDashboardKpi(
  row: DashboardQaRow,
  includeTestRecords: boolean,
): boolean {
  if (includeTestRecords) return true;
  const { recordClass } = classifyProductionRecord(row);
  return recordClass !== "pilot" && recordClass !== "test";
}

export function isQaOrPilotClass(recordClass: RecordClass): boolean {
  return recordClass === "pilot" || recordClass === "test";
}
