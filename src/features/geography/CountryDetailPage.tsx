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
import type { GeographyCountryDetail } from "@/application/geography/geographyListDtos";
import { GeographyWriteActions } from "@/features/geography/GeographyWriteActions";
import { GeographyEditPanel } from "@/features/geography/GeographyEditPanel";
import { CountryImageActions } from "@/features/geography/CountryImageActions";
import { SecureImagePreviewButton } from "@/features/geography/SecureImagePreview";
import { GeographySubNav } from "@/features/geography/GeographyChrome";

export function CountryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    (GeographyCountryDetail & {
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
        `/api/geography/countries/${encodeURIComponent(id)}`,
      );
      if (res.status === 404) throw new Error("Not found");
      if (res.status === 403) throw new Error("Forbidden");
      if (!res.ok) throw new Error("Failed to load country");
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
          { label: t("countries"), href: "/geography/countries" },
          { label: data?.displayName ?? id },
        ]}
      />
      <GeographySubNav />
      <SourceLabelBadge source={source} />
      {state === "loading" ? <SkeletonBlock /> : null}
      {state === "error" ? <ErrorState message={error ?? undefined} onRetry={() => void load()} /> : null}
      {state === "success" && data ? (
        <div className="space-y-4" data-testid="country-detail">
          <section className="rounded border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">
              {locale === "ar"
                ? data.displayNameAr ?? data.displayName
                : data.displayNameEn ?? data.displayName}
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{t("canonicalId")}</dt>
                <dd className="font-mono">{data.canonicalCountryId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("isoCode")}</dt>
                <dd>{data.iso2 ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("currency")}</dt>
                <dd>{data.currencyCode ?? t("unavailable")}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("status")}</dt>
                <dd>
                  <StatusBadge value={data.activeStatus ?? "unknown"} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("image")}</dt>
                <dd>
                  <StatusBadge value={data.imagePresence ?? "unavailable"} />
                  {(data.imagePresence ?? "unavailable") === "present" ? (
                    <SecureImagePreviewButton
                      apiPath={`/api/storage/countries/${encodeURIComponent(data.countryId)}/0`}
                      testIdPrefix="country-image"
                    />
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("invariant")}</dt>
                <dd>
                  <StatusBadge value={data.agentInvariantState} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("activeAgent")}</dt>
                <dd>
                  {data.activeAgentId ? (
                    <Link className="underline" href={`/agents/${data.activeAgentId}`}>
                      {data.activeAgentName ?? data.activeAgentId}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("dataQuality")}</dt>
                <dd>
                  <GeographyDqBadge severity={data.dqSeverity} />
                </dd>
              </div>
            </dl>
            <div className="mt-3 text-sm">
              <div className="text-slate-500">{t("aliases")}</div>
              <div className="font-mono text-xs">
                {(data.aliases ?? []).join(", ") || "—"}
              </div>
            </div>
          </section>
          <GeographyEditPanel
            resource="country"
            resourceId={data.countryId}
            displayNameEn={data.displayNameEn}
            displayNameAr={data.displayNameAr}
            isoCode={data.iso2}
            currencyCode={data.currencyCode}
            currencySymbol={data.currencySymbol}
            vatPercent={data.vatPercent}
            appCommissionPercent={data.appCommissionPercent}
            sortOrder={data.sortOrder}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            preconditionToken={data.countryId}
            onUpdated={() => void load()}
          />
          <CountryImageActions
            countryId={data.countryId}
            imagePresence={data.imagePresence ?? "unavailable"}
            onUpdated={() => void load()}
          />
          <GeographyWriteActions
            resource="country"
            resourceId={data.countryId}
            active={
              data.activeStatus === "active"
                ? true
                : data.activeStatus === "inactive"
                  ? false
                  : null
            }
            preconditionToken={data.countryId}
            onUpdated={() => void load()}
          />
          <section className="rounded border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold">
              {t("relatedCities")}
            </h3>
            <ul className="space-y-1 text-sm">
              {(data.relatedCities ?? []).map((c) => (
                <li key={c.cityId}>
                  <Link
                    className="underline"
                    href={`/geography/cities/${encodeURIComponent(c.cityId)}`}
                  >
                    {c.displayName ?? c.cityId}
                  </Link>
                </li>
              ))}
            </ul>
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
