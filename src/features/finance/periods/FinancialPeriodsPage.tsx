"use client";

import { useCallback, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";

import type { FinancialPeriodListItem } from "@/application/finance/periods/FinancialPeriodService";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";

export function FinancialPeriodsPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/finance/periods?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
      const json = (await res.json()) as { items?: FinancialPeriodListItem[]; nextCursor?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? t("error"));
      return json;
    },
    [apiFetch, t, cursor],
  );
  const { state, data, error, reload } = useStableQuery({
    queryKey: `finance-periods:${cursor ?? "first"}`,
    fetcher,
    isEmpty: (d) => !d?.items?.length,
  });
  return (
    <AdminShell title={locale === "ar" ? "الفترات المالية" : "Financial periods"}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb
          items={[
            { href: "/finance", label: t("finance") },
            { label: locale === "ar" ? "الفترات" : "Periods" },
          ]}
        />
        <p className="mb-3 text-sm text-slate-600">
          {locale === "ar" ? "الفترات المحاسبية وحالتها من السجل المالي." : "Accounting periods and their recorded status."}
        </p>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data?.items ? (
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full text-start text-sm">
              <thead><tr>{[locale === "ar" ? "الفترة" : "Period", t("status"), locale === "ar" ? "من" : "From", locale === "ar" ? "إلى" : "To", locale === "ar" ? "العملة" : "Currency"].map(label => <th key={label} className="p-3 text-start">{label}</th>)}</tr></thead>
              <tbody>{data.items.map(item => <tr key={item.id} className="border-t">
                <td className="p-3">{item.label ?? t("unknown")}</td>
                <td className="p-3"><StatusBadge value={item.status} /></td>
                <td className="p-3">{item.periodFromUtc ? <FormattedDateTime value={item.periodFromUtc} /> : t("missing")}</td>
                <td className="p-3">{item.periodToUtc ? <FormattedDateTime value={item.periodToUtc} /> : t("missing")}</td>
                <td className="p-3">{item.currencyCode ?? t("missing")}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : null}
        <nav className="mt-4 flex gap-3" aria-label={locale === "ar" ? "صفحات الفترات" : "Period pages"}>
          <button className="rounded border px-4 py-2 disabled:opacity-40" disabled={cursors.length === 1 || state === "loading"} onClick={() => setCursors(old => old.slice(0, -1))}>{locale === "ar" ? "السابق" : "Previous"}</button>
          <button className="rounded border px-4 py-2 disabled:opacity-40" disabled={!data?.nextCursor || state === "loading"} onClick={() => { if (data?.nextCursor) setCursors(old => [...old, data.nextCursor!]); }}>{locale === "ar" ? "التالي" : "Next"}</button>
        </nav>
      </PermissionGuard>
    </AdminShell>
  );
}
