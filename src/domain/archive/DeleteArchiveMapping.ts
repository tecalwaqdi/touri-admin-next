/**
 * Safe delete → archive / deactivate mapping.
 * Never recreate Legacy hard deletes for parity.
 */

export type ArchiveMappingEffect =
  | "archive"
  | "deactivate"
  | "soft_status"
  | "compliant_delete"
  | "intentionally_removed_unsafe_delete"
  | "void_or_reverse";

export type DeleteArchiveMappingRow = {
  domain: string;
  legacyAction: string;
  nextEffect: ArchiveMappingEffect;
  uiLabelEn: string;
  uiLabelAr: string;
  notes: string;
};

export const DELETE_ARCHIVE_MAPPING: readonly DeleteArchiveMappingRow[] = [
  {
    domain: "region",
    legacyAction: "delete city/region",
    nextEffect: "deactivate",
    uiLabelEn: "Deactivate",
    uiLabelAr: "إلغاء التفعيل",
    notes: "REGION_WRITE_ENABLED; soft acctev/actev",
  },
  {
    domain: "vehicle_catalog",
    legacyAction: "delete type_car",
    nextEffect: "deactivate",
    uiLabelEn: "Deactivate",
    uiLabelAr: "إلغاء التفعيل",
    notes: "Prefer actev:false",
  },
  {
    domain: "landmark",
    legacyAction: "delete landmark",
    nextEffect: "archive",
    uiLabelEn: "Archive",
    uiLabelAr: "أرشفة",
    notes: "acctev:false + optional Storage cleanup",
  },
  {
    domain: "partner",
    legacyAction: "delete partner landmark",
    nextEffect: "archive",
    uiLabelEn: "Archive",
    uiLabelAr: "أرشفة",
    notes: "isShrek landmarks; no hard delete",
  },
  {
    domain: "fleet",
    legacyAction: "delete transport_company",
    nextEffect: "deactivate",
    uiLabelEn: "Deactivate",
    uiLabelAr: "إلغاء التفعيل",
    notes: "FLEET_WRITE_ENABLED",
  },
  {
    domain: "guide",
    legacyAction: "delete tour guide",
    nextEffect: "soft_status",
    uiLabelEn: "Deactivate guide",
    uiLabelAr: "إلغاء تفعيل المرشد",
    notes: "tour_guide_status soft transitions",
  },
  {
    domain: "customer",
    legacyAction: "delete customer Auth",
    nextEffect: "intentionally_removed_unsafe_delete",
    uiLabelEn: "Disable / block",
    uiLabelAr: "تعطيل / حظر",
    notes: "Account deletion via website/CF — not Admin",
  },
  {
    domain: "driver",
    legacyAction: "delete driver",
    nextEffect: "soft_status",
    uiLabelEn: "Suspend / reject",
    uiLabelAr: "إيقاف / رفض",
    notes: "No cascade delete",
  },
  {
    domain: "settlement",
    legacyAction: "delete settlement",
    nextEffect: "void_or_reverse",
    uiLabelEn: "Void / reverse payment",
    uiLabelAr: "إلغاء / عكس دفعة",
    notes: "Settlement V2 void + payment reverse",
  },
  {
    domain: "support",
    legacyAction: "delete ticket",
    nextEffect: "soft_status",
    uiLabelEn: "Close",
    uiLabelAr: "إغلاق",
    notes: "Status closed — no hard delete",
  },
  {
    domain: "notification",
    legacyAction: "delete notification",
    nextEffect: "soft_status",
    uiLabelEn: "Mark read",
    uiLabelAr: "تعليممييز كمقروء",
    notes: "Mark read, not delete-focused",
  },
  {
    domain: "storage",
    legacyAction: "cascade storage cleanup",
    nextEffect: "intentionally_removed_unsafe_delete",
    uiLabelEn: "Replace / detach reference",
    uiLabelAr: "استبدال / فصل المرجع",
    notes: "Controlled orphan cleanup strategy only",
  },
] as const;

export function uiLabelForArchiveEffect(
  domain: string,
  locale: "en" | "ar",
): string | null {
  const row = DELETE_ARCHIVE_MAPPING.find((r) => r.domain === domain);
  if (!row) return null;
  return locale === "ar" ? row.uiLabelAr : row.uiLabelEn;
}
