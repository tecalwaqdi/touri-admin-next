/**
 * Presentation-only status labels (AR/EN).
 * Does NOT change domain enums / stored values.
 * PC-1 scope: correctness-affecting statuses only (not full PC-7 i18n).
 */

export type StatusLocale = "en" | "ar";

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  unknown: { en: "Unknown", ar: "غير معروف" },
  unavailable: { en: "Unavailable", ar: "غير متاح" },
  pending: { en: "Pending", ar: "معلّق" },
  pending_review: { en: "Pending review", ar: "قيد المراجعة" },
  approved: { en: "Approved", ar: "معتمد" },
  /**
   * Settlement V2: draft → locked (= FR4 approval). Stored enum remains `locked`;
   * presentation only maps to Approved (see FINANCE_IMPLEMENTATION_DESIGN / FR4).
   */
  locked: { en: "Approved", ar: "معتمد" },
  partially_paid: { en: "Partially paid", ar: "مدفوع جزئيًا" },
  voided: { en: "Voided", ar: "ملغى" },
  void: { en: "Void", ar: "ملغى" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  reversed: { en: "Reversed", ar: "معكوس" },
  disputed: { en: "Disputed", ar: "متنازع عليه" },
  recorded: { en: "Recorded", ar: "مسجّل" },
  complete: { en: "Complete", ar: "مكتمل" },
  partial: { en: "Partial", ar: "جزئي" },
  incomplete: { en: "Incomplete", ar: "غير مكتمل" },
  draft: { en: "Draft", ar: "مسودة" },
  enabled: { en: "Enabled", ar: "مفعّل" },
  disabled: { en: "Disabled", ar: "معطّل" },
  online: { en: "Online", ar: "متصل" },
  offline: { en: "Offline", ar: "غير متصل" },
  busy: { en: "Busy", ar: "مشغول" },
  active: { en: "Active", ar: "نشط" },
  inactive: { en: "Inactive", ar: "غير نشط" },
  settled: { en: "Settled", ar: "مُسوّى" },
  suspended: { en: "Suspended", ar: "موقوف" },
  rejected: { en: "Rejected", ar: "مرفوض" },
  needs_changes: { en: "Needs changes", ar: "يحتاج تعديلات" },
  completed: { en: "Completed", ar: "مكتملة" },
  pass: { en: "Pass", ar: "ناجح" },
  FAIL: { en: "Fail", ar: "فشل" },
  PASS: { en: "Pass", ar: "ناجح" },
  WARN: { en: "Warn", ar: "تحذير" },
  UNKNOWN: { en: "Unknown", ar: "غير معروف" },
  no_active_agent: { en: "No active agent", ar: "لا وكيل نشط" },
  fail_multiple_active: {
    en: "Multiple active agents",
    ar: "أكثر من وكيل نشط",
  },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
};

/** Map a domain status code → localized presentation label. Domain value unchanged. */
export function presentStatus(
  value: string | null | undefined,
  locale: StatusLocale = "en",
): string {
  if (value == null || value === "") {
    return locale === "ar" ? "غير معروف" : "Unknown";
  }
  const mapped = STATUS_LABELS[value];
  if (mapped) return mapped[locale];
  // Cancelled_* family
  if (value.startsWith("cancelled")) {
    return locale === "ar" ? "ملغاة" : "Cancelled";
  }
  return value;
}

/** Expose raw domain value separately from presentation (tests / a11y). */
export function statusPresentationPair(
  value: string,
  locale: StatusLocale,
): { domainValue: string; label: string } {
  return { domainValue: value, label: presentStatus(value, locale) };
}
