/**
 * Phase 3.7 — Currency mapper.
 * Evidence: Admi/lib/core/admin_currency.dart fallbackByIso + countries_record.
 * No FX conversion. currencyConflict=true on mismatch.
 */

import type { MappingConfidence } from "@/domain/canonical/FieldProvenance";

/** Evidence-backed ISO2 → currency from AdminCurrency.fallbackByIso */
export const COUNTRY_CURRENCY_FALLBACK: Record<string, string> = {
  SA: "SAR",
  AE: "AED",
  KW: "KWD",
  BH: "BHD",
  QA: "QAR",
  OM: "OMR",
  EG: "EGP",
  JO: "JOD",
  KG: "KGS",
  RU: "RUB",
  UZ: "UZS",
  US: "USD",
  TR: "TRY",
};

export type CurrencyMappingResult = {
  currencyCode: string | null;
  confidence: MappingConfidence | "derived";
  source:
    | "order"
    | "country_doc"
    | "country_iso_fallback"
    | "settlement"
    | "missing";
  currencyConflict: boolean;
  warnings: string[];
};

export function mapCurrency(input: {
  orderCurrency?: string | null;
  countryCurrency?: string | null;
  countryIso2?: string | null;
  settlementCurrency?: string | null;
}): CurrencyMappingResult {
  const warnings: string[] = [];
  const order = normalizeCode(input.orderCurrency);
  const countryDoc = normalizeCode(input.countryCurrency);
  const settlement = normalizeCode(input.settlementCurrency);
  const iso = input.countryIso2?.trim().toUpperCase() || null;
  const fromIso =
    iso && COUNTRY_CURRENCY_FALLBACK[iso]
      ? COUNTRY_CURRENCY_FALLBACK[iso]
      : null;

  const present = [order, countryDoc, settlement, fromIso].filter(
    Boolean,
  ) as string[];
  const unique = [...new Set(present)];
  const currencyConflict = unique.length > 1;

  if (currencyConflict) {
    warnings.push(
      `currencyConflict: values=${unique.join(",")} (no FX conversion)`,
    );
  }

  if (order) {
    return {
      currencyCode: order,
      confidence: "high",
      source: "order",
      currencyConflict,
      warnings,
    };
  }

  if (settlement) {
    return {
      currencyCode: settlement,
      confidence: "high",
      source: "settlement",
      currencyConflict,
      warnings,
    };
  }

  if (countryDoc) {
    return {
      currencyCode: countryDoc,
      confidence: "high",
      source: "country_doc",
      currencyConflict,
      warnings,
    };
  }

  if (fromIso) {
    return {
      currencyCode: fromIso,
      confidence: "derived",
      source: "country_iso_fallback",
      currencyConflict,
      warnings: [
        ...warnings,
        `Derived currency ${fromIso} from country iso2=${iso} (AdminCurrency.fallbackByIso)`,
      ],
    };
  }

  return {
    currencyCode: null,
    confidence: "unknown",
    source: "missing",
    currencyConflict: false,
    warnings: ["Currency missing on order/country/settlement"],
  };
}

function normalizeCode(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim().toUpperCase();
  return t.length ? t : null;
}
