"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
  SourceNotConfiguredState,
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
};

type UsersPayload = {
  items: UserRow[];
  unavailable?: boolean;
  error?: string;
  code?: string;
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
      if (!res.ok) throw new Error("Failed to load users");
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
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {data?.unavailable ? (
          <SourceNotConfiguredState message={notConfiguredMessage} />
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
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">{t("email")}</th>
                  <th className="px-4 py-3 text-start">Role</th>
                  <th className="px-4 py-3 text-start">Scope</th>
                  <th className="px-4 py-3 text-start">{t("status")}</th>
                  <th className="px-4 py-3 text-start">Permissions</th>
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
