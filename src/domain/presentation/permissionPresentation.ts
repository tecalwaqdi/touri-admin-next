/**
 * Presentation-only permission descriptions. Keys remain canonical.
 */

import type { Permission } from "@/types/roles";
import { PERMISSIONS } from "@/types/roles";

export type PermissionLocale = "en" | "ar";

const PERMISSION_LABELS: Record<Permission, { en: string; ar: string }> = {
  "drivers:read": { en: "View drivers", ar: "عرض السائقين" },
  "drivers:read_pii": {
    en: "View driver personal data",
    ar: "عرض البيانات الشخصية للسائق",
  },
  "drivers:approve": { en: "Approve drivers", ar: "اعتماد السائقين" },
  "trips:read": { en: "View trips", ar: "عرض الرحلات" },
  "agents:read": { en: "View agents", ar: "عرض الوكلاء" },
  "agents:manage": { en: "Manage agents", ar: "إدارة الوكلاء" },
  "customers:read": { en: "View customers", ar: "عرض العملاء" },
  "customers:read_pii": {
    en: "View customer personal data",
    ar: "عرض البيانات الشخصية للعميل",
  },
  "customers:manage": { en: "Manage customers", ar: "إدارة العملاء" },
  "finance:read": { en: "View financial data", ar: "عرض البيانات المالية" },
  "settlements:create": { en: "Create settlements", ar: "إنشاء التسويات" },
  "settlements:prepare": { en: "Prepare settlements", ar: "إعداد التسويات" },
  "settlements:approve": { en: "Approve settlements", ar: "اعتماد التسويات" },
  "settlements:execute": { en: "Execute settlements", ar: "تنفيذ التسويات" },
  "settlements:reverse": { en: "Reverse settlements", ar: "عكس التسويات" },
  "finance:adjust": { en: "Create finance adjustments", ar: "إنشاء تسويات مالية" },
  "finance:adjust_approve": {
    en: "Approve finance adjustments",
    ar: "اعتماد التسويات المالية",
  },
  "payouts:prepare": { en: "Prepare payouts", ar: "إعداد المدفوعات" },
  "payouts:execute": { en: "Execute payouts", ar: "تنفيذ المدفوعات" },
  "reports:export": { en: "Export reports", ar: "تصدير التقارير" },
  "users:manage": { en: "Manage admin users", ar: "إدارة مستخدمي اللوحة" },
  "audit:read": { en: "View audit log", ar: "عرض سجل التدقيق" },
};

export function presentPermission(
  permission: string | null | undefined,
  locale: PermissionLocale = "en",
): string {
  if (!permission) return locale === "ar" ? "غير معروف" : "Unknown";
  if ((PERMISSIONS as readonly string[]).includes(permission)) {
    return PERMISSION_LABELS[permission as Permission][locale];
  }
  return locale === "ar" ? "غير معروف" : "Unknown";
}

export function permissionPresentationPair(
  permission: string,
  locale: PermissionLocale,
): { domainValue: string; label: string } {
  return {
    domainValue: permission,
    label: presentPermission(permission, locale),
  };
}
