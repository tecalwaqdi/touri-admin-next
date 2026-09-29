/**
 * Pre-cutover period filter helpers for Finance Home / cash / settlements / recon.
 * Wiring only — does not mutate Production data.
 */

import {
  resolveFinanceCutoverDate,
  type FinanceCutoverConfig,
} from "@/domain/finance/cutover/FinanceCutoverConfig";

export type FinancePeriodSplit = {
  cutover: FinanceCutoverConfig;
  /** Default periodFrom for current-period APIs (cutover UTC instant). */
  currentPeriodFromUtc: string;
  /** Archive is everything strictly before this instant. */
  archiveBeforeUtc: string;
  labels: {
    openingBalance: { en: string; ar: string };
    periodActivity: { en: string; ar: string };
    currentBalance: { en: string; ar: string };
  };
};

export function resolveFinancePeriodSplit(input?: {
  cutoverDate?: string | null;
  timezone?: string | null;
  env?: Record<string, string | undefined>;
}): FinancePeriodSplit {
  const cutover = resolveFinanceCutoverDate({
    cutoverDate: input?.cutoverDate ?? "2026-10-01",
    timezone: input?.timezone ?? "Asia/Riyadh",
    env: input?.env,
  });
  return {
    cutover,
    currentPeriodFromUtc: cutover.cutoverUtcInstant,
    archiveBeforeUtc: cutover.cutoverUtcInstant,
    labels: {
      openingBalance: {
        en: "Opening balance",
        ar: "الرصيد الافتتاحي",
      },
      periodActivity: {
        en: "Period activity",
        ar: "حركة الفترة",
      },
      currentBalance: {
        en: "Current balance",
        ar: "الرصيد الحالي",
      },
    },
  };
}

/**
 * When operator has not chosen a custom from date, default Finance Home
 * current-period filters to on/after cutover.
 */
export function applyCutoverDefaultPeriodFrom(input: {
  fromUtc: string | null | undefined;
  cutoverUtcInstant: string;
}): string {
  if (input.fromUtc?.trim()) return input.fromUtc.trim();
  return input.cutoverUtcInstant;
}
