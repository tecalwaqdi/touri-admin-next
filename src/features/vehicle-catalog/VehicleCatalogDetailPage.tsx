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
import { VehicleCatalogWriteActions } from "@/features/vehicle-catalog/VehicleCatalogWriteActions";
import { VehicleCatalogMetadataPanel } from "@/features/vehicle-catalog/VehicleCatalogMetadataPanel";
import type { CanonicalVehicleTypeReadModel } from "@/domain/vehicle-catalog/VehicleTypeMaster";

type VehicleDetailResponse = {
  item?: CanonicalVehicleTypeReadModel;
};

export function VehicleCatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CanonicalVehicleTypeReadModel | null>(
    null,
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(
        `/api/vehicle-catalog/${encodeURIComponent(id)}`,
      );
      if (res.status === 404) throw new Error(t("recordNotFound"));
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as VehicleDetailResponse;
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

  const displayName =
    detail == null
      ? id
      : locale === "ar"
        ? (detail.displayNameAr ?? detail.displayName)
        : (detail.displayNameEn ?? detail.displayName);

  return (
    <AdminShell title={t("vehicleCatalog")}>
      <Breadcrumb
        items={[
          { label: t("vehicleCatalog"), href: "/vehicle-catalog" },
          { label: displayName ?? id },
        ]}
      />
      {state === "loading" ? <SkeletonBlock rows={4} /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "success" && detail ? (
        <div className="mt-4 space-y-4">
          <dl
            className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2"
            data-testid="vehicle-catalog-detail"
          >
            <div>
              <dt className="text-sm text-slate-500">{t("name")}</dt>
              <dd>{displayName ?? detail.id}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("codeCar")}</dt>
              <dd>{detail.codeCar ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("hourlyRate")}</dt>
              <dd className="tabular-nums">{detail.hourlyRateSr ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("status")}</dt>
              <dd>
                <StatusBadge value={detail.activeStatus} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">{t("country")}</dt>
              <dd>{detail.countryId ?? detail.countryIso2 ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <Link
                className="text-emerald-700 underline"
                href="/vehicle-catalog"
              >
                {t("vehicleCatalog")}
              </Link>
            </div>
          </dl>
          <VehicleCatalogMetadataPanel vehicle={detail} onUpdated={() => void load()} />
          <VehicleCatalogWriteActions
            resourceId={detail.id}
            activeStatus={detail.activeStatus}
            preconditionToken={detail.id}
            displayLabel={displayName ?? detail.id}
            onUpdated={() => void load()}
          />
        </div>
      ) : null}
    </AdminShell>
  );
}
