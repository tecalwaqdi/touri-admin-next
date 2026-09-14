"use client";

import { useCallback } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { EmptyState, ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { useStableQuery } from "@/lib/useStableQuery";

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

export function UsersPage() {
  const { t } = useI18n();
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch("/api/users", { signal });
      if (res.status === 403) throw new Error(t("forbidden"));
      if (!res.ok) throw new Error("Failed to load users");
      const json = (await res.json()) as { items: UserRow[] };
      return json.items;
    },
    [apiFetch, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: "users-list",
    fetcher,
    isEmpty: (items) => items.length === 0,
  });

  return (
    <AdminShell title={t("users")}>
      <PermissionGuard permission="users:manage">
        <Breadcrumb items={[{ label: t("users") }]} />
        {(state === "loading" || state === "idle") && !data ? <SkeletonBlock /> : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
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
                {data.map((user) => (
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
