"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { AccountantPageHeader } from "@/components/ui/accountant/AccountantPageHeader";
import { ClassificationBadge } from "@/components/ui/accountant/ClassificationBadge";
import { DataClassificationFilter } from "@/components/ui/accountant/DataClassificationFilter";
import { FinanceCountryFilterSelect } from "@/components/ui/FinanceCountryFilterSelect";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import { formatMinorUnitsDisplay } from "@/features/finance/formatReportMoney";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import type { AccountantDataClass } from "@/domain/finance/reporting/AccountantDataClassification";

type ArchiveRow = {
  id: string;
  recordType: string;
  dataClass: AccountantDataClass;
  countryId: string | null;
  currency: string | null;
  partyId: string | null;
  amountMinor: string | null;
  status: string | null;
  occurredAtUtc: string | null;
  relatedSettlementId: string | null;
  relatedOrderId: string | null;
};

type ArchiveResponse = {
  cutover: {
    businessDate: string;
    cutoverUtcInstant: string;
    cutoverTimezone: string;
  };
  readOnly: true;
  items: ArchiveRow[];
  total: number;
};

export function FinanceArchivePage() {
  const { locale, t } = useI18n();
  const finLocale = locale as FinanceLocale;
  const apiFetch = useApiFetch();
  const [q, setQ] = useState("");
  const [countryId, setCountryId] = useState("");
  const [dataClass, setDataClass] = useState("");

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        path: "/api/finance/archive",
        q,
        countryId,
        dataClass,
      }),
    [q, countryId, dataClass],
  );

  const fetcher = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (countryId) params.set("countryId", countryId);
    if (dataClass) params.set("dataClass", dataClass);
    params.set("includePilotRecords", "1");
    params.set("includeLegacy", "1");
    const res = await apiFetch(`/api/finance/archive?${params.toString()}`);
    if (res.status === 403) throw Object.assign(new Error("forbidden"), { code: 403 });
    if (!res.ok) throw new Error(`archive_failed:${res.status}`);
    return (await res.json()) as ArchiveResponse;
  }, [apiFetch, q, countryId, dataClass]);

  const { data, state, error, reload } = useStableQuery({
    queryKey,
    fetcher,
    debounceMs: 200,
  });

  const exportCsv = useCallback(() => {
    if (!data?.items?.length) return;
    const header = [
      "id",
      "recordType",
      "dataClass",
      "countryId",
      "currency",
      "partyId",
      "amountMinor",
      "status",
      "occurredAtUtc",
    ];
    const lines = [
      header.join(","),
      ...data.items.map((r) =>
        [
          r.id,
          r.recordType,
          r.dataClass,
          r.countryId ?? "",
          r.currency ?? "",
          r.partyId ?? "",
          r.amountMinor ?? "",
          r.status ?? "",
          r.occurredAtUtc ?? "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-archive-${data.cutover.businessDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <AdminShell title={t("financeArchive")} hideTitle>
      <PermissionGuard permission="finance:read">
        <AccountantPageHeader
          title={presentFinanceTerm("financeArchive", finLocale)}
          subtitle={presentFinanceTerm("financeArchiveSubtitle", finLocale)}
          breadcrumbs={[
            { label: presentFinanceTerm("financeHome", finLocale), href: "/finance" },
            { label: presentFinanceTerm("financeArchive", finLocale) },
          ]}
        />

        <p
          className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="finance-archive-readonly-banner"
        >
          {presentFinanceTerm("financeArchiveReadOnlyBanner", finLocale)}
          {data?.cutover ? (
            <span className="ms-2 text-slate-600">
              {data.cutover.businessDate} {data.cutover.cutoverTimezone} →{" "}
              {data.cutover.cutoverUtcInstant}
            </span>
          ) : null}
        </p>

        <div className="mb-3">
          <FilterBar>
            <FilterField label={presentFinanceTerm("search", finLocale)}>
              <input
                className={adminUi.filterControl}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ID…"
                data-testid="finance-archive-search"
              />
            </FilterField>
            <FilterField label={presentFinanceTerm("country", finLocale)}>
              <FinanceCountryFilterSelect
                locale={finLocale}
                value={countryId}
                onChange={setCountryId}
                className={adminUi.filterControl}
              />
            </FilterField>
            <FilterField
              label={presentFinanceTerm("dataClassification", finLocale)}
            >
              <DataClassificationFilter
                locale={finLocale}
                value={(dataClass as AccountantDataClass | "") || ""}
                onChange={(v) => setDataClass(v)}
              />
            </FilterField>
          </FilterBar>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className={adminUi.btnSecondary}
              onClick={() => void reload()}
            >
              {presentFinanceTerm("refresh", finLocale)}
            </button>
            <button
              type="button"
              className={adminUi.btnSecondary}
              onClick={exportCsv}
              disabled={!data?.items?.length}
              data-testid="finance-archive-export"
            >
              {presentFinanceTerm("export", finLocale)}
            </button>
            <Link href="/finance" className={adminUi.btnSecondary}>
              {presentFinanceTerm("financeHome", finLocale)}
            </Link>
          </div>
        </div>

        {state === "loading" || state === "idle" ? <SkeletonBlock /> : null}
        {state === "error" ? (
          <UnavailableState message={String(error ?? "error")} />
        ) : null}
        {state === "success" && data ? (
          data.items.length === 0 ? (
            <EmptyState
              message={presentFinanceTerm("financeArchiveEmpty", finLocale)}
            />
          ) : (
            <AdminDataTable data-testid="finance-archive-table">
              <AdminTableHead>
                <AdminTr>
                  <AdminTh>{presentFinanceTerm("id", finLocale)}</AdminTh>
                  <AdminTh>{presentFinanceTerm("type", finLocale)}</AdminTh>
                  <AdminTh>
                    {presentFinanceTerm("dataClassification", finLocale)}
                  </AdminTh>
                  <AdminTh>{presentFinanceTerm("amount", finLocale)}</AdminTh>
                  <AdminTh>{presentFinanceTerm("date", finLocale)}</AdminTh>
                  <AdminTh>{presentFinanceTerm("details", finLocale)}</AdminTh>
                </AdminTr>
              </AdminTableHead>
              <tbody>
                {data.items.map((row) => (
                  <AdminTr key={`${row.recordType}:${row.id}`}>
                    <AdminTd className="font-mono text-xs">{row.id}</AdminTd>
                    <AdminTd>{row.recordType}</AdminTd>
                    <AdminTd>
                      <ClassificationBadge
                        dataClass={row.dataClass}
                        locale={finLocale}
                      />
                    </AdminTd>
                    <AdminTd>
                      {row.amountMinor != null && row.currency
                        ? formatMinorUnitsDisplay(
                            row.amountMinor,
                            row.currency,
                          )
                        : "—"}
                    </AdminTd>
                    <AdminTd>
                      {row.occurredAtUtc ? (
                        <FormattedDateTime value={row.occurredAtUtc} />
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                    <AdminTd>
                      {row.recordType === "settlement" ? (
                        <Link
                          href={`/settlements/${encodeURIComponent(row.id)}`}
                          className="text-sm text-emerald-700 underline"
                        >
                          {presentFinanceTerm("viewDetails", finLocale)}
                        </Link>
                      ) : row.relatedSettlementId ? (
                        <Link
                          href={`/settlements/${encodeURIComponent(row.relatedSettlementId)}`}
                          className="text-sm text-emerald-700 underline"
                        >
                          {presentFinanceTerm("viewDetails", finLocale)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </AdminTd>
                  </AdminTr>
                ))}
              </tbody>
            </AdminDataTable>
          )
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
