/**
 * Phase 3.6 — CanonicalFinancialSourcePriorityPolicy.
 * Field-specific: verified persisted snapshot > high-confidence derived >
 * low-confidence derived > unknown.
 * No recalculation of history when today's commission/VAT/agent/policy changes.
 */

import type { FinancialAvailabilityStatus } from "@/domain/canonical/FieldProvenance";

export type SourcePriorityTier =
  | "verified_persisted_snapshot"
  | "high_confidence_derived"
  | "low_confidence_derived"
  | "unknown";

export type FieldSourcePriorityRule = {
  field: string;
  tiers: SourcePriorityTier[];
  historicalRecalcForbidden: true;
  notes: string;
};

export const CANONICAL_FINANCIAL_SOURCE_PRIORITY_POLICY: FieldSourcePriorityRule[] =
  [
    {
      field: "platformCommissionAmount",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes:
        "Use order.total_app when present+valid. Do NOT recalculate with current %. Missing → null+incomplete.",
    },
    {
      field: "platformCommissionRate",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes:
        "Historical rate = null unless snapshotted/proven. FC-01 rate remains Future Policy Decision.",
    },
    {
      field: "driverNet",
      tiers: [
        "verified_persisted_snapshot",
        "high_confidence_derived",
        "unknown",
      ],
      historicalRecalcForbidden: true,
      notes:
        "total_mndob primary. Derived only with provenance; not settlement-eligible without explicit policy.",
    },
    {
      field: "vatAmount",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes: "Read stored total_vat; never recompute with current country VAT.",
    },
    {
      field: "vatRate",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes: "vatRateAtTrip=null if not historically proven on order.",
    },
    {
      field: "agentCommissionAmount",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes:
        "FIN-9 snapshot when present. Rate-only ≠ invent amount as high confidence.",
    },
    {
      field: "agentAttribution",
      tiers: ["verified_persisted_snapshot", "unknown"],
      historicalRecalcForbidden: true,
      notes:
        "Never attribute historical obligation to currently active country agent.",
    },
    {
      field: "chargebackAmount",
      tiers: ["unknown"],
      historicalRecalcForbidden: true,
      notes: "not_represented — amount null, never 0.",
    },
  ];

export function tierForAvailability(
  status: FinancialAvailabilityStatus,
  mappingConfidence: "high" | "medium" | "low" | "unknown" | "unproven",
): SourcePriorityTier {
  if (status === "available") return "verified_persisted_snapshot";
  if (status === "derived" && mappingConfidence === "high") {
    return "high_confidence_derived";
  }
  if (status === "derived") return "low_confidence_derived";
  return "unknown";
}

export const NO_HISTORICAL_RECALCULATION_RULE =
  "Changing today's commission/VAT/agent/policy MUST NOT recalculate historical trip financials.";
