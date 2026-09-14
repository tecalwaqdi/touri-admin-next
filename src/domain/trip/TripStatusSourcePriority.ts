/**
 * Phase 3.7 — Trip status source priority from Legacy evidence.
 * Evidence: docs/legacy-mapping/TRIP_STATUS_MAPPING.md +
 * mndob-main/lib/core/toury_system_status_codes.dart dual-write fields.
 *
 * Canonical machine field: order.status_code
 * Dual-write display fields are NOT independent SoT.
 */

export type TripStatusSource =
  | "status_code"
  | "halh_text"
  | "halh_order"
  | "halh"
  | "unknown";

export type TripStatusSourcePriorityRow = {
  rank: number;
  source: TripStatusSource;
  role: "authoritative" | "display_dual_write" | "legacy_fallback" | "forbidden_guess";
  confidence: "high" | "medium" | "low" | "unknown";
  evidence: string;
  notes: string;
};

/**
 * Ordered priority — first available authoritative source wins.
 * Never invent nearest status from Arabic labels alone when status_code missing
 * without marking unmapped + warning.
 */
export const TRIP_STATUS_SOURCE_PRIORITY: TripStatusSourcePriorityRow[] = [
  {
    rank: 1,
    source: "status_code",
    role: "authoritative",
    confidence: "high",
    evidence:
      "TRIP_STATUS_MAPPING.md — order.status_code shared TourySystemStatusCodes",
    notes: "Primary machine field for lifecycle",
  },
  {
    rank: 2,
    source: "halh_order",
    role: "display_dual_write",
    confidence: "medium",
    evidence: "TRIP_STATUS_MAPPING.md dual-write — Halh enum Paid/Pending/Canceled/Cash",
    notes: "Payment UX overlap; not independent SoT for trip lifecycle",
  },
  {
    rank: 3,
    source: "halh_text",
    role: "display_dual_write",
    confidence: "low",
    evidence: "displayHalhForCode dual-write Arabic label",
    notes: "Display only; if used without status_code → unmapped + warning",
  },
  {
    rank: 4,
    source: "halh",
    role: "legacy_fallback",
    confidence: "low",
    evidence: "OrderStatusHelper additional legacy string",
    notes: "Legacy string; prefer status_code",
  },
];

export type ResolvedTripStatusSource = {
  selected: TripStatusSource;
  rawValue: string | null;
  warnings: string[];
  isSafeForOperationalAction: boolean;
};

export function selectTripStatusSource(fields: {
  status_code?: string | null;
  halh_order?: string | null;
  halh_text?: string | null;
  halh?: string | null;
}): ResolvedTripStatusSource {
  const code = fields.status_code?.trim();
  if (code) {
    return {
      selected: "status_code",
      rawValue: code,
      warnings: [],
      isSafeForOperationalAction: true,
    };
  }

  const warnings: string[] = [
    "status_code missing — dual-write fields are not authoritative SoT",
  ];

  if (fields.halh_order?.trim()) {
    return {
      selected: "halh_order",
      rawValue: fields.halh_order.trim(),
      warnings: [
        ...warnings,
        "Using halh_order without status_code → operational actions blocked",
      ],
      isSafeForOperationalAction: false,
    };
  }
  if (fields.halh_text?.trim()) {
    return {
      selected: "halh_text",
      rawValue: fields.halh_text.trim(),
      warnings: [
        ...warnings,
        "Using halh_text without status_code → unmapped risk; ops blocked",
      ],
      isSafeForOperationalAction: false,
    };
  }
  if (fields.halh?.trim()) {
    return {
      selected: "halh",
      rawValue: fields.halh.trim(),
      warnings: [...warnings, "Using legacy halh string only"],
      isSafeForOperationalAction: false,
    };
  }

  return {
    selected: "unknown",
    rawValue: null,
    warnings: ["No trip status fields present"],
    isSafeForOperationalAction: false,
  };
}
