/**
 * FR7 reporting source mode — env/config only (no UI switches).
 * synthetic = golden fixtures (tests / local).
 * production_read_only = Firestore RO adapters (Production UI source).
 */

export type FinanceReportingSourceMode = "synthetic" | "production_read_only";

export const FINANCE_REPORTING_SOURCE_MODE_ENV =
  "FINANCE_REPORTING_SOURCE_MODE" as const;

export function resolveFinanceReportingSourceMode(input?: {
  FINANCE_REPORTING_SOURCE_MODE?: string | null;
  PRODUCTION_READ_ENABLED?: boolean | string | null;
  PRODUCTION_READ_MODE?: string | null;
}): FinanceReportingSourceMode {
  const explicit = String(
    input?.FINANCE_REPORTING_SOURCE_MODE ??
      process.env.FINANCE_REPORTING_SOURCE_MODE ??
      "",
  )
    .trim()
    .toLowerCase();

  if (explicit === "production_read_only") {
    return "production_read_only";
  }
  if (explicit === "synthetic" || explicit === "test") {
    return "synthetic";
  }

  // Derive from existing Production read gates when explicit mode unset.
  const readEnabled = parseBool(
    input?.PRODUCTION_READ_ENABLED ?? process.env.PRODUCTION_READ_ENABLED,
  );
  const readMode = String(
    input?.PRODUCTION_READ_MODE ?? process.env.PRODUCTION_READ_MODE ?? "",
  )
    .trim()
    .toLowerCase();
  if (readEnabled && readMode === "shadow") {
    return "production_read_only";
  }

  return "synthetic";
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const n = String(value ?? "")
    .trim()
    .toLowerCase();
  return n === "1" || n === "true" || n === "yes" || n === "on";
}
