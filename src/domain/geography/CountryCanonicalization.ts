/**
 * Phase 3.7 — Country canonicalization from Legacy evidence.
 * Sources:
 * - ara_oatan_app/lib/core/toury_country_registry.dart (_aliasesByIso, preferredCountryIdByIso)
 * - Admi/lib/backend/schema/countries_record.dart (iso_code, currency_code, naim)
 * - Phase 4A-1 Africa-three: live countries inventory + Legacy finance labels /
 *   ui_catalog + Admi/firebase/functions/legacy_africa_geo_compat.js (NG/TD/NE)
 * IDs are identity; names are NOT primary IDs (Arabic aliases are secondary keys only).
 */

export type MappingConfidence = "high" | "medium" | "low" | "unknown";

export type CountryCanonicalRow = {
  legacyId: string;
  name: string | null;
  iso2: string | null;
  iso3: string | null;
  canonicalCountryId: string;
  confidence: MappingConfidence;
  aliases: string[];
  evidence: string;
};

/**
 * Evidence-backed rows only — from TouryCountryRegistry preferred + aliases.
 * iso3 unknown when not in Legacy source → null (no internet guessing).
 */
export const COUNTRY_CANONICAL_TABLE: CountryCanonicalRow[] = [
  {
    legacyId: "saudi_arabia",
    name: "Saudi Arabia",
    iso2: "SA",
    iso3: null,
    canonicalCountryId: "saudi_arabia",
    confidence: "high",
    aliases: [
      "SA",
      "sa",
      "country_sa",
      "saudi_arabia",
      "saudi-arabia",
      "saudiarabia",
      // Exact Legacy Saudi document-id alias ONLY — not other demo_* ids.
      "demo_saudi",
    ],
    evidence:
      "toury_country_registry.dart preferredCountryIdByIso SA + _aliasesByIso; " +
      "Admi CountryResolver.legacySaudiIds=['saudi_arabia','demo_saudi']; " +
      "AdminSaudiCountry.knownDocIds; AdminOpsCountryScope Saudi refs; " +
      "backend_crud_audit.ps1 treats saudi_arabia↔demo_saudi as equivalent",
  },
  {
    legacyId: "kyrgyzstan",
    name: "Kyrgyzstan",
    iso2: "KG",
    iso3: null,
    canonicalCountryId: "kyrgyzstan",
    confidence: "high",
    aliases: ["country_kg", "kyrgyzstan"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "russia",
    name: "Russia",
    iso2: "RU",
    iso3: null,
    canonicalCountryId: "russia",
    confidence: "high",
    aliases: ["country_ru", "russia"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "uzbekistan",
    name: "Uzbekistan",
    iso2: "UZ",
    iso3: null,
    canonicalCountryId: "uzbekistan",
    confidence: "high",
    aliases: ["country_uz", "uzbekistan"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "spain",
    name: "Spain",
    iso2: "ES",
    iso3: null,
    canonicalCountryId: "spain",
    confidence: "high",
    aliases: ["country_es", "spain"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "morocco",
    name: "Morocco",
    iso2: "MA",
    iso3: null,
    canonicalCountryId: "morocco",
    confidence: "high",
    aliases: ["country_ma", "morocco"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "portugal",
    name: "Portugal",
    iso2: "PT",
    iso3: null,
    canonicalCountryId: "portugal",
    confidence: "high",
    aliases: ["country_pt", "portugal"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "tunisia",
    name: "Tunisia",
    iso2: "TN",
    iso3: null,
    canonicalCountryId: "tunisia",
    confidence: "high",
    aliases: ["country_tn", "tunisia"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "indonesia",
    name: "Indonesia",
    iso2: "ID",
    iso3: null,
    canonicalCountryId: "indonesia",
    confidence: "high",
    aliases: ["country_id", "indonesia"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "malaysia",
    name: "Malaysia",
    iso2: "MY",
    iso3: null,
    canonicalCountryId: "malaysia",
    confidence: "high",
    aliases: ["country_my", "malaysia"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "india",
    name: "India",
    iso2: "IN",
    iso3: null,
    canonicalCountryId: "india",
    confidence: "high",
    aliases: ["country_in", "india"],
    evidence: "toury_country_registry.dart",
  },
  {
    legacyId: "niger",
    name: "Niger",
    iso2: "NE",
    iso3: null,
    canonicalCountryId: "niger",
    confidence: "high",
    aliases: ["niger", "country_ne", "النيجر"],
    evidence:
      "Production countries/{niger} naim=النيجر (phase4a1 live-safe-summary); " +
      "accountant_finance_labels.dart niger→النيجر; ui_catalog ui_e1315f8be8 en=Niger; " +
      "legacy_africa_geo_compat.js COMPAT NE; finance census countries/niger (not CP5)",
  },
  {
    legacyId: "chad",
    name: "Chad",
    iso2: "TD",
    iso3: null,
    canonicalCountryId: "chad",
    confidence: "high",
    aliases: ["chad", "country_td", "تشاد"],
    evidence:
      "Production countries/{chad} naim=تشاد (phase4a1 live-safe-summary); " +
      "accountant_finance_labels.dart chad→تشاد; ui_catalog ui_4ad6b07b0b en=Chad; " +
      "legacy_africa_geo_compat.js COMPAT TD; finance census countries/chad (not CP5)",
  },
  {
    legacyId: "nigeria",
    name: "Nigeria",
    iso2: "NG",
    iso3: null,
    canonicalCountryId: "nigeria",
    confidence: "high",
    aliases: ["nigeria", "country_ng", "نيجيريا"],
    evidence:
      "Production countries/{nigeria} naim=نيجيريا (phase4a1 live-safe-summary); " +
      "accountant_finance_labels.dart nigeria→نيجيريا; ui_catalog ui_59c7a323d9 en=Nigeria; " +
      "legacy_africa_geo_compat.js COMPAT NG; finance census countries/nigeria (not CP5)",
  },
];

export type CountryResolveResult =
  | {
      status: "mapped";
      canonicalCountryId: string;
      iso2: string | null;
      confidence: MappingConfidence;
      matchedVia: string;
    }
  | { status: "unmapped"; input: string; confidence: "unknown" };

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/^countries\//, "");
}

export function resolveCanonicalCountryId(
  legacyCountryIdOrPath: string | null | undefined,
): CountryResolveResult {
  if (legacyCountryIdOrPath == null || !String(legacyCountryIdOrPath).trim()) {
    return { status: "unmapped", input: "", confidence: "unknown" };
  }
  const key = normalizeKey(String(legacyCountryIdOrPath));

  for (const row of COUNTRY_CANONICAL_TABLE) {
    if (row.canonicalCountryId === key || row.legacyId === key) {
      return {
        status: "mapped",
        canonicalCountryId: row.canonicalCountryId,
        iso2: row.iso2,
        confidence: row.confidence,
        matchedVia: "legacyId",
      };
    }
    if (row.aliases.map((a) => a.toLowerCase()).includes(key)) {
      return {
        status: "mapped",
        canonicalCountryId: row.canonicalCountryId,
        iso2: row.iso2,
        confidence: row.confidence,
        matchedVia: "alias",
      };
    }
    if (row.iso2 && row.iso2.toLowerCase() === key) {
      return {
        status: "mapped",
        canonicalCountryId: row.canonicalCountryId,
        iso2: row.iso2,
        confidence: "medium",
        matchedVia: "iso2",
      };
    }
  }

  return { status: "unmapped", input: key, confidence: "unknown" };
}
