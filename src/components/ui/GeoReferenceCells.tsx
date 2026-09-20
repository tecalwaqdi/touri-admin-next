"use client";

import { useI18n } from "@/i18n/I18nProvider";
import {
  countryPrimaryLabel,
  cityPrimaryLabel,
  geoTechnicalRef,
  presentLandmarkLabel,
} from "@/domain/presentation/geoReferencePresentation";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { UnavailableText } from "@/components/ui/AggregateMetricCell";

export type GeoFieldKnowledge = "known" | "missing" | "unknown" | null | undefined;

export function CountryCell({
  canonicalCountryId,
  countryId,
}: {
  canonicalCountryId?: string | null;
  countryId?: string | null;
}) {
  const { t, locale } = useI18n();
  const label = countryPrimaryLabel(canonicalCountryId, countryId, locale);
  const tech = canonicalCountryId ?? countryId ?? null;
  if (label) {
    return (
      <PrimaryWithTechnicalId
        primary={label}
        technicalId={tech !== label ? tech : null}
        emptyLabel={t("unavailable")}
      />
    );
  }
  if (tech) {
    return (
      <PrimaryWithTechnicalId
        primary={null}
        technicalId={tech}
        emptyLabel={t("unavailable")}
      />
    );
  }
  return <UnavailableText locale={locale} value={null} />;
}

export function CityCell({ cityId }: { cityId?: string | null }) {
  const { t, locale } = useI18n();
  const label = cityPrimaryLabel(cityId, locale);
  if (label) {
    return (
      <PrimaryWithTechnicalId
        primary={label}
        technicalId={cityId !== label ? cityId : null}
        emptyLabel={t("unavailable")}
      />
    );
  }
  if (cityId) {
    return (
      <PrimaryWithTechnicalId
        primary={null}
        technicalId={geoTechnicalRef(cityId, 18) ?? cityId}
        emptyLabel={t("unavailable")}
      />
    );
  }
  return <UnavailableText locale={locale} value={null} />;
}

/**
 * Landmark cell: human name when known; never promote raw/shortened ID to primary.
 * Absent destination (no id / missing knowledge) → missing/not-applicable.
 * Broken lookup (id present, no resolvable name) → unavailable + technical id.
 */
export function LandmarkCell({
  landmarkId,
  explicitName,
  knowledge,
}: {
  landmarkId?: string | null;
  explicitName?: string | null;
  knowledge?: GeoFieldKnowledge;
}) {
  const { t, locale } = useI18n();
  const name =
    presentLandmarkLabel(landmarkId, explicitName) ??
    (explicitName?.trim() || null);

  if (name) {
    return (
      <PrimaryWithTechnicalId
        primary={name}
        technicalId={landmarkId}
        emptyLabel={t("unavailable")}
      />
    );
  }

  if (landmarkId?.trim()) {
    return (
      <PrimaryWithTechnicalId
        primary={null}
        technicalId={landmarkId}
        emptyLabel={t("unavailable")}
      />
    );
  }

  if (knowledge === "missing") {
    return (
      <span className="text-slate-400">{t("missing")}</span>
    );
  }
  if (knowledge === "unknown") {
    return (
      <span className="text-slate-400">
        {locale === "ar" ? "غير معروف" : "Unknown"}
      </span>
    );
  }
  return <UnavailableText locale={locale} value={null} />;
}
