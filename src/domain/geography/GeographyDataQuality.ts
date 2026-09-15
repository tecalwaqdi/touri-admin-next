/**
 * Shared geography data-quality model (PC-6).
 * Severity is presentation/diagnostics only — never mutates Production data.
 */

export type GeographyDqSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "INVARIANT_VIOLATION";

export type GeographyDqIssue = {
  code: string;
  severity: GeographyDqSeverity;
  messageEn: string;
  messageAr: string;
  /** Optional entity scope for summary/filter. */
  entityKind?: "country" | "city" | "landmark" | "agent_mapping";
  entityId?: string | null;
};

export function maxGeographyDqSeverity(
  issues: readonly GeographyDqIssue[],
): GeographyDqSeverity | null {
  if (!issues.length) return null;
  const rank: Record<GeographyDqSeverity, number> = {
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    INVARIANT_VIOLATION: 4,
  };
  let best: GeographyDqSeverity = "INFO";
  for (const issue of issues) {
    if (rank[issue.severity] > rank[best]) best = issue.severity;
  }
  return best;
}

export function geographyDqSeverityMeetsMinimum(
  actual: GeographyDqSeverity | null | undefined,
  minimum: GeographyDqSeverity,
): boolean {
  if (!actual) return false;
  const rank: Record<GeographyDqSeverity, number> = {
    INFO: 1,
    WARNING: 2,
    ERROR: 3,
    INVARIANT_VIOLATION: 4,
  };
  return rank[actual] >= rank[minimum];
}

export function presentGeographyDqSeverity(
  severity: GeographyDqSeverity,
  locale: "en" | "ar" = "en",
): string {
  const labels: Record<GeographyDqSeverity, { en: string; ar: string }> = {
    INFO: { en: "Info", ar: "معلومات" },
    WARNING: { en: "Warning", ar: "تنبيه" },
    ERROR: { en: "Data error", ar: "خطأ في البيانات" },
    INVARIANT_VIOLATION: {
      en: "System rule violation",
      ar: "مخالفة قاعدة النظام",
    },
  };
  return labels[severity][locale];
}
