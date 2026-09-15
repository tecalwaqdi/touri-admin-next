"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  EmptyState,
  ErrorState,
} from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useI18n } from "@/i18n/I18nProvider";
import { presentRole } from "@/domain/presentation/rolePresentation";
import { presentPermission } from "@/domain/presentation/permissionPresentation";
import { formatCount } from "@/i18n/formatCount";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";

type RoleRow = {
  role: string;
  permissions: string[];
  permissionCount: number;
};

type RolesPayload = {
  roles: RoleRow[];
  allPermissions: string[];
  source: string;
  mutable: false;
};

export function RolesPage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/roles", { signal });
      if (res.status === 403) throw new Error(t("forbidden"));
      if (!res.ok) throw new Error(t("error"));
      return (await res.json()) as RolesPayload;
    },
    [apiFetch, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: "roles-matrix",
    fetcher,
    isEmpty: (payload) => payload.roles.length === 0,
  });

  return (
    <AdminShell title={t("rolesPermissions")}>
      <PermissionGuard permission="users:manage">
        <Breadcrumb
          items={[
            { label: t("users"), href: "/users" },
            { label: t("rolesPermissions") },
          ]}
        />
        <p className="mb-3 text-sm text-slate-600">{t("rolesMatrixHint")}</p>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <div
            data-testid="roles-matrix"
            className="overflow-auto rounded-lg border bg-white"
          >
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-start">{t("role")}</th>
                  <th className="px-3 py-2 text-start">{t("permissions")}</th>
                  <th className="px-3 py-2 text-start">{t("permissionCount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.roles.map((row) => (
                  <tr key={row.role} className="border-t align-top">
                    <td className="px-3 py-2 font-medium" title={row.role} data-role-key={row.role}>{presentRole(row.role, locale)}</td>
                    <td className="px-3 py-2">
                      <ul className="list-inside list-disc text-xs">
                        {row.permissions.map((p) => (
                          <li key={p} title={p} data-permission-key={p}>{presentPermission(p, locale)}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-3 py-2">{formatCount(row.permissionCount, locale)}</td>
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
