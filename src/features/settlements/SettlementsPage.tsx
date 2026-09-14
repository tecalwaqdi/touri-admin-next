"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";

export function SettlementsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const { session } = useAuth();
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");

  const canCreate = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "settlements:create")
        : false,
    [session.user],
  );

  const queryKey = useMemo(
    () => `fr7-settlements:${status}:${countryId}`,
    [status, countryId],
  );

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const qs = new URLSearchParams();
      if (status) qs.set("settlementStatus", status);
      if (countryId) qs.set("countryId", countryId);
      const res = await apiFetch(`/api/finance/settlements?${qs}`, { signal });
      if (res.status === 401 || res.status === 403) {
        throw new Error(t("forbidden"));
      }
      if (!res.ok) throw new Error("Failed to load FR7 settlements");
      const json = (await res.json()) as {
        items: SettlementListItem[];
        synthetic?: boolean;
        sourceLabel?: {
          label: string;
          en: string;
          ar: string;
          synthetic: boolean;
        };
      };
      return json;
    },
    [apiFetch, status, countryId, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
    isEmpty: (payload) => payload.items.length === 0,
  });

  return (
    <AdminShell title={t("settlements")}>
      <PermissionGuard permission="finance:read">
        <Breadcrumb items={[{ label: t("settlements") }]} />
        <div
          data-testid="fr7-source-badge"
          className="mb-4 inline-flex rounded-md bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900"
        >
          FR7 settlements
        </div>
        <SourceLabelBadge
          testId="synthetic-badge"
          source={
            data?.sourceLabel
              ? {
                  label: data.sourceLabel.label as
                    | "synthetic"
                    | "production"
                    | "production_pilot"
                    | "unavailable",
                  code: data.sourceLabel.label as
                    | "synthetic"
                    | "production"
                    | "production_pilot"
                    | "unavailable",
                  en: data.sourceLabel.en,
                  ar: data.sourceLabel.ar,
                  synthetic: data.sourceLabel.synthetic,
                }
              : resolveAdminDataSourceLabel({
                  syntheticSource: data?.synthetic !== false,
                  productionFirestore: data?.synthetic === false,
                  documentIds: data?.items.map((i) => i.id) ?? [],
                })
          }
        />
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            {t("status")}
            <select
              data-testid="settlement-status-filter"
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              <option value="draft">draft</option>
              <option value="locked">locked</option>
              <option value="approved">approved</option>
              <option value="partially_paid">partially_paid</option>
              <option value="settled">settled</option>
              <option value="disputed">disputed</option>
            </select>
          </label>
          <label className="text-sm">
            {t("country")}
            <select
              className="mt-1 block rounded border border-slate-300 px-2 py-1"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">All</option>
              <option value="SA">SA</option>
              <option value="AE">AE</option>
              <option value="EG">EG</option>
              <option value="KW">KW</option>
              <option value="JO">JO</option>
            </select>
          </label>
          {canCreate ? (
            <Link
              href="/settlements/new"
              className="rounded bg-emerald-700 px-3 py-2 text-sm text-white"
            >
              New
            </Link>
          ) : null}
        </div>

        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="settlements-list"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">ID</th>
                  <th className="px-4 py-3 text-start">Party</th>
                  <th className="px-4 py-3 text-start">{t("country")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">Amount</th>
                  <th className="px-4 py-3 text-start">Outstanding</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{row.id}</td>
                    <td className="px-4 py-3">
                      {row.partyType}:{row.partyIdToken}
                    </td>
                    <td className="px-4 py-3">{row.countryId}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.amountMinor == null
                        ? "Unknown"
                        : formatMinorUnitsDisplay(row.amountMinor, row.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {row.outstandingMinor == null
                        ? "Unknown"
                        : formatMinorUnitsDisplay(row.outstandingMinor, row.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="text-emerald-700 underline"
                        href={`/settlements/${row.id}`}
                      >
                        {t("details")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
