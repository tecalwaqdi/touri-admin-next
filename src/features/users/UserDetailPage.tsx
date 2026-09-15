"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  ErrorState,
  NotFoundState,
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
import { UserIdentityWriteActions } from "@/features/users/UserIdentityWriteActions";

type UserDetail = {
  id: string;
  emailMasked: string | null;
  displayName: string;
  role: string;
  scopeType: string;
  scopeCountryIds: string[];
  scopeAgentIds: string[];
  status: string;
  permissionCount: number;
  permissions?: string[];
  dataQualityWarnings?: string[];
  unavailable?: boolean;
  code?: string;
  error?: string;
  sourceLabel?: {
    label: string;
    en: string;
    ar: string;
    synthetic: boolean;
  };
};

export function UserDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params?.id ? decodeURIComponent(params.id) : "";
  const apiFetch = useApiFetch();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const res = await apiFetch(`/api/users/${encodeURIComponent(id)}`, {
        signal,
      });
      if (res.status === 403) throw new Error(t("forbidden"));
      if (res.status === 404) {
        return { notFound: true as const };
      }
      const json = (await res.json()) as UserDetail;
      if (res.status === 503 || json.unavailable) {
        return { unavailable: true as const, detail: json };
      }
      if (!res.ok) throw new Error(t("error"));
      return { detail: json };
    },
    [apiFetch, id, t],
  );

  const { state, data, error, reload } = useStableQuery({
    queryKey: `user-detail-${id}`,
    fetcher,
    enabled: !!id,
    isEmpty: () => false,
  });

  return (
    <AdminShell title={t("users")}>
      <PermissionGuard permission="users:manage">
        <Breadcrumb
          items={[
            { label: t("users"), href: "/users" },
            { label: id || t("details") },
          ]}
        />
        {(state === "loading" || state === "idle") && !data ? (
          <SkeletonBlock />
        ) : null}
        {state === "error" ? <ErrorState message={error} onRetry={reload} /> : null}
        {data && "notFound" in data && data.notFound ? <NotFoundState /> : null}
        {data && "unavailable" in data && data.unavailable ? (
          <UnavailableState
            message={data.detail?.error ?? t("unavailable")}
          />
        ) : null}
        {data && "detail" in data && data.detail && !data.detail.unavailable ? (
          <div className="space-y-4 rounded-lg border bg-white p-4 text-sm">
            <SourceLabelBadge
              source={
                data.detail.sourceLabel
                  ? {
                      label: normalizeSourceLabelCode(
                        data.detail.sourceLabel.label,
                      ),
                      code: normalizeSourceLabelCode(
                        data.detail.sourceLabel.label,
                      ),
                      en: data.detail.sourceLabel.en,
                      ar: data.detail.sourceLabel.ar,
                      synthetic: data.detail.sourceLabel.synthetic,
                    }
                  : resolveAdminDataSourceLabel({ productionFirestore: true })
              }
            />
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("name")}</dt>
                <dd>{data.detail.displayName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("email")}</dt>
                <dd className="font-mono text-xs">
                  {data.detail.emailMasked ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("role")}</dt>
                <dd>{data.detail.role}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("scope")}</dt>
                <dd>
                  {data.detail.scopeType}
                  {data.detail.scopeCountryIds?.length
                    ? ` [${data.detail.scopeCountryIds.join(",")}]`
                    : ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("status")}</dt>
                <dd>
                  <StatusBadge value={data.detail.status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("permissions")}</dt>
                <dd>{data.detail.permissionCount}</dd>
              </div>
            </dl>
            {data.detail.permissions?.length ? (
              <ul className="list-inside list-disc text-xs text-slate-700">
                {data.detail.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {data.detail.dataQualityWarnings?.length ? (
              <p className="text-xs text-amber-800">
                {t("dataQualityIssue")}:{" "}
                {data.detail.dataQualityWarnings.join(", ")}
              </p>
            ) : null}
            <UserIdentityWriteActions
              userId={data.detail.id}
              role={data.detail.role}
              status={data.detail.status}
              countryId={data.detail.scopeCountryIds?.[0] ?? null}
              preconditionToken={`user_${data.detail.id}_${data.detail.role}_${data.detail.status}`}
              onDone={() => void reload()}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
