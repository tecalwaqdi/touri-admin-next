/**
 * Phase 4A-4 — Trip lifecycle status from Legacy evidence.
 * Authoritative machine field: order.status_code (TourySystemStatusCodes).
 * Dual-write display fields are NOT independent SoT.
 *
 * Evidence:
 * - mndob-main/lib/core/toury_system_status_codes.dart
 * - Admi/lib/core/toury_system_status_codes.dart
 * - docs/legacy-mapping/TRIP_STATUS_MAPPING.md
 * - docs/legacy-mapping/TRIP_STATUS_SOURCE_PRIORITY.md
 */

import {
  selectTripStatusSource,
  type TripStatusSource,
} from "@/domain/trip/TripStatusSourcePriority";

/** Proven lifecycle names from TourySystemStatusCodes (+ legacy aliases collapsed). */
export const TRIP_LIFECYCLE_STATUSES = [
  "pending_driver",
  "driver_assigned",
  "driver_arriving",
  "driver_arrived",
  "trip_started",
  "trip_in_progress",
  "completed",
  "cancelled_by_customer",
  "cancelled_by_driver",
  "cancelled_by_admin",
  "expired",
  "unmapped",
] as const;

export type TripLifecycleStatus = (typeof TRIP_LIFECYCLE_STATUSES)[number];

const ALIAS_TO_CANONICAL: Record<string, TripLifecycleStatus> = {
  pending_driver: "pending_driver",
  awaiting_driver: "pending_driver",
  pending: "pending_driver",
  payment_pending: "pending_driver",
  driver_assigned: "driver_assigned",
  driver_arriving: "driver_arriving",
  driver_arrived: "driver_arrived",
  trip_started: "trip_started",
  trip_in_progress: "trip_in_progress",
  completed: "completed",
  trip_completed: "completed",
  cancelled_by_customer: "cancelled_by_customer",
  cancelled_by_driver: "cancelled_by_driver",
  cancelled_by_admin: "cancelled_by_admin",
  cancelled: "cancelled_by_driver", // Legacy generic — actor unknown without cancelledBy
  canceled: "cancelled_by_driver",
  expired: "expired",
};

/** Arabic halh_text → code (TourySystemStatusCodes.fromHalhText) — NEVER preferred over status_code. */
const HALH_TEXT_TO_CODE: Record<string, TripLifecycleStatus> = {
  "بإنتظار قبول المندوب": "pending_driver",
  "بانتظار قبول المندوب": "pending_driver",
  Pending: "pending_driver",
  مقبول: "driver_assigned",
  "وصل المندوب": "driver_arrived",
  "تم البدء في الرحلة": "trip_in_progress",
  مكتمل: "completed",
  مكتملة: "completed",
  ملغي: "cancelled_by_driver",
};

export type TripLifecycleResolveInput = {
  status_code?: string | null;
  order_status?: string | null;
  status?: string | null;
  ActiveOrder?: boolean | null;
  active?: boolean | null;
  accepted?: boolean | null;
  arrived?: boolean | null;
  started?: boolean | null;
  finished?: boolean | null;
  cancelled?: boolean | null;
  cancelledBy?: string | null;
  DATEEND?: unknown;
  endTime?: unknown;
  START?: unknown;
  halh_order?: string | null;
  halh_text?: string | null;
  halh?: string | null;
};

export type TripLifecycleResolveResult = {
  status: TripLifecycleStatus;
  rawStatusCode: string | null;
  source: TripStatusSource;
  sourcePriorityRank: number;
  isSafeForOperationalAction: boolean;
  isTerminal: boolean;
  warnings: string[];
  /** Boolean / timestamp fields observed — never used alone as SoT. */
  evidenceFlags: string[];
};

function normalizeCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toLowerCase();
  return t.length ? t : null;
}

export function isTerminalTripLifecycle(status: TripLifecycleStatus): boolean {
  return (
    status === "completed" ||
    status === "cancelled_by_customer" ||
    status === "cancelled_by_driver" ||
    status === "cancelled_by_admin" ||
    status === "expired"
  );
}

export function mapLegacyStatusCodeToLifecycle(
  raw: string | null | undefined,
): TripLifecycleStatus | null {
  const n = normalizeCode(raw);
  if (!n) return null;
  return ALIAS_TO_CANONICAL[n] ?? null;
}

/**
 * Evidence priority (never invent from absence alone):
 * 1. status_code (authoritative)
 * 2. order_status / status string variants (legacy machine aliases — still secondary)
 * 3. halh_order / 4. halh_text / 5. halh — dual-write; ops blocked
 * Boolean ActiveOrder/accepted/arrived/started/finished/cancelled and finish
 * timestamps are corroborating evidence only — never sole lifecycle SoT.
 */
export function resolveTripLifecycleStatus(
  input: TripLifecycleResolveInput,
): TripLifecycleResolveResult {
  const evidenceFlags: string[] = [];
  if (typeof input.ActiveOrder === "boolean") {
    evidenceFlags.push(`ActiveOrder=${input.ActiveOrder}`);
  }
  if (typeof input.active === "boolean") evidenceFlags.push(`active=${input.active}`);
  if (typeof input.accepted === "boolean")
    evidenceFlags.push(`accepted=${input.accepted}`);
  if (typeof input.arrived === "boolean")
    evidenceFlags.push(`arrived=${input.arrived}`);
  if (typeof input.started === "boolean")
    evidenceFlags.push(`started=${input.started}`);
  if (typeof input.finished === "boolean")
    evidenceFlags.push(`finished=${input.finished}`);
  if (typeof input.cancelled === "boolean")
    evidenceFlags.push(`cancelled=${input.cancelled}`);
  if (input.cancelledBy != null && String(input.cancelledBy).trim()) {
    evidenceFlags.push(`cancelledBy=${String(input.cancelledBy).trim()}`);
  }
  if (input.DATEEND != null) evidenceFlags.push("DATEEND_present");
  if (input.endTime != null) evidenceFlags.push("endTime_present");
  if (input.START != null) evidenceFlags.push("START_present");

  const statusCode =
    normalizeCode(input.status_code) ??
    normalizeCode(input.order_status) ??
    normalizeCode(input.status);

  const selected = selectTripStatusSource({
    status_code: input.status_code ?? input.order_status ?? input.status,
    halh_order: input.halh_order,
    halh_text: input.halh_text,
    halh: input.halh,
  });

  const warnings = [...selected.warnings];

  if (statusCode && input.status_code?.trim()) {
    const mapped = mapLegacyStatusCodeToLifecycle(statusCode);
    if (mapped) {
      // Generic cancelled + cancelledBy refine actor when status_code is legacy cancelled
      let status = mapped;
      if (
        (statusCode === "cancelled" || statusCode === "canceled") &&
        input.cancelledBy
      ) {
        const actor = String(input.cancelledBy).trim().toLowerCase();
        if (actor === "customer" || actor.includes("customer")) {
          status = "cancelled_by_customer";
        } else if (actor === "admin" || actor.includes("admin")) {
          status = "cancelled_by_admin";
        } else if (actor === "driver" || actor.includes("driver") || actor === "mndob") {
          status = "cancelled_by_driver";
        } else {
          warnings.push(
            "generic_cancelled_without_proven_actor — kept cancelled_by_driver alias; actor unknown",
          );
        }
      }
      return {
        status,
        rawStatusCode: statusCode,
        source: "status_code",
        sourcePriorityRank: 1,
        isSafeForOperationalAction: true,
        isTerminal: isTerminalTripLifecycle(status),
        warnings,
        evidenceFlags,
      };
    }
    warnings.push(`unmapped_status_code:${statusCode}`);
    return {
      status: "unmapped",
      rawStatusCode: statusCode,
      source: "status_code",
      sourcePriorityRank: 1,
      isSafeForOperationalAction: false,
      isTerminal: false,
      warnings,
      evidenceFlags,
    };
  }

  // Dual-write fallbacks — never invent from boolean absence
  if (selected.selected === "halh_text" && selected.rawValue) {
    const fromHalh = HALH_TEXT_TO_CODE[selected.rawValue.trim()];
    if (fromHalh) {
      return {
        status: fromHalh,
        rawStatusCode: null,
        source: "halh_text",
        sourcePriorityRank: 3,
        isSafeForOperationalAction: false,
        isTerminal: isTerminalTripLifecycle(fromHalh),
        warnings,
        evidenceFlags,
      };
    }
  }

  if (selected.selected === "halh_order" && selected.rawValue) {
    warnings.push(
      "halh_order without status_code — payment UX field, not lifecycle SoT → unmapped",
    );
    return {
      status: "unmapped",
      rawStatusCode: null,
      source: "halh_order",
      sourcePriorityRank: 2,
      isSafeForOperationalAction: false,
      isTerminal: false,
      warnings,
      evidenceFlags,
    };
  }

  if (selected.selected === "halh" && selected.rawValue) {
    warnings.push("legacy halh string only → unmapped");
    return {
      status: "unmapped",
      rawStatusCode: null,
      source: "halh",
      sourcePriorityRank: 4,
      isSafeForOperationalAction: false,
      isTerminal: false,
      warnings,
      evidenceFlags,
    };
  }

  // Explicit: do NOT infer lifecycle solely from ActiveOrder / DATEEND absence
  if (evidenceFlags.length) {
    warnings.push(
      "boolean_or_timestamp_evidence_present_but_no_status_code — not inferred",
    );
  }

  return {
    status: "unmapped",
    rawStatusCode: null,
    source: "unknown",
    sourcePriorityRank: 99,
    isSafeForOperationalAction: false,
    isTerminal: false,
    warnings: warnings.length
      ? warnings
      : ["No trip status fields present"],
    evidenceFlags,
  };
}
