/** DQ severity presentation keys (mirror of domain helper for i18n inventory). */
export const dataQualityNs = {
  en: {
    dqInfo: "Info",
    dqWarning: "Warning",
    dqError: "Data error",
    dqInvariantViolation: "System rule violation",
  },
  ar: {
    dqInfo: "معلومات",
    dqWarning: "تنبيه",
    dqError: "خطأ في البيانات",
    dqInvariantViolation: "مخالفة قاعدة النظام",
  },
} as const;
