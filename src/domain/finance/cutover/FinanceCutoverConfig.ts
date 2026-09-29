/**
 * Finance clean cutover — timezone-aware business-date boundary.
 * Pre-cutover = HISTORICAL / CLOSED / READ-ONLY.
 * On/after cutover = NEW OFFICIAL FINANCE PERIOD.
 *
 * Business date is calendar day in FINANCE_CUTOVER_TIMEZONE (default Asia/Riyadh).
 * Do NOT treat YYYY-MM-DD as UTC midnight.
 */

export const FINANCE_CUTOVER_DATE_ENV = "FINANCE_CUTOVER_DATE" as const;
export const FINANCE_CUTOVER_TIMEZONE_ENV = "FINANCE_CUTOVER_TIMEZONE" as const;
export const FINANCE_CUTOVER_APPROVED_ENV = "FINANCE_CUTOVER_APPROVED" as const;

/** Target business cutover (ops-chosen). Not applied until FINANCE_CUTOVER_APPROVED=1. */
export const FINANCE_CUTOVER_BUSINESS_DATE_DEFAULT = "2026-10-01" as const;
export const FINANCE_CUTOVER_TIMEZONE_DEFAULT = "Asia/Riyadh" as const;

/**
 * Asia/Riyadh is UTC+3 year-round (no DST).
 * 2026-10-01 00:00:00 Asia/Riyadh = 2026-09-30T21:00:00.000Z
 */
export const ASIA_RIYADH_UTC_OFFSET_HOURS = 3 as const;

export type FinanceCutoverConfig = {
  /** Calendar business date YYYY-MM-DD in cutoverTimezone. */
  businessDate: string;
  cutoverTimezone: string;
  /** Inclusive start of new period (UTC instant). */
  cutoverUtcInstant: string;
  source: "env" | "proposed_default" | "explicit";
  approved: boolean;
  /** @deprecated use cutoverUtcInstant — kept for older callers. */
  cutoverDateUtc: string;
};

export function isCutoverApproved(
  raw: boolean | string | null | undefined,
): boolean {
  if (raw === true) return true;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function parseBusinessDateYmd(
  raw: string | null | undefined,
): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  // Accept YYYY-MM-DD or full ISO (take date part in that case for business date).
  const dayMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dayMatch) return null;
  const ymd = dayMatch[1]!;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return ymd;
}

/**
 * Convert business-date local midnight in cutover timezone → UTC ISO instant.
 * Asia/Riyadh: fixed UTC+3. Other fixed-offset zones not supported yet → null.
 */
export function businessDateStartToUtcInstant(
  businessDateYmd: string,
  timezone: string,
): string | null {
  const ymd = parseBusinessDateYmd(businessDateYmd);
  if (!ymd) return null;
  const tz = timezone.trim() || FINANCE_CUTOVER_TIMEZONE_DEFAULT;
  if (tz.toLowerCase() !== "asia/riyadh") {
    // Only Riyadh is supported for cutover (no DST). Refuse silent UTC midnight.
    return null;
  }
  const [y, m, d] = ymd.split("-").map(Number);
  // Local midnight Riyadh = UTC midnight minus 3h
  const utcMs = Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0) -
    ASIA_RIYADH_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/** Resolve cutover. YYYY-MM-DD is always interpreted in Asia/Riyadh (default), never as UTC. */
export function resolveFinanceCutoverDate(input?: {
  cutoverDate?: string | null;
  timezone?: string | null;
  approved?: boolean | string | null;
  env?: Record<string, string | undefined>;
}): FinanceCutoverConfig {
  const env = input?.env ?? process.env;
  const timezone =
    (input?.timezone?.trim() ||
      env[FINANCE_CUTOVER_TIMEZONE_ENV]?.trim() ||
      FINANCE_CUTOVER_TIMEZONE_DEFAULT) as string;

  const explicitBiz = parseBusinessDateYmd(input?.cutoverDate);
  if (explicitBiz) {
    const instant = businessDateStartToUtcInstant(explicitBiz, timezone);
    if (instant) {
      return {
        businessDate: explicitBiz,
        cutoverTimezone: FINANCE_CUTOVER_TIMEZONE_DEFAULT,
        cutoverUtcInstant: instant,
        cutoverDateUtc: instant,
        source: "explicit",
        approved: isCutoverApproved(
          input?.approved ?? env[FINANCE_CUTOVER_APPROVED_ENV],
        ),
      };
    }
  }

  const envBiz = parseBusinessDateYmd(env[FINANCE_CUTOVER_DATE_ENV]);
  if (envBiz) {
    const instant = businessDateStartToUtcInstant(envBiz, timezone);
    if (instant) {
      return {
        businessDate: envBiz,
        cutoverTimezone: FINANCE_CUTOVER_TIMEZONE_DEFAULT,
        cutoverUtcInstant: instant,
        cutoverDateUtc: instant,
        source: "env",
        approved: isCutoverApproved(env[FINANCE_CUTOVER_APPROVED_ENV]),
      };
    }
  }

  const instant = businessDateStartToUtcInstant(
    FINANCE_CUTOVER_BUSINESS_DATE_DEFAULT,
    FINANCE_CUTOVER_TIMEZONE_DEFAULT,
  )!;
  return {
    businessDate: FINANCE_CUTOVER_BUSINESS_DATE_DEFAULT,
    cutoverTimezone: FINANCE_CUTOVER_TIMEZONE_DEFAULT,
    cutoverUtcInstant: instant,
    cutoverDateUtc: instant,
    source: "proposed_default",
    approved: false,
  };
}

/** True when event instant is strictly before cutover UTC instant (historical). */
export function isPreCutover(
  eventUtc: string | null | undefined,
  cutoverUtcInstant: string,
): boolean {
  if (!eventUtc) return true; // unknown time → historical / unresolved
  const eventMs = Date.parse(eventUtc);
  const cutMs = Date.parse(cutoverUtcInstant);
  if (Number.isNaN(eventMs) || Number.isNaN(cutMs)) return true;
  return eventMs < cutMs;
}

/** True when event is on/after cutover (new official period). */
export function isOnOrAfterCutover(
  eventUtc: string | null | undefined,
  cutoverUtcInstant: string,
): boolean {
  if (!eventUtc) return false;
  return !isPreCutover(eventUtc, cutoverUtcInstant);
}
