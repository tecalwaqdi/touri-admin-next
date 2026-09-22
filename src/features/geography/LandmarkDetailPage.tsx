"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { ErrorState } from "@/components/states/QueryStates";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { GeographyDqBadge } from "@/components/ui/GeographyDqBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { GeographyLandmarkDetail } from "@/application/geography/geographyListDtos";
import { GeographyWriteActions } from "@/features/geography/GeographyWriteActions";
import { GeographyEditPanel } from "@/features/geography/GeographyEditPanel";
import { GeographyGateNotice, GeographySubNav } from "@/features/geography/GeographyChrome";
import { LandmarkImageActions } from "@/features/geography/LandmarkImageActions";
import { SecureImagePreviewButton } from "@/features/geography/SecureImagePreview";

export function LandmarkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    (GeographyLandmarkDetail & {
      label?: string;
      en?: string;
      ar?: string;
      synthetic?: boolean;
    }) | null
  >(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(
        `/api/geography/landmarks/${encodeURIComponent(id)}`,
      );
      if (res.status === 404) throw new Error("Not found");
      if (res.status === 403) throw new Error("Forbidden");
      if (!res.ok) throw new Error("Failed to load landmark");
      setData(await res.json());
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setState("error");
    }
  }, [apiFetch, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const source = data?.label
    ? {
        label: normalizeSourceLabelCode(data.label),
        code: normalizeSourceLabelCode(data.label),
        en: data.en ?? "",
        ar: data.ar ?? "",
        synthetic: data.synthetic === true,
      }
    : data
      ? resolveAdminDataSourceLabel({
          syntheticSource: data.synthetic === true,
          productionFirestore: data.synthetic === false,
        })
      : null;

  return (
    <AdminShell title={t("geography")}>
      <Breadcrumb
        items={[
          { label: t("geography"), href: "/geography" },
          { label: t("landmarks"), href: "/geography/landmarks" },
          { label: data?.displayName ?? id },
        ]}
      />
      <GeographySubNav />
      <GeographyGateNotice />
      <SourceLabelBadge source={source} />
      {state === "loading" ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
      {state === "success" && data ? (
        <div className="space-y-4" data-testid="landmark-detail">
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">
              {locale === "ar"
                ? data.displayNameAr ?? data.displayName
                : data.displayNameEn ?? data.displayName}
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("id")}</dt>
                <dd className="font-mono">{data.landmarkId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("country")}</dt>
                <dd>
                  {data.countryDisplayName ?? data.canonicalCountryId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("city")}</dt>
                <dd>
                  {data.cityDisplayName ?? (
                    <span className="font-mono text-xs">{data.cityId ?? "—"}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("status")}</dt>
                <dd>
                  <StatusBadge value={data.activeStatus} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("image")}</dt>
                <dd>
                  <StatusBadge value={data.imagePresence} />
                  {data.imagePresence === "present" &&
                  data.imageStorageKind === "firebase_storage" ? (
                    <SecureImagePreviewButton
                      apiPath={`/api/storage/landmarks/${encodeURIComponent(data.landmarkId)}/0`}
                      testIdPrefix="landmark-image"
                    />
                  ) : data.imagePresence === "present" &&
                    data.imageStorageKind &&
                    data.imageStorageKind !== "firebase_storage" ? (
                    <p
                      className="mt-1 text-xs text-slate-500"
                      data-testid="landmark-image-external-hint"
                    >
                      {t("imageExternalLegacyHint")}
                    </p>
                  ) : data.imageStorageKind ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {data.imageStorageKind}
                    </p>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("coords")}</dt>
                <dd>
                  {data.coordinates
                    ? `${data.coordinates.latitude}, ${data.coordinates.longitude}`
                    : data.coordinatesPresence}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("dataQuality")}</dt>
                <dd>
                  <GeographyDqBadge severity={data.dqSeverity} />
                </dd>
              </div>
            </dl>
          </section>
          <GeographyEditPanel
            resource="landmark"
            resourceId={data.landmarkId}
            displayNameEn={data.displayNameEn}
            displayNameAr={data.displayNameAr}
            descriptionEn={data.descriptionEn}
            descriptionAr={data.descriptionAr}
            countryId={data.canonicalCountryId ?? data.countryId}
            regionId={data.regionId}
            cityId={data.cityId}
            category={data.category}
            address={data.address}
            isMosque={data.isMosque}
            isFood={data.isFood}
            isRestroom={data.isRestroom}
            asAds={data.asAds}
            rate={data.rate}
            lat={data.coordinates?.latitude ?? null}
            lng={data.coordinates?.longitude ?? null}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            preconditionToken={data.landmarkId}
            onUpdated={() => void load()}
          />
          <LandmarkImageActions
            landmarkId={data.landmarkId}
            imagePresence={data.imagePresence}
            imageCount={data.imageCount}
            imageStorageKind={data.imageStorageKind}
            onUpdated={() => void load()}
          />
          <GeographyWriteActions
            resource="landmark"
            resourceId={data.landmarkId}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            visibilityStatus={data.visibilityStatus}
            preconditionToken={data.landmarkId}
            onUpdated={() => void load()}
          />
          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold">
              {t("dqWarnings")}
            </h3>
            <ul className="space-y-1 text-sm">
              {(data.dataQualityIssues ?? []).map((i, idx) => (
                <li key={`${i.code}-${idx}`}>
                  <GeographyDqBadge severity={i.severity} />{" "}
                  {locale === "ar" ? i.messageAr : i.messageEn}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </AdminShell>
  );
}
