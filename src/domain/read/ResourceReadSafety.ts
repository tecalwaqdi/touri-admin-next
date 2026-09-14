/**
 * Phase 3.7 — Resource-level read safety for future Phase 4.
 */

import type { ReadSafetyLevel } from "@/domain/read/ReadQuery";

export type ResourceKind =
  | "Trip"
  | "Driver"
  | "Customer"
  | "Agent"
  | "FinancialTrip"
  | "Settlement";

export type ResourceReadSafety = {
  resource: ResourceKind;
  defaultLevel: ReadSafetyLevel;
  notes: string;
  phase4Eligible: boolean;
};

export const RESOURCE_READ_SAFETY: ResourceReadSafety[] = [
  {
    resource: "Trip",
    defaultLevel: "SAFE_WITH_WARNING",
    notes: "Unknown status → UNMAPPED; base displayable; ops blocked",
    phase4Eligible: true,
  },
  {
    resource: "Driver",
    defaultLevel: "SAFE_WITH_WARNING",
    notes: "Five orthogonal statuses; PII masked by default",
    phase4Eligible: true,
  },
  {
    resource: "Customer",
    defaultLevel: "REDACTED",
    notes: "Summary ok; phone/email require customers:read_pii for full",
    phase4Eligible: true,
  },
  {
    resource: "Agent",
    defaultLevel: "SAFE_WITH_WARNING",
    notes: "Country-scoped; financial rates may warn",
    phase4Eligible: true,
  },
  {
    resource: "FinancialTrip",
    defaultLevel: "SAFE_WITH_WARNING",
    notes: "READ_SAFE / READ_WITH_WARNING only; DO_NOT_EXPOSE_YET blocked",
    phase4Eligible: true,
  },
  {
    resource: "Settlement",
    defaultLevel: "BLOCKED",
    notes: "Settlement V2 not high-confidence for Phase 4 shadow read",
    phase4Eligible: false,
  },
];
