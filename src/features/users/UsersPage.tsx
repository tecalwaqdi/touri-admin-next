"use client";

import { useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  SourceNotConfiguredState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

type UserRow = {
  id: string;
  emailMasked: string | null;
  displayName: string;
  role: string;
  scopeType: string;
  scopeCountryIds: string[];
  scopeAgentIds: string[];
  status: string;
  permissionCount: number;
  dataQualityWarnings?: string[];
};

type UsersPayload = {
  items: UserRow[];
  unavailable?: boolean;
  error?: string;
  code?: string;
  truncated?: boolean;
  sourceLabel?: {
    label: string;
    en: string;
    ar: string;
    synthetic: boolean;
  };
};

export function UsersPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/users", { signal });
      if (res.status === 403) throw new Error(t("forbidden"));
      const json = (await res.json()) as UsersPayload;
      if (res.status === 503 || json.unavailable) {
        return {
          items: [] as UserRow[],
          unavailable: true,
          error: json.error,
          code: json.code,
          sourceLabel: json.sourceLabel,
        };
      }
      if (!res.ok) throw new Error(t("error"));
      return json;
    },
    [apiFetch, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: "users-list",
    fetcher,
    isEmpty: (payload) => !payload.unavailable && payload.items.length === 0,
  });

  const notConfiguredMessage =
    locale === "ar"
      ? t("productionUserSourceNotConfigured")
      : t("productionUserSourceNotConfigured");

  return (
    <AdminShell title={t("users")}>
      <PermissionGuard permission="users:manage">
        <Breadcrumb items={[{ label: t("users") }]} />
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SourceLabelBadge
            testId="synthetic-badge"
            source={
              data?.sourceLabel
                ? {
                    label: normalizeSourceLabelCode(data.sourceLabel.label),
                    code: normalizeSourceLabelCode(data.sourceLabel.label),
                    en: data.sourceLabel.en,
                    ar: data.sourceLabel.ar,
                    synthetic: data.sourceLabel.synthetic,
                  }
                : resolveAdminDataSourceLabel({
                    unavailable: data?.unavailable === true,
                    syntheticSource: data != null && !data.unavailable,
                  })
            }
          />
          <Link
            href="/roles"
            className="text-sm font-medium text-slate-700 underline"
            data-testid="roles-matrix-link"
          >
            {t("rolesPermissions")}
          </Link>
        </div>
        {data?.truncated ? (
          <p className="mb-2 text-xs text-slate-500">{t("boundedResultsHint")}</p>
        ) : null}
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {data?.unavailable ? (
          data.code === "PRODUCTION_USER_SOURCE_NOT_CONFIGURED" ? (
            <SourceNotConfiguredState message={notConfiguredMessage} />
          ) : (
            <UnavailableState message={data.error ?? t("unavailable")} />
          )
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data && !data.unavailable ? (
          <div
            data-testid="users-table"
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-start">{t("name")}</th>
                  <th className="px-4 py-3 text-start">{t("email")}</th>
                  <th className="px-4 py-3 text-start">{t("role")}</th>
                  <th className="px-4 py-3 text-start">{t("scope")}</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">{t("permissions")}</th>
                  <th className="px-4 py-3 text-start">{t("details")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{user.displayName}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {user.emailMasked ?? "—"}
                    </td>
                    <td className="px-4 py-3">{user.role}</td>
                    <td className="px-4 py-3">
                      {user.scopeType}
                      {user.scopeCountryIds.length
                        ? ` [${user.scopeCountryIds.join(",")}]`
                        : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={user.status} />
                    </td>
                    <td className="px-4 py-3">{user.permissionCount}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/users/${encodeURIComponent(user.id)}`}
                        className="text-slate-700 underline"
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
