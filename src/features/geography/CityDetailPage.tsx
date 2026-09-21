"use client";

import Link from "next/link";
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
import type { GeographyCityDetail } from "@/application/geography/geographyListDtos";
import { GeographyWriteActions } from "@/features/geography/GeographyWriteActions";
import { GeographyEditPanel } from "@/features/geography/GeographyEditPanel";
import { GeographySubNav } from "@/features/geography/GeographyChrome";
import { GeographyLandmarksCountCell } from "@/features/geography/GeographyLandmarksCountCell";
import { CityImageActions } from "@/features/geography/CityImageActions";
import { SecureImagePreviewButton } from "@/features/geography/SecureImagePreview";

export function CityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    (GeographyCityDetail & {
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
        `/api/geography/cities/${encodeURIComponent(id)}`,
      );
      if (res.status === 404) throw new Error("Not found");
      if (res.status === 403) throw new Error("Forbidden");
      if (!res.ok) throw new Error("Failed to load city");
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
          { label: t("cities"), href: "/geography/cities" },
          { label: data?.displayName ?? id },
        ]}
      />
      <GeographySubNav />
      <SourceLabelBadge source={source} />
      {state === "loading" ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
      {state === "success" && data ? (
        <div className="space-y-4" data-testid="city-detail">
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">
              {locale === "ar"
                ? data.displayNameAr ?? data.displayName
                : data.displayNameEn ?? data.displayName}
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("id")}</dt>
                <dd className="font-mono">{data.cityId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("country")}</dt>
                <dd>
                  {data.countryDisplayName ?? data.canonicalCountryId ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("status")}</dt>
                <dd>
                  <StatusBadge value={data.activeStatus} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("dataQuality")}</dt>
                <dd>
                  <GeographyDqBadge severity={data.dqSeverity} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("image")}</dt>
                <dd>
                  <StatusBadge value={data.imagePresence ?? "unavailable"} />
                  {(data.imagePresence ?? "unavailable") === "present" ? (
                    <SecureImagePreviewButton
                      apiPath={`/api/storage/cities/${encodeURIComponent(data.cityId)}/0`}
                      testIdPrefix="city-image"
                    />
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("landmarks")}</dt>
                <dd>
                  <GeographyLandmarksCountCell
                    count={data.landmarksCount}
                    locale={locale}
                    testId="city-detail-landmarks-count"
                  />
                </dd>
              </div>
            </dl>
          </section>
          <CityImageActions
            cityId={data.cityId}
            imagePresence={data.imagePresence ?? "unavailable"}
            onUpdated={() => void load()}
          />
          <GeographyEditPanel
            resource="city"
            resourceId={data.cityId}
            displayNameEn={data.displayNameEn}
            displayNameAr={data.displayNameAr}
            descriptionEn={data.descriptionEn}
            descriptionAr={data.descriptionAr}
            countryId={data.canonicalCountryId ?? data.countryId}
            regionId={data.regionId}
            lat={data.coordinates?.latitude ?? null}
            lng={data.coordinates?.longitude ?? null}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            preconditionToken={data.cityId}
            onUpdated={() => void load()}
          />
          <GeographyWriteActions
            resource="city"
            resourceId={data.cityId}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            preconditionToken={data.cityId}
            onUpdated={() => void load()}
          />
          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold">
              {t("relatedLandmarks")}
            </h3>
            {(data.relatedLandmarks ?? []).length === 0 ? (
              <p className="text-sm text-slate-600" data-testid="city-no-landmarks">
                {t("noLandmarks")}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {(data.relatedLandmarks ?? []).map((l) => (
                  <li key={l.landmarkId}>
                    <Link
                      className="underline"
                      href={`/geography/landmarks/${encodeURIComponent(l.landmarkId)}`}
                    >
                      {l.displayName ?? l.landmarkId}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
