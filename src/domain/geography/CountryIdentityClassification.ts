/**
 * Central country identity classification (PC-6).
 * Canonical IDs remain authoritative; aliases are never written back.
 */

import {
  COUNTRY_CANONICAL_TABLE,
  resolveCanonicalCountryId,
} from "@/domain/geography/CountryCanonicalization";
import { classifyLegacyCountryRecord } from "@/domain/geography/CountryRecordClassification";

export type CountryIdentityClass =
  | "canonical"
  | "known_alias"
  | "legacy"
  | "malformed"
  | "unknown";

export type CountryIdentityClassification = {
  inputId: string;
  identityClass: CountryIdentityClass;
  /** Canonical id when mapped; null when unknown/malformed (never invent). */
  canonicalCountryId: string | null;
  matchedVia: "legacyId" | "alias" | "iso2" | null;
  /** Evidence-backed aliases for the canonical row (empty when unmapped). */
  knownAliases: string[];
  iso2: string | null;
  reasons: string[];
};

const LEGACY_MARKER_IDS = new Set(
  [
    "demo_saudi", // contractual Saudi alias — also tagged legacy for ops visibility
  ].map((s) => s.toLowerCase()),
);

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/^countries\//, "");
}

function aliasesForCanonical(canonicalId: string): string[] {
  const row = COUNTRY_CANONICAL_TABLE.find(
    (r) => r.canonicalCountryId === canonicalId,
  );
  if (!row) return [];
  return [...new Set([row.legacyId, ...row.aliases, row.iso2].filter(Boolean))] as string[];
}

/**
 * Classify a country document/filter id without renaming anything.
 */
export function classifyCountryIdentity(
  countryId: string | null | undefined,
  data?: Record<string, unknown> | null,
): CountryIdentityClassification {
  const input = String(countryId ?? "").trim();
  if (!input) {
    return {
      inputId: "",
      identityClass: "malformed",
      canonicalCountryId: null,
      matchedVia: null,
      knownAliases: [],
      iso2: null,
      reasons: ["missing_country_id"],
    };
  }

  const key = normalizeKey(input);
  const recordClass =
    data != null
      ? classifyLegacyCountryRecord({ documentId: key, data })
      : classifyLegacyCountryRecord({
          documentId: key,
          data: { naim: key },
        });

  // CP5 / functional-test fixtures: never silently rewrite to a canonical country.
  if (
    recordClass.classification === "test_or_noncanonical" &&
    (key.startsWith("cp5_country_") ||
      recordClass.reasons.includes("cp5_country_id_pattern") ||
      recordClass.reasons.includes("functional_test_checkpoint_admin_cp5"))
  ) {
    return {
      inputId: key,
      identityClass: "malformed",
      canonicalCountryId: null,
      matchedVia: null,
      knownAliases: [],
      iso2: null,
      reasons: recordClass.reasons.length
        ? recordClass.reasons
        : ["test_or_noncanonical_country"],
    };
  }

  if (recordClass.classification === "malformed") {
    return {
      inputId: key,
      identityClass: "malformed",
      canonicalCountryId: null,
      matchedVia: null,
      knownAliases: [],
      iso2: null,
      reasons: recordClass.reasons,
    };
  }

  const resolved = resolveCanonicalCountryId(key);
  if (resolved.status === "unmapped") {
    // Contractual test prefixes that are not CP5 country docs → legacy bucket.
    if (
      key.startsWith("test_") ||
      key.startsWith("demo_") ||
      key.startsWith("golden_") ||
      key.startsWith("qa_") ||
      key.startsWith("pilot_")
    ) {
      return {
        inputId: key,
        identityClass: "legacy",
        canonicalCountryId: null,
        matchedVia: null,
        knownAliases: [],
        iso2: null,
        reasons: ["unmapped_legacy_or_fixture_prefix"],
      };
    }
    return {
      inputId: key,
      identityClass: "unknown",
      canonicalCountryId: null,
      matchedVia: null,
      knownAliases: [],
      iso2: null,
      reasons: ["unmapped_country_id"],
    };
  }

  const matchedVia =
    resolved.matchedVia === "legacyId" ||
    resolved.matchedVia === "alias" ||
    resolved.matchedVia === "iso2"
      ? resolved.matchedVia
      : null;

  if (key === resolved.canonicalCountryId && matchedVia === "legacyId") {
    return {
      inputId: key,
      identityClass: "canonical",
      canonicalCountryId: resolved.canonicalCountryId,
      matchedVia,
      knownAliases: aliasesForCanonical(resolved.canonicalCountryId),
      iso2: resolved.iso2,
      reasons: [],
    };
  }

  // Known alias (SA, demo_saudi, …). demo_saudi also carries legacy evidence.
  if (LEGACY_MARKER_IDS.has(key) || key.startsWith("demo_")) {
    return {
      inputId: key,
      identityClass: "legacy",
      canonicalCountryId: resolved.canonicalCountryId,
      matchedVia,
      knownAliases: aliasesForCanonical(resolved.canonicalCountryId),
      iso2: resolved.iso2,
      reasons: ["legacy_alias_normalized"],
    };
  }

  return {
    inputId: key,
    identityClass: "known_alias",
    canonicalCountryId: resolved.canonicalCountryId,
    matchedVia,
    knownAliases: aliasesForCanonical(resolved.canonicalCountryId),
    iso2: resolved.iso2,
    reasons: matchedVia ? [`normalized_via_${matchedVia}`] : [],
  };
}
