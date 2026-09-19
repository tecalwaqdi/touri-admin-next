"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";

type FleetDetail = {
  item?: {
    id: string;
    displayName: string | null;
    licenseNumber: string | null;
    countryId: string | null;
    activeStatus: string;
    phone?: string | null;
    email?: string | null;
  };
};

export function FleetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FleetDetail["item"] | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/api/fleet/${encodeURIComponent(id)}`);
      if (res.status === 404) throw new Error(t("recordNotFound"));
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as FleetDetail;
      setDetail(json.item ?? null);
      setState(json.item ? "success" : "error");
      if (!json.item) setError(t("recordNotFound"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setState("error");
    }
  }, [apiFetch, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell title={t("fleetDetail")}>
      <Breadcrumb
        items={[
          { label: t("fleet"), href: "/fleet" },
          { label: detail?.displayName ?? id },
        ]}
      />
      {state === "loading" ? <SkeletonBlock rows={4} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "success" && detail ? (
        <dl
          className="mt-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2"
          data-testid="fleet-detail"
        >
          <div>
            <dt className="text-sm text-slate-500">{t("name")}</dt>
            <dd>{detail.displayName ?? detail.id}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("licenseNumber")}</dt>
            <dd>{detail.licenseNumber ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("country")}</dt>
            <dd>{detail.countryId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("status")}</dt>
            <dd>
              <StatusBadge value={detail.activeStatus} />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <Link className="text-emerald-700 underline" href="/fleet">
              {t("fleet")}
            </Link>
          </div>
        </dl>
      ) : null}
    </AdminShell>
  );
}
