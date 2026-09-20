/**
 * Presentation-only geography labels for operator UI.
 * Never fabricates unknown names; evidence-backed country/city maps only.
 * Landmark IDs stay technical references when no canonical name is supplied.
 */

import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";
import { shortenId } from "@/domain/presentation/operationalDisplayName";

export type GeoLocale = "ar" | "en";

/**
 * Evidence-backed city labels for common Production city_sa_* ids
 * (legacy alias table slugs — not invented from arbitrary tokens).
 */
const CITY_LABELS: Record<string, { en: string; ar: string }> = {
  city_sa_riyadh: { en: "Riyadh", ar: "الرياض" },
  city_sa_jeddah: { en: "Jeddah", ar: "جدة" },
  city_sa_makkah: { en: "Makkah", ar: "مكة المكرمة" },
  city_sa_mecca: { en: "Makkah", ar: "مكة المكرمة" },
  city_sa_madinah: { en: "Madinah", ar: "المدينة المنورة" },
  city_sa_medina: { en: "Madinah", ar: "المدينة المنورة" },
  city_sa_dammam: { en: "Dammam", ar: "الدمام" },
  city_sa_taif: { en: "Taif", ar: "الطائف" },
  city_sa_khobar: { en: "Al Khobar", ar: "الخبر" },
  city_sa_abha: { en: "Abha", ar: "أبها" },
  city_sa_tabuk: { en: "Tabuk", ar: "تبوك" },
  city_sa_hail: { en: "Hail", ar: "حائل" },
  city_sa_jazan: { en: "Jazan", ar: "جازان" },
  city_sa_najran: { en: "Najran", ar: "نجران" },
  city_sa_buraidah: { en: "Buraidah", ar: "بريدة" },
  city_sa_yanbu: { en: "Yanbu", ar: "ينبع" },
  city_sa_jubail: { en: "Jubail", ar: "الجبيل" },
  city_riyadh: { en: "Riyadh", ar: "الرياض" },
  city_jeddah: { en: "Jeddah", ar: "جدة" },
  city_makkah: { en: "Makkah", ar: "مكة المكرمة" },
  city_madinah: { en: "Madinah", ar: "المدينة المنورة" },
  city_dammam: { en: "Dammam", ar: "الدمام" },
  city_taif: { en: "Taif", ar: "الطائف" },
  riyadh: { en: "Riyadh", ar: "الرياض" },
  jeddah: { en: "Jeddah", ar: "جدة" },
  dammam: { en: "Dammam", ar: "الدمام" },
};

export function presentCountryLabel(
  countryId: string | null | undefined,
  locale: GeoLocale,
): string | null {
  if (!countryId?.trim()) return null;
  return resolveCountryDisplayName({ countryId: countryId.trim(), locale });
}

export function presentCityLabel(
  cityId: string | null | undefined,
  locale: GeoLocale,
): string | null {
  if (!cityId?.trim()) return null;
  const key = cityId.trim().toLowerCase();
  const mapped = CITY_LABELS[key];
  if (mapped) return mapped[locale];
  return null;
}

/**
 * Primary city cell: human label when known; otherwise null (caller shows
 * unavailable / keeps id as secondary only — never invents).
 */
export function cityPrimaryLabel(
  cityId: string | null | undefined,
  locale: GeoLocale,
): string | null {
  return presentCityLabel(cityId, locale);
}

/**
 * Landmark display: only returns a non-id label when an explicit name is provided.
 * Otherwise null — ID belongs in secondary/title, not as a fabricated place name.
 */
export function presentLandmarkLabel(
  landmarkId: string | null | undefined,
  explicitName?: string | null,
): string | null {
  const name = explicitName?.trim();
  if (name) return name;
  if (!landmarkId?.trim()) return null;
  return null;
}

/** Compact technical ref for landmark / geo ids in tables. */
export function geoTechnicalRef(
  id: string | null | undefined,
  max = 14,
): string | null {
  return shortenId(id, max);
}

export function countryPrimaryLabel(
  canonicalCountryId: string | null | undefined,
  countryId: string | null | undefined,
  locale: GeoLocale,
): string | null {
  return (
    presentCountryLabel(canonicalCountryId, locale) ??
    presentCountryLabel(countryId, locale)
  );
}
