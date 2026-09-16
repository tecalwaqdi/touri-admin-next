"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";

export function FinancialPeriodsPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/finance/periods", { signal });
      const json = (await res.json()) as { items?: unknown[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? t("error"));
      return json;
    },
    [apiFetch, t],
  );
  const { state, data, error, reload } = useStableQuery({
    queryKey: "finance-periods",
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
          FINANCE_WRITE_ENABLED=false · {locale === "ar" ? "جاهز للتجربة" : "pilot-ready"}
        </p>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data?.items ? (
          <pre className="overflow-auto rounded border bg-white p-3 text-xs">
            {JSON.stringify(data.items, null, 2)}
          </pre>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
