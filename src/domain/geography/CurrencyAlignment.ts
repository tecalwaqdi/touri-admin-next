/**
 * Country↔currency alignment audit (PC-6, read-only).
 * Missing currency → unavailable. Never invent SAR / never FX-convert.
 */

import { currencyHintForCanonicalId } from "@/domain/geography/CountryOption";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";

export type CurrencyAlignmentStatus =
  | "aligned"
  | "mismatch"
  | "missing_stored"
  | "missing_expected"
  | "unavailable";

export type CurrencyAlignmentResult = {
  status: CurrencyAlignmentStatus;
  storedCurrency: string | null;
  expectedCurrency: string | null;
  canonicalCountryId: string | null;
  issue: GeographyDqIssue | null;
};

function norm(code: string | null | undefined): string | null {
  if (code == null) return null;
  const t = String(code).trim().toUpperCase();
  return t.length ? t : null;
}

/**
 * Compare stored Production currency to evidence-backed expected currency.
 * Does not mutate or default missing values.
 */
export function auditCountryCurrencyAlignment(input: {
  countryId: string;
  storedCurrency?: string | null;
}): CurrencyAlignmentResult {
  const canonicalCountryId = tryCanonicalCountryId(input.countryId);
  const storedCurrency = norm(input.storedCurrency);
  const expectedCurrency = norm(
    currencyHintForCanonicalId(canonicalCountryId ?? input.countryId),
  );

  if (!storedCurrency && !expectedCurrency) {
    return {
      status: "unavailable",
      storedCurrency: null,
      expectedCurrency: null,
      canonicalCountryId,
      issue: {
        code: "currency_unavailable",
        severity: "WARNING",
        messageEn: "Currency unavailable (missing stored and expected)",
        messageAr: "العملة غير متاحة (المخزّن والمتوقع مفقودان)",
        entityKind: "country",
        entityId: input.countryId,
      },
    };
  }

  if (!storedCurrency) {
    return {
      status: "missing_stored",
      storedCurrency: null,
      expectedCurrency,
      canonicalCountryId,
      issue: {
        code: "currency_missing_stored",
        severity: "WARNING",
        messageEn: "Stored currency missing — shown as unavailable",
        messageAr: "عملة السجل مفقودة — تُعرض كغير متاحة",
        entityKind: "country",
        entityId: input.countryId,
      },
    };
  }

  if (!expectedCurrency) {
    return {
      status: "missing_expected",
      storedCurrency,
      expectedCurrency: null,
      canonicalCountryId,
      issue: {
        code: "currency_missing_expected",
        severity: "INFO",
        messageEn: "No evidence-backed expected currency for this country",
        messageAr: "لا توجد عملة متوقعة موثّقة لهذه الدولة",
        entityKind: "country",
        entityId: input.countryId,
      },
    };
  }

  if (storedCurrency !== expectedCurrency) {
    return {
      status: "mismatch",
      storedCurrency,
      expectedCurrency,
      canonicalCountryId,
      issue: {
        code: "currency_mismatch",
        severity: "WARNING",
        messageEn: `Currency mismatch: stored ${storedCurrency}, expected ${expectedCurrency}`,
        messageAr: `عدم تطابق العملة: المخزّن ${storedCurrency}، المتوقع ${expectedCurrency}`,
        entityKind: "country",
        entityId: input.countryId,
      },
    };
  }

  return {
    status: "aligned",
    storedCurrency,
    expectedCurrency,
    canonicalCountryId,
    issue: null,
  };
}
