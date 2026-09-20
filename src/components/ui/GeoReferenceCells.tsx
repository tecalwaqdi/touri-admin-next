"use client";

import { useI18n } from "@/i18n/I18nProvider";
import {
  countryPrimaryLabel,
  cityPrimaryLabel,
  geoTechnicalRef,
} from "@/domain/presentation/geoReferencePresentation";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { UnavailableText } from "@/components/ui/AggregateMetricCell";

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

export function LandmarkCell({
  landmarkId,
  explicitName,
}: {
  landmarkId?: string | null;
  explicitName?: string | null;
}) {
  const { t, locale } = useI18n();
  const name = explicitName?.trim() || null;
  if (name) {
    return (
      <PrimaryWithTechnicalId
        primary={name}
        technicalId={landmarkId}
        emptyLabel={t("unavailable")}
      />
    );
  }
  if (landmarkId) {
    const short = geoTechnicalRef(landmarkId, 16) ?? landmarkId;
    return (
      <PrimaryWithTechnicalId
        primary={short}
        technicalId={short !== landmarkId ? landmarkId : null}
        emptyLabel={t("unavailable")}
      />
    );
  }
  return <UnavailableText locale={locale} value={null} />;
}
