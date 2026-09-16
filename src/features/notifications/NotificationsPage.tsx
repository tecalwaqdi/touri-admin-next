"use client";

import { useCallback, useMemo, useState } from "react";
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
import { adminUi } from "@/components/ui/adminUi";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { AdminNotificationListItem } from "@/domain/notifications/AdminNotificationMapping";
import { NotificationWriteActions } from "@/features/notifications/NotificationWriteActions";
import {
  filterByNeedle,
  paginateSlice,
} from "@/domain/parity/P2GapClassification";

const PAGE_SIZE = 20;

export function NotificationsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/notifications", { signal });
      const json = (await res.json()) as {
        items?: AdminNotificationListItem[];
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
    queryKey: "notifications-list",
    fetcher,
    isEmpty: (d) => !d?.items?.length,
  });

  const filtered = useMemo(() => {
    let items = data?.items ?? [];
    if (readFilter === "unread") items = items.filter((i) => i.unread);
    if (readFilter === "read") items = items.filter((i) => !i.unread);
    items = filterByNeedle(items, searchApplied, (i) => [
      i.title,
      i.subtitle,
      i.category,
      i.id,
    ]);
    return items;
  }, [data?.items, readFilter, searchApplied]);

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginateSlice(filtered, page, PAGE_SIZE),
    [filtered, page],
  );

  const source =
    data?.sourceLabel ??
    resolveAdminDataSourceLabel({ syntheticSource: true });

  return (
    <AdminShell title={t("notifications")}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb items={[{ label: t("notifications") }]} />
        <SourceLabelBadge
          source={{
            label: normalizeSourceLabelCode(source.label),
            code: normalizeSourceLabelCode(source.label),
            en: source.en,
            ar: source.ar,
            synthetic: source.synthetic,
          }}
        />
        <div className="mb-4">
          <NotificationWriteActions onDone={reload} />
        </div>
        <FilterBar
          testId="notifications-filters"
          hint={t("searchLoadedPageHint")}
        >
          <FilterField label={t("search")}>
            <input
              data-testid="notifications-search"
              className={adminUi.filterControl}
              aria-label={t("search")}
              placeholder={t("searchWithinLoaded")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterField>
          <FilterField label={t("status")}>
            <select
              data-testid="notifications-read-filter"
              className={adminUi.filterControl}
              aria-label={t("status")}
              value={readFilter}
              onChange={(e) => {
                setPage(1);
                setReadFilter(e.target.value as "all" | "unread" | "read");
              }}
            >
              <option value="all">{t("all")}</option>
              <option value="unread">{t("unreadOnly")}</option>
              <option value="read">{t("readOnlyFilter")}</option>
            </select>
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
            data-testid="notifications-reset-filters"
            onClick={() => {
              setReadFilter("all");
              setSearch("");
              setSearchApplied("");
              setPage(1);
            }}
          >
            {t("resetFilters")}
          </button>
        </FilterBar>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" || (state === "success" && filtered.length === 0) ? (
          <EmptyState />
        ) : null}
        {state === "success" && pageItems.length > 0 ? (
          <AdminDataTable testId="notifications-table">
            <AdminTableHead>
              <AdminTr>
                <AdminTh>{t("title")}</AdminTh>
                <AdminTh>{t("category")}</AdminTh>
                <AdminTh>{t("status")}</AdminTh>
                <AdminTh>{t("createdAt")}</AdminTh>
                <AdminTh>{t("details")}</AdminTh>
              </AdminTr>
            </AdminTableHead>
            <tbody>
              {pageItems.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd>
                    <div className="font-medium">{row.title}</div>
                    {row.subtitle ? (
                      <div className="text-xs text-slate-500">{row.subtitle}</div>
                    ) : null}
                  </AdminTd>
                  <AdminTd>{row.category}</AdminTd>
                  <AdminTd>
                    <StatusBadge value={row.unread ? "unread" : "read"} />
                  </AdminTd>
                  <AdminTd>{row.createdAtUtc ?? t("unavailable")}</AdminTd>
                  <AdminTd>
                    <NotificationWriteActions
                      notificationId={row.id}
                      onDone={reload}
                    />
                  </AdminTd>
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
