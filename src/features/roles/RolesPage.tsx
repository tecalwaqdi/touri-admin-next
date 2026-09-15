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
import { adminUi } from "@/components/ui/adminUi";
import {
  AdminDataTable,
  AdminTableHead,
  AdminTh,
  AdminTd,
  AdminTr,
} from "@/components/ui/AdminDataTable";

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
        <p className={adminUi.secondaryText}>{t("rolesMatrixHint")}</p>
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {state === "empty" ? <EmptyState /> : null}
        {state === "success" && data ? (
          <AdminDataTable testId="roles-matrix" dense>
            <AdminTableHead>
              <tr>
                <AdminTh>{t("role")}</AdminTh>
                <AdminTh>{t("permissions")}</AdminTh>
                <AdminTh>{t("permissionCount")}</AdminTh>
              </tr>
            </AdminTableHead>
            <tbody>
              {data.roles.map((row) => (
                <AdminTr key={row.role}>
                  <AdminTd
                    className="font-medium"
                    title={row.role}
                  >
                    <span data-role-key={row.role}>
                      {presentRole(row.role, locale)}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <ul className="flex flex-wrap gap-1.5">
                      {row.permissions.map((p) => (
                        <li
                          key={p}
                          title={p}
                          data-permission-key={p}
                          className={`${adminUi.badge} bg-slate-100 text-slate-800`}
                        >
                          {presentPermission(p, locale)}
                        </li>
                      ))}
                    </ul>
                  </AdminTd>
                  <AdminTd className="tabular-nums text-slate-500">
                    {formatCount(row.permissionCount, locale)}
                  </AdminTd>
                </AdminTr>
              ))}
            </tbody>
          </AdminDataTable>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
