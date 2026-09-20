/**
 * Presentation-only status labels (AR/EN).
 * Does NOT change domain enums / stored values.
 * Authoritative status mapper for Admin Next UI (PC-7).
 */

export type StatusLocale = "en" | "ar";

const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  unknown: { en: "Unknown", ar: "غير معروف" },
  unavailable: { en: "Unavailable", ar: "غير متاح" },
  available: { en: "Available", ar: "متاح" },
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
  under_dispute: { en: "Under dispute", ar: "قيد النزاع" },
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
  scheduled: { en: "Scheduled", ar: "مجدولة" },
  requested: { en: "Requested", ar: "مطلوبة" },
  waiting_driver: { en: "Waiting for driver", ar: "بانتظار السائق" },
  accepted: { en: "Accepted", ar: "مقبولة" },
  driver_en_route: { en: "Driver en route", ar: "السائق في الطريق" },
  arrived: { en: "Arrived", ar: "وصل" },
  started: { en: "In progress", ar: "قيد التنفيذ" },
  cancelled_by_customer: { en: "Cancelled by customer", ar: "ملغاة من العميل" },
  cancelled_by_driver: { en: "Cancelled by driver", ar: "ملغاة من السائق" },
  cancelled_by_admin: { en: "Cancelled by admin", ar: "ملغاة من الإدارة" },
  cancelled_by_system: { en: "Cancelled by system", ar: "ملغاة من النظام" },
  // Phase 4A-4 trip lifecycle (TourySystemStatusCodes) — presentation only
  pending_driver: { en: "Waiting for driver", ar: "بانتظار السائق" },
  driver_assigned: { en: "Driver assigned", ar: "تم تعيين السائق" },
  driver_arriving: { en: "Driver arriving", ar: "السائق في الطريق" },
  driver_arrived: { en: "Driver arrived", ar: "وصل السائق" },
  trip_started: { en: "Trip started", ar: "بدأت الرحلة" },
  trip_in_progress: { en: "In progress", ar: "قيد التنفيذ" },
  expired: { en: "Expired", ar: "منتهية" },
  unmapped: { en: "Unmapped status", ar: "حالة غير معيّنة" },
  // Cancellation reason codes (list secondary column)
  customer_cancelled: { en: "Cancelled by customer", ar: "ملغاة من العميل" },
  driver_cancelled: { en: "Cancelled by driver", ar: "ملغاة من السائق" },
  admin_cancelled: { en: "Cancelled by admin", ar: "ملغاة من الإدارة" },
  system_cancelled: { en: "Cancelled by system", ar: "ملغاة من النظام" },
  // Document / compliance overall
  ready: { en: "Ready", ar: "جاهز" },
  expired_docs: { en: "Expired", ar: "منتهية" },
  refunded: { en: "Refunded", ar: "مُستردة" },
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
  NO_ACTIVE_AGENT: { en: "No active agent", ar: "لا وكيل نشط" },
  VIOLATION: { en: "Invariant violation", ar: "انتهاك قيد" },
  DATA_QUALITY_WARNING: { en: "Data quality warning", ar: "تحذير جودة بيانات" },
  INFO: { en: "Info", ar: "معلومات" },
  WARNING: { en: "Warning", ar: "تنبيه" },
  ERROR: { en: "Data error", ar: "خطأ في البيانات" },
  INVARIANT_VIOLATION: {
    en: "System rule violation",
    ar: "مخالفة قاعدة النظام",
  },
  present: { en: "Present", ar: "موجود" },
  missing: { en: "Missing", ar: "مفقود" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
  production: { en: "Production", ar: "إنتاج" },
  production_pilot: { en: "Production / pilot", ar: "إنتاج / تجريبي" },
  bounded_sample: {
    en: "Bounded sample (not full total)",
    ar: "عينة محدودة (ليست الإجمالي الكامل)",
  },
  legacy: { en: "Legacy", ar: "قديم" },
  qa: { en: "QA", ar: "اختبار جودة" },
  // Mapping / classification (presentation only — domain enums unchanged)
  validMapped: { en: "Valid mapping", ar: "تعيين صالح" },
  testOrNoncanonical: { en: "Test / non-canonical", ar: "تجريبي / غير معياري" },
  excludedNonDriver: { en: "Excluded (non-driver)", ar: "مستبعد (ليس سائقًا)" },
  excludedNonCustomer: { en: "Excluded (non-customer)", ar: "مستبعد (ليس عميلاً)" },
  excludedNonAgent: { en: "Excluded (non-agent)", ar: "مستبعد (ليس وكيلاً)" },
  excludedUnknownIdentity: {
    en: "Excluded (unknown identity)",
    ar: "مستبعد (هوية غير معروفة)",
  },
  unmappedCountry: { en: "Unmapped country", ar: "دولة غير معيّنة" },
  unmappedCity: { en: "Unmapped city", ar: "مدينة غير معيّنة" },
  not_applicable: { en: "Not applicable", ar: "غير منطبق" },
};

const PAYMENT_METHOD_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدي" },
  card: { en: "Card", ar: "بطاقة" },
  online: { en: "Online", ar: "إلكتروني" },
  unknown: { en: "Unknown", ar: "غير معروف" },
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
  // Safe fallback — do not expose raw unknown enums as primary UI labels.
  return locale === "ar" ? "غير معروف" : "Unknown";
}

/** Expose raw domain value separately from presentation (tests / a11y). */
export function statusPresentationPair(
  value: string,
  locale: StatusLocale,
): { domainValue: string; label: string } {
  return { domainValue: value, label: presentStatus(value, locale) };
}

/** Payment method presentation (canonical values unchanged). */
export function presentPaymentMethod(
  value: string | null | undefined,
  locale: StatusLocale = "en",
): string {
  if (value == null || value === "") {
    return locale === "ar" ? "غير معروف" : "Unknown";
  }
  const mapped = PAYMENT_METHOD_LABELS[value];
  if (mapped) return mapped[locale];
  return locale === "ar" ? "غير معروف" : "Unknown";
}

/**
 * Cancellation reason / code for list & timing cells.
 * Localizes known codes; never invents a reason from absence.
 */
export function presentCancellationReason(
  value: string | null | undefined,
  locale: StatusLocale = "en",
): string | null {
  if (value == null || value === "") return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = STATUS_LABELS[key] ?? STATUS_LABELS[value];
  if (mapped) return mapped[locale];
  // Free-text operator reason — show as-is (already human language).
  if (/[\u0600-\u06FF]/.test(value) || /\s/.test(value)) return value.trim();
  return presentStatus(value, locale);
}
