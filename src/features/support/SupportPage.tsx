"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/states/QueryStates";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { CountryFilterSelect } from "@/components/ui/CountryFilterSelect";
import { adminUi } from "@/components/ui/adminUi";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type {
  SupportTicketListItem,
  SupportTicketStatus,
} from "@/domain/support/SupportTicketMapping";
import {
  filterByNeedle,
  paginateSlice,
} from "@/domain/parity/P2GapClassification";
import { presentStatus } from "@/domain/presentation/statusPresentation";

const PAGE_SIZE = 20;
const STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
  "unknown",
];

export function SupportPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [status, setStatus] = useState("");
  const [countryId, setCountryId] = useState("");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/support", { signal });
      const json = (await res.json()) as {
        items?: SupportTicketListItem[];
        truncated?: boolean;
        sourceLabel?: {
          label: string;
          en: string;
          ar: string;
          synthetic: boolean;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? t("error"));
      return json;
    },
    [apiFetch, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: "support-list",
    fetcher,
    isEmpty: (d) => !d?.items?.length,
  });

  const filtered = useMemo(() => {
    let items = data?.items ?? [];
    if (status) items = items.filter((i) => i.status === status);
    if (countryId) {
      items = items.filter((i) => (i.countryId ?? "") === countryId);
    }
    items = filterByNeedle(items, searchApplied, (i) => [
      i.subject,
      i.descriptionPreview,
      i.category,
      i.id,
      i.customerUserId,
      i.driverId,
      i.tripId,
    ]);
    return items;
  }, [data?.items, status, countryId, searchApplied]);

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginateSlice(filtered, page, PAGE_SIZE),
    [filtered, page],
  );

  const source =
    data?.sourceLabel ??
    resolveAdminDataSourceLabel({ syntheticSource: true });

  const resetFilters = () => {
    setStatus("");
    setCountryId("");
    setSearch("");
    setSearchApplied("");
    setPage(1);
  };

  return (
    <AdminShell title={t("support")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb items={[{ label: t("support") }]} />
        <SourceLabelBadge
          source={{
            label: normalizeSourceLabelCode(source.label),
            code: normalizeSourceLabelCode(source.label),
            en: source.en,
            ar: source.ar,
            synthetic: source.synthetic,
          }}
        />
        <FilterBar
          testId="support-filters"
          hint={
            searchApplied || status || countryId
              ? t("searchLoadedPageHint")
              : t("boundedResultsHint")
          }
        >
          <FilterField label={t("search")}>
            <input
              data-testid="support-search"
              className={adminUi.filterControl}
              aria-label={t("search")}
              placeholder={t("searchWithinLoaded")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterField>
          <FilterField label={t("status")}>
            <select
              data-testid="support-status-filter"
              className={adminUi.filterControl}
              aria-label={t("status")}
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">{t("allStatuses")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {presentStatus(s, locale)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("country")}>
            <CountryFilterSelect
              value={countryId}
              onChange={(id) => {
                setPage(1);
                setCountryId(id);
              }}
              locale={locale}
              allLabel={t("allCountries")}
              testId="support-country-filter"
              className={adminUi.filterControl}
            />
          </FilterField>
          <button
            type="button"
            className={adminUi.btnPrimary}
            onClick={() => {
              setPage(1);
              setSearchApplied(search.trim());
            }}
          >
            {t("filters")}
          </button>
          <button
            type="button"
            className={adminUi.btnGhost}
            data-testid="support-reset-filters"
            onClick={resetFilters}
          >
            {t("resetFilters")}
          </button>
        </FilterBar>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" || (state === "success" && filtered.length === 0) ? (
          <EmptyState message={t("noSupportTickets")} />
        ) : null}
        {state === "success" && pageItems.length > 0 ? (
          <AdminDataTable testId="support-table">
            <AdminTableHead>
              <AdminTr>
                <AdminTh>{t("subject")}</AdminTh>
                <AdminTh>{t("status")}</AdminTh>
                <AdminTh>{t("category")}</AdminTh>
                <AdminTh>{t("country")}</AdminTh>
                <AdminTh>{t("createdAt")}</AdminTh>
              </AdminTr>
            </AdminTableHead>
            <tbody>
              {pageItems.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd>
                    <Link
                      className="text-sky-700 underline"
                      href={`/support/${encodeURIComponent(row.id)}`}
                    >
                      {row.subject ?? row.id}
                    </Link>
                  </AdminTd>
                  <AdminTd>
                    <StatusBadge value={row.status} />
                  </AdminTd>
                  <AdminTd>{row.category ?? t("unavailable")}</AdminTd>
                  <AdminTd>{row.countryId ?? t("unavailable")}</AdminTd>
                  <AdminTd>{row.createdAtUtc ?? t("unavailable")}</AdminTd>
                </AdminTr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className={adminUi.caption}>
                      {t("boundedResultsHint")} · {filtered.length}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={adminUi.btnGhost}
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        {t("previous")}
                      </button>
                      <span className="tabular-nums">
                        {safePage}/{totalPages}
                      </span>
                      <button
                        type="button"
                        className={adminUi.btnGhost}
                        disabled={safePage >= totalPages}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        {t("next")}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
