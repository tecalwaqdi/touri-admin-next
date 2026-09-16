/**
 * Export header localization — never expose raw internal field keys.
 */

export type ExportLocale = "en" | "ar";

export type ExportColumn = {
  key: string;
  headerEn: string;
  headerAr: string;
};

export function localizedExportHeaders(
  columns: readonly ExportColumn[],
  locale: ExportLocale,
): string[] {
  return columns.map((c) => (locale === "ar" ? c.headerAr : c.headerEn));
}

export function assertNoRawInternalExportKeys(headers: string[]): void {
  for (const h of headers) {
    if (
      h.includes("_") &&
      /^(halh|naim|osf|tsnef|actev|acctev|RefUser|Rev_dolh)$/i.test(h)
    ) {
      throw new Error(`RAW_INTERNAL_EXPORT_KEY:${h}`);
    }
  }
}

export const SETTLEMENT_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "id", headerEn: "Settlement ID", headerAr: "معرّف التسوية" },
  { key: "status", headerEn: "Status", headerAr: "الحالة" },
  { key: "currency", headerEn: "Currency", headerAr: "العملة" },
  { key: "totalMinor", headerEn: "Total (minor)", headerAr: "الإجمالي (صغير)" },
  {
    key: "outstandingMinor",
    headerEn: "Outstanding (minor)",
    headerAr: "المتبقي (صغير)",
  },
  { key: "countryId", headerEn: "Country", headerAr: "الدولة" },
] as const;

export const SUPPORT_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "id", headerEn: "Ticket ID", headerAr: "معرّف التذكرة" },
  { key: "subject", headerEn: "Subject", headerAr: "الموضوع" },
  { key: "status", headerEn: "Status", headerAr: "الحالة" },
  { key: "category", headerEn: "Category", headerAr: "التصنيف" },
  { key: "countryId", headerEn: "Country", headerAr: "الدولة" },
] as const;
