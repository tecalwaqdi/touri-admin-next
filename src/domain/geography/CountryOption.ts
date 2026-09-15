/**
 * Presentation-layer country option model (PC-3).
 * canonicalId is the only filter/API identifier.
 * Display names are UI-only — never sent as identifiers.
 */

import {
  COUNTRY_CANONICAL_TABLE,
  resolveCanonicalCountryId,
} from "@/domain/geography/CountryCanonicalization";

export type CountryOptionAvailability =
  | "available"
  | "missing_name"
  | "partial";

export type CountryOption = {
  canonicalId: string;
  displayNameAr: string | null;
  displayNameEn: string | null;
  currency: string | null;
  availability: CountryOptionAvailability;
};

/** Evidence-backed currency hints by canonical country id. */
const CURRENCY_BY_CANONICAL: Record<string, string> = {
  saudi_arabia: "SAR",
  united_arab_emirates: "AED",
  egypt: "EGP",
  kuwait: "KWD",
  jordan: "JOD",
  kyrgyzstan: "KGS",
  russia: "RUB",
  uzbekistan: "UZS",
  spain: "EUR",
  morocco: "MAD",
  portugal: "EUR",
  tunisia: "TND",
  indonesia: "IDR",
  malaysia: "MYR",
  india: "INR",
  niger: "XOF",
  chad: "XAF",
  nigeria: "NGN",
};

/**
 * Arabic display names with evidence (aliases / ops labels).
 * Missing entries → null (never invent).
 */
const DISPLAY_NAME_AR: Record<string, string> = {
  saudi_arabia: "المملكة العربية السعودية",
  united_arab_emirates: "الإمارات العربية المتحدة",
  egypt: "مصر",
  kuwait: "الكويت",
  jordan: "الأردن",
  kyrgyzstan: "قيرغيزستان",
  russia: "روسيا",
  uzbekistan: "أوزبكستان",
  spain: "إسبانيا",
  morocco: "المغرب",
  portugal: "البرتغال",
  tunisia: "تونس",
  indonesia: "إندونيسيا",
  malaysia: "ماليزيا",
  india: "الهند",
  niger: "النيجر",
  chad: "تشاد",
  nigeria: "نيجيريا",
};

function optionFromCanonical(canonicalId: string, enName: string | null): CountryOption {
  const displayNameEn = enName?.trim() || null;
  const displayNameAr = DISPLAY_NAME_AR[canonicalId] ?? null;
  let availability: CountryOptionAvailability = "available";
  if (!displayNameEn && !displayNameAr) availability = "missing_name";
  else if (!displayNameEn || !displayNameAr) availability = "partial";
  return {
    canonicalId,
    displayNameAr,
    displayNameEn,
    currency: CURRENCY_BY_CANONICAL[canonicalId] ?? null,
    availability,
  };
}

/** Static options from the evidence-backed canonical table (filter dropdowns). */
export function buildCanonicalCountryOptions(): CountryOption[] {
  return COUNTRY_CANONICAL_TABLE.map((row) =>
    optionFromCanonical(row.canonicalCountryId, row.name),
  );
}

/**
 * Resolve a filter value to canonicalId.
 * Accepts ISO / alias / canonical; returns null when unmapped.
 */
export function resolveCountryFilterCanonicalId(
  raw: string | null | undefined,
): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const resolved = resolveCanonicalCountryId(raw);
  if (resolved.status === "mapped") return resolved.canonicalCountryId;
  // Preserve opaque Production ids (e.g. live doc id) for exact match filtering.
  return String(raw).trim();
}

export function countryOptionLabel(
  option: CountryOption,
  locale: "ar" | "en",
): string {
  if (locale === "ar") {
    return option.displayNameAr ?? option.displayNameEn ?? option.canonicalId;
  }
  return option.displayNameEn ?? option.displayNameAr ?? option.canonicalId;
}

export function currencyHintForCanonicalId(
  canonicalId: string | null | undefined,
): string | null {
  if (!canonicalId) return null;
  const resolved = resolveCanonicalCountryId(canonicalId);
  const id =
    resolved.status === "mapped" ? resolved.canonicalCountryId : canonicalId;
  return CURRENCY_BY_CANONICAL[id] ?? null;
}

/**
 * Finance/Settlements/Reports filter options.
 * FR7 matches countryId by exact string (often ISO2 like SA) — do not send
 * snake_case canonical ids into FR7 filters without aggregator equality support.
 */
export type FinanceCountryFilterOption = {
  /** Exact FR7 filter value (ISO2 when known). */
  filterId: string;
  displayNameAr: string | null;
  displayNameEn: string | null;
  currency: string | null;
};

export function buildFinanceCountryFilterOptions(): FinanceCountryFilterOption[] {
  return COUNTRY_CANONICAL_TABLE.filter((r) => r.iso2).map((row) => {
    const opt = optionFromCanonical(row.canonicalCountryId, row.name);
    return {
      filterId: row.iso2!,
      displayNameAr: opt.displayNameAr,
      displayNameEn: opt.displayNameEn,
      currency: opt.currency,
    };
  });
}
