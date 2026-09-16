import { formatMinorUnitsDisplay } from "@/domain/presentation/formatMinorUnitsDisplay";
import { presentStatus, presentPaymentMethod } from "@/domain/presentation/statusPresentation";

/**
 * Printable report parity — Legacy finance PDF exporters are deferred.
 * Admin Next provides server-generated printable HTML (A4) for settlement receipt
 * using canonical FR7 read models (no parallel money calculation).
 */

export type PrintReportLocale = "en" | "ar";

export type SettlementPrintModel = {
  settlementId: string;
  status: string;
  currency: string;
  totalMinor: string | null;
  outstandingMinor: string | null;
  partyLabel: string | null;
  countryId: string | null;
  generatedAtUtc: string;
  actorUid: string | null;
  payments: Array<{
    id: string;
    amountMinor: string | null;
    currency?: string;
    method: string | null;
    state: string;
    reference: string | null;
    createdBy: string | null;
    confirmedBy: string | null;
    createdAtUtc: string | null;
  }>;
};

export const LEGACY_FINANCE_PDF_STATUS = {
  legacyComment:
    "Legacy CSV/PDF exporters remain deferred (admin_finance_reports_widget.dart)",
  classification: "INTENTIONALLY_SUPERSEDED" as const,
  nextParity: "printable_html_a4_settlement_receipt" as const,
};

export function renderSettlementPrintHtml(
  model: SettlementPrintModel,
  locale: PrintReportLocale,
): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  const title =
    locale === "ar" ? "إيصال تسوية" : "Settlement receipt";
  const gen =
    locale === "ar" ? "تاريخ التوليد" : "Generated at";
  const outstanding =
    locale === "ar" ? "المبلغ المتبقي" : "Outstanding";
  const total = locale === "ar" ? "الإجمالي" : "Total";

  const money = (minor: string | null) =>
    formatMinorUnitsDisplay(minor, model.currency);

  const rows = model.payments
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.id)}</td>
      <td>${escapeHtml(formatMinorUnitsDisplay(p.amountMinor, p.currency ?? model.currency))}</td>
      <td>${escapeHtml(presentPaymentMethod(p.method, locale))}</td>
      <td>${escapeHtml(presentStatus(p.state, locale))}</td>
      <td>${escapeHtml(p.reference ?? "—")}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)} — ${escapeHtml(model.settlementId)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #0f172a; }
  h1 { font-size: 20pt; margin: 0 0 8px; }
  .meta { font-size: 10pt; color: #475569; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: start; }
  th { background: #f1f5f9; }
  .kpi { display: flex; gap: 24px; margin: 12px 0 20px; }
  .kpi div { min-width: 140px; }
  .label { font-size: 9pt; color: #64748b; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(gen)}: ${escapeHtml(model.generatedAtUtc)}
    · ID: ${escapeHtml(model.settlementId)}
    · ${escapeHtml(presentStatus(model.status, locale))}
    ${model.actorUid ? `· ${locale === "ar" ? "المستخدم" : "Operator"}: ${escapeHtml(model.actorUid)}` : ""}
  </div>
  <div class="kpi">
    <div><div class="label">${escapeHtml(total)}</div><strong>${escapeHtml(money(model.totalMinor))}</strong></div>
    <div><div class="label">${escapeHtml(outstanding)}</div><strong>${escapeHtml(money(model.outstandingMinor))}</strong></div>
    <div><div class="label">${locale === "ar" ? "الطرف" : "Party"}</div><strong>${escapeHtml(model.partyLabel ?? "—")}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>${locale === "ar" ? "المبلغ" : "Amount"}</th>
        <th>${locale === "ar" ? "الطريقة" : "Method"}</th>
        <th>${locale === "ar" ? "الحالة" : "State"}</th>
        <th>${locale === "ar" ? "المرجع" : "Reference"}</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5">${locale === "ar" ? "لا توجد دفعات" : "No payments"}</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
