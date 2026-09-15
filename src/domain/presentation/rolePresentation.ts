/**
 * Presentation-only role display names. Canonical role keys unchanged.
 */

import type { Role } from "@/types/roles";
import { ROLES } from "@/types/roles";

export type RoleLocale = "en" | "ar";

const ROLE_LABELS: Record<Role, { en: string; ar: string }> = {
  super_admin: { en: "Super Admin", ar: "المسؤول العام" },
  operations_manager: { en: "Operations Manager", ar: "مدير العمليات" },
  country_admin: { en: "Country Admin", ar: "مدير الدولة" },
  agent_user: { en: "Agent User", ar: "مستخدم الوكيل" },
  accountant: { en: "Accountant", ar: "المحاسب" },
  finance_approver: { en: "Finance Approver", ar: "معتمد المالية" },
  support_agent: { en: "Support Agent", ar: "موظف الدعم" },
  reporting_viewer: { en: "Reporting Viewer", ar: "مستعرض التقارير" },
  auditor: { en: "Auditor", ar: "المدقق" },
};

export function presentRole(
  role: string | null | undefined,
  locale: RoleLocale = "en",
): string {
  if (!role) return locale === "ar" ? "غير معروف" : "Unknown";
  if ((ROLES as readonly string[]).includes(role)) {
    return ROLE_LABELS[role as Role][locale];
  }
  return locale === "ar" ? "غير معروف" : "Unknown";
}

export function rolePresentationPair(
  role: string,
  locale: RoleLocale,
): { domainValue: string; label: string } {
  return { domainValue: role, label: presentRole(role, locale) };
}
