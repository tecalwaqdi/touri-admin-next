/**
 * Phase 3.7 — City alias resolution from Legacy Source evidence ONLY.
 * Evidence: Admi/lib/backend/admin_geo_aliases.dart + admin_geo_aliases_test.dart
 * Never auto-pick when multiple candidates → AMBIGUOUS_CITY.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type GeographyMappingStatus =
  | "mapped"
  | "unmapped"
  | "ambiguous"
  | "not_applicable";

export type CityAliasEntry = {
  aliasId: string;
  canonicalCityId: string;
  countryId: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string;
};

export type CityAliasFile = {
  version: string;
  source: string;
  aliases: CityAliasEntry[];
};

export type CityResolveResult =
  | {
      status: "mapped";
      cityId: string;
      geographyMappingStatus: "mapped";
      confidence: "high" | "medium" | "low";
      matchedAlias: string;
    }
  | {
      status: "ambiguous";
      cityId: null;
      geographyMappingStatus: "ambiguous";
      code: "AMBIGUOUS_CITY";
      candidates: string[];
    }
  | {
      status: "unmapped";
      cityId: null;
      geographyMappingStatus: "unmapped";
      input: string;
    };

let cachedAliases: CityAliasEntry[] | null = null;

export function loadCityAliases(
  filePath?: string,
): CityAliasEntry[] {
  if (cachedAliases && !filePath) return cachedAliases;
  const path =
    filePath ??
    join(process.cwd(), "docs/legacy-mapping/legacy-city-aliases.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as CityAliasFile;
  const aliases = raw.aliases ?? [];
  if (!filePath) cachedAliases = aliases;
  return aliases;
}

export function resetCityAliasCache(): void {
  cachedAliases = null;
}

/**
 * Resolve a legacy city / village id via explicit alias table.
 * Multiple distinct canonical targets → AMBIGUOUS_CITY (no auto-pick).
 */
export function resolveCityId(
  legacyCityId: string | null | undefined,
  aliases: CityAliasEntry[] = loadCityAliases(),
): CityResolveResult {
  if (legacyCityId == null || !String(legacyCityId).trim()) {
    return {
      status: "unmapped",
      cityId: null,
      geographyMappingStatus: "unmapped",
      input: "",
    };
  }
  const key = String(legacyCityId).trim();

  // Already canonical id present as target
  const asTarget = aliases.filter((a) => a.canonicalCityId === key);
  if (asTarget.length === 1 && !aliases.some((a) => a.aliasId === key)) {
    return {
      status: "mapped",
      cityId: key,
      geographyMappingStatus: "mapped",
      confidence: asTarget[0].confidence,
      matchedAlias: key,
    };
  }

  const matches = aliases.filter((a) => a.aliasId === key);
  if (matches.length === 0) {
    // Identity passthrough if already looks like city_sa_* (evidence: admin_geo_aliases leaves these)
    if (
      key.startsWith("city_sa_") ||
      key.startsWith("city_kg_") ||
      key.startsWith("city_uz_") ||
      key.startsWith("city_ru_") ||
      /^city_(es|ma|pt|tn|id|my|in)_/.test(key)
    ) {
      return {
        status: "mapped",
        cityId: key,
        geographyMappingStatus: "mapped",
        confidence: "high",
        matchedAlias: key,
      };
    }
    return {
      status: "unmapped",
      cityId: null,
      geographyMappingStatus: "unmapped",
      input: key,
    };
  }

  const uniqueTargets = [...new Set(matches.map((m) => m.canonicalCityId))];
  if (uniqueTargets.length > 1) {
    return {
      status: "ambiguous",
      cityId: null,
      geographyMappingStatus: "ambiguous",
      code: "AMBIGUOUS_CITY",
      candidates: uniqueTargets,
    };
  }

  return {
    status: "mapped",
    cityId: uniqueTargets[0],
    geographyMappingStatus: "mapped",
    confidence: matches[0].confidence,
    matchedAlias: key,
  };
}

/**
 * City-scope ops require mapped cityId. Unmapped/ambiguous → blocked.
 */
export function isCityScopeOperationAllowed(
  result: CityResolveResult,
): boolean {
  return result.status === "mapped" && result.cityId != null;
}
