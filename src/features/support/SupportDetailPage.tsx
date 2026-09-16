"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  ErrorState,
  LoadingState,
  NotFoundState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { DetailField } from "@/components/ui/DetailSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import type { SupportTicketDetail } from "@/domain/support/SupportTicketMapping";
import { adminUi } from "@/components/ui/adminUi";
import { SupportWriteActions } from "@/features/support/SupportWriteActions";

export function SupportDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/support/${encodeURIComponent(id)}`, {
        signal,
      });
      if (res.status === 404) return { notFound: true as const };
      const json = (await res.json()) as SupportTicketDetail & {
        unavailable?: boolean;
        error?: string;
      };
      if (res.status === 503 || json.unavailable) {
        return { unavailable: true as const, error: json.error };
      }
      if (!res.ok) throw new Error(json.error ?? t("error"));
      return { detail: json };
    },
    [apiFetch, id, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: `support-detail-${id}`,
    fetcher,
    enabled: !!id,
    isEmpty: () => false,
  });

  return (
    <AdminShell title={t("support")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb
          items={[
            { href: "/support", label: t("support") },
            { label: id || t("details") },
          ]}
        />
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {data && "notFound" in data && data.notFound ? <NotFoundState /> : null}
        {data && "unavailable" in data && data.unavailable ? (
          <UnavailableState message={data.error ?? t("unavailable")} />
        ) : null}
        {data && "detail" in data && data.detail ? (
          <div className={adminUi.cardPad}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailField label={t("subject")}>
                {data.detail.subject ?? t("missing")}
              </DetailField>
              <DetailField label={t("status")}>
                <StatusBadge value={data.detail.status} />
              </DetailField>
              <DetailField label={t("category")}>
                {data.detail.category ?? t("unavailable")}
              </DetailField>
              <DetailField label={t("country")}>
                {data.detail.countryId ?? t("unavailable")}
              </DetailField>
              <DetailField label={t("customer")}>
                {data.detail.customerUserId ? (
                  <Link
                    className="text-sky-700 underline"
                    href={`/customers/${encodeURIComponent(data.detail.customerUserId)}`}
                  >
                    {data.detail.customerUserId}
                  </Link>
                ) : (
                  t("unavailable")
                )}
              </DetailField>
              <DetailField label={t("drivers")}>
                {data.detail.driverId ? (
                  <Link
                    className="text-sky-700 underline"
                    href={`/drivers/${encodeURIComponent(data.detail.driverId)}`}
                  >
                    {data.detail.driverId}
                  </Link>
                ) : (
                  t("unavailable")
                )}
              </DetailField>
              <DetailField label={t("trips")}>
                {data.detail.tripId ? (
                  <Link
                    className="text-sky-700 underline"
                    href={`/trips/${encodeURIComponent(data.detail.tripId)}`}
                  >
                    {data.detail.tripId}
                  </Link>
                ) : (
                  t("unavailable")
                )}
              </DetailField>
              <DetailField label={t("createdAt")}>
                {data.detail.createdAtUtc ?? t("unavailable")}
              </DetailField>
              <DetailField label={t("description")}>
                {data.detail.description ?? t("unavailable")}
              </DetailField>
            </dl>
            <div className="mt-4">
              <SupportWriteActions
                ticketId={data.detail.id}
                preconditionToken={
                  data.detail.updatedAtUtc ??
                  data.detail.createdAtUtc ??
                  data.detail.id
                }
                onDone={reload}
              />
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
