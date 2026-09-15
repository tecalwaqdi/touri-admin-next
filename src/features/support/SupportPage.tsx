"use client";

import { useCallback } from "react";
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
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { SupportTicketListItem } from "@/domain/support/SupportTicketMapping";

export function SupportPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/support", { signal });
      const json = (await res.json()) as {
        items?: SupportTicketListItem[];
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

  const source =
    data?.sourceLabel ??
    resolveAdminDataSourceLabel({ syntheticSource: true });

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
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data?.items ? (
          <AdminDataTable>
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
              {data.items.map((row) => (
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
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
