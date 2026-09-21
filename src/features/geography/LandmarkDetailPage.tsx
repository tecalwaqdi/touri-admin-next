"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { GeographySubNav } from "@/features/geography/GeographyChrome";
import { adminUi } from "@/components/ui/adminUi";

function LandmarkImagePreviewButton({ landmarkId }: { landmarkId: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  return (
    <>
      <button type="button" data-testid="landmark-image-preview-btn" className={`${adminUi.btnGhost} mt-2`} disabled={busy} onClick={() => {
        setBusy(true); setMessage(null);
        void (async () => {
          try {
            const res = await apiFetch(`/api/storage/landmarks/${encodeURIComponent(landmarkId)}/0`);
            if (!res.ok) { setMessage(t("previewUnavailable")); return; }
            const blob = await res.blob();
            if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(blob.type)) {
              setMessage(t("previewUnavailable")); return;
            }
            setPreview({ url: URL.createObjectURL(blob), type: blob.type });
            dialog.current?.showModal();
          } catch { setMessage(t("previewUnavailable")); }
          finally { setBusy(false); }
        })();
      }}>{t("previewDocument")}</button>
      {message ? <p className="mt-1 text-xs text-slate-500">{message}</p> : null}
      <dialog ref={dialog} className="m-auto max-h-[90dvh] w-[min(92vw,60rem)] rounded-xl p-4 backdrop:bg-black/50" aria-label={t("previewDocument")} onClose={() => setPreview(null)}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t("previewDocument")}</h2>
          <button type="button" className={adminUi.btnGhost} onClick={() => dialog.current?.close()}>{locale === "ar" ? "إغلاق" : "Close"}</button>
        </div>
        {preview ? preview.type === "application/pdf"
          ? <iframe className="h-[70dvh] w-full" src={preview.url} title={t("previewDocument")} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img data-testid="landmark-image-preview" className="mx-auto max-h-[70dvh] max-w-full object-contain" src={preview.url} alt={t("previewDocument")} />
        : null}
      </dialog>
    </>
  );
}

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
                  {data.imagePresence === "present" ? (
                    <LandmarkImagePreviewButton landmarkId={data.landmarkId} />
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
