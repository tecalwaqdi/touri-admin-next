/**
 * Canonical Legacy `mkan.tsnef` category values.
 *
 * Source of truth: Customer app `TouryLandmarkCategories`
 * (`ara_oatan_app/lib/core/toury_landmark_categories.dart`) — the same
 * Arabic storage strings used by customer filter chips / whereIn('tsnef').
 * Admin create defaults to `معالم سياحية` (see GeographyLegacyWriteFields).
 *
 * "الكل" is a filter-only chip and is intentionally omitted from write UIs.
 */

export type LegacyLandmarkCategory = {
  /** Firestore `tsnef` storage value (historically Arabic). */
  value: string;
  labelEn: string;
  labelAr: string;
};

/** Writable landmark categories (customer chip set minus "All"). */
export const LEGACY_LANDMARK_CATEGORIES: readonly LegacyLandmarkCategory[] = [
  {
    value: "معالم دينية",
    labelEn: "Religious landmarks",
    labelAr: "معالم دينية",
  },
  {
    value: "أماكن ترفيهية",
    labelEn: "Entertainment",
    labelAr: "أماكن ترفيهية",
  },
  {
    value: "معالم سياحية",
    labelEn: "Tourist landmarks",
    labelAr: "معالم سياحية",
  },
  {
    value: "مقهى",
    labelEn: "Cafe",
    labelAr: "مقهى",
  },
  {
    value: "معالم تاريخية",
    labelEn: "Historical landmarks",
    labelAr: "معالم تاريخية",
  },
  {
    value: "أماكن سياحية",
    labelEn: "Tourist places",
    labelAr: "أماكن سياحية",
  },
  {
    value: "أسواق",
    labelEn: "Markets",
    labelAr: "أسواق",
  },
  {
    value: "جولة برية",
    labelEn: "Desert tour",
    labelAr: "جولة برية",
  },
  {
    value: "جولة بحرية",
    labelEn: "Sea tour",
    labelAr: "جولة بحرية",
  },
  {
    value: "فنادق",
    labelEn: "Hotels",
    labelAr: "فنادق",
  },
  {
    value: "مطاعم",
    labelEn: "Restaurants",
    labelAr: "مطاعم",
  },
] as const;

export const LEGACY_LANDMARK_CATEGORY_VALUES: readonly string[] =
  LEGACY_LANDMARK_CATEGORIES.map((c) => c.value);

export function labelForLegacyLandmarkCategory(
  value: string,
  locale: "en" | "ar",
): string {
  const hit = LEGACY_LANDMARK_CATEGORIES.find((c) => c.value === value);
  if (!hit) return value;
  return locale === "ar" ? hit.labelAr : hit.labelEn;
}

export function isKnownLegacyLandmarkCategory(value: string): boolean {
  return LEGACY_LANDMARK_CATEGORY_VALUES.includes(value);
}
