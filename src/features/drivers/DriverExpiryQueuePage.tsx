"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";

export function DriverExpiryQueuePage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/drivers/expiry-queue", { signal });
      const json = (await res.json()) as { items?: unknown[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? t("error"));
      return json;
    },
    [apiFetch, t],
  );
  const { state, data, error, reload } = useStableQuery({
    queryKey: "driver-expiry",
    fetcher,
    isEmpty: (d) => !d?.items?.length,
  });
  return (
    <AdminShell title={locale === "ar" ? "انتهاء وثائق السائقين" : "Driver document expiry"}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb items={[{ href: "/drivers", label: t("drivers") }, { label: locale === "ar" ? "الانتهاء" : "Expiry" }]} />
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data?.items ? (
          <pre className="overflow-auto rounded border bg-white p-3 text-xs">{JSON.stringify(data.items, null, 2)}</pre>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
