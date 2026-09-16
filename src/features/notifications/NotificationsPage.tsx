"use client";

import { useCallback } from "react";
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
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { AdminNotificationListItem } from "@/domain/notifications/AdminNotificationMapping";
import { NotificationWriteActions } from "@/features/notifications/NotificationWriteActions";

export function NotificationsPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();

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
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data?.items ? (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTr>
                <AdminTh>{t("title")}</AdminTh>
                <AdminTh>{t("category")}</AdminTh>
                <AdminTh>{t("status")}</AdminTh>
                <AdminTh>{t("createdAt")}</AdminTh>
              </AdminTr>
            </AdminTableHead>
            <tbody>
              {data.items.map((row) => (
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
                </AdminTr>
              ))}
            </tbody>
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
