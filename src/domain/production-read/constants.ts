/**
 * Phase 4 DESIGN — production-read constants.
 * No Firebase. No Production adapter wiring.
 */

/** Mapping pipeline version stamped on Canonical Read Models from Legacy sources. */
export const LEGACY_MAPPING_VERSION = "legacy-map-v1" as const;

/** When Legacy documents lack an explicit schema version field. */
export const SOURCE_SCHEMA_VERSION_UNKNOWN = "unknown" as const;

export const PRODUCTION_READ_MODES = ["disabled", "shadow"] as const;
export type ProductionReadMode = (typeof PRODUCTION_READ_MODES)[number];

/** Absolute hard cap — also mirrored in env MAX_PAGE_SIZE default. */
export const DEFAULT_MAX_PAGE_SIZE = 100;

/** Default trip list date window for shadow reads (days). */
export const DEFAULT_TRIP_LIST_WINDOW_DAYS = 7;

/** Configurable upper bound for trip list window (days) — design default. */
export const MAX_TRIP_LIST_WINDOW_DAYS = 31;

export const DATA_SOURCE_IDENTITY = {
  sourceEnvironment: "production",
  sourceSystem: "legacy",
  readMode: "shadow",
} as const;

export type DataSourceIdentity = {
  sourceEnvironment: "production" | "synthetic" | "unknown";
  sourceSystem: "legacy" | "admin_next_synthetic" | "unknown";
  readMode: "shadow" | "disabled" | "synthetic";
};

export const SHADOW_BANNER = {
  en: "PRODUCTION SHADOW — READ ONLY",
  ar: "وضع قراءة تجريبي — بيانات إنتاج — بدون تعديل",
} as const;

export const DEGRADED_PRODUCTION_MESSAGE =
  "Production data unavailable" as const;

export const MAPPING_MISMATCH_CODE = "MAPPING_MISMATCH" as const;
