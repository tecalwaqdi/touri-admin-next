/**
 * Phase 4A-2 — City duplicate identity audit (read-only diagnostics).
 *
 * Exact collisions: same canonicalCityId from distinct sourceDocumentIds.
 * Semantic collisions: same countryId + normalizedSafeName + regionId key
 * (region omitted from key when absent/null on all members of a candidate pair —
 *  see semanticKey below).
 *
 * Never collapses or picks a winner. CP5 / testOrNoncanonical excluded from
 * operational duplicate metrics.
 */

import type {
  CityActiveStatus,
  CityMappingStatus,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";

export type CityDuplicateAuditMember = {
  sourceDocumentId: string;
  canonicalCityId: string;
  safeName: string;
  countryId: string;
  regionId: string | null;
  activeStatus: CityActiveStatus;
  mappingStatus: CityMappingStatus;
};

export type CityDuplicateGroupKind =
  | "exactCanonicalId"
  | "semantic";

export type CityDuplicateActivityClass =
  | "activeActive"
  | "activeInactive"
  | "inactiveInactive"
  | "unknownMixed";

export type CityDuplicateGroup = {
  kind: CityDuplicateGroupKind;
  key: string;
  activityClass: CityDuplicateActivityClass;
  members: CityDuplicateAuditMember[];
};

export type CityDuplicateIdentityAuditResult = {
  exactCanonicalIdDuplicateGroups: CityDuplicateGroup[];
  semanticDuplicateGroups: CityDuplicateGroup[];
  activeActiveDuplicateGroups: CityDuplicateGroup[];
  activeInactiveDuplicateGroups: CityDuplicateGroup[];
  inactiveInactiveDuplicateGroups: CityDuplicateGroup[];
  /** Count of exact canonical-id groups (size ≥ 2), operational only. */
  exactCanonicalDuplicates: number;
  /** Count of semantic groups (size ≥ 2), operational only. */
  semanticDuplicates: number;
  /**
   * Operational groups (exact ∪ semantic) with ≥2 active members.
   * Blocks Phase 4A-2 live readiness when > 0.
   */
  activeOperationalDuplicates: number;
};

/** Legacy intl shadow docs: city_sa_{es|ma|pt|tn|id|my|in}_* (AdminLegacyAliasFilter). */
export const LEGACY_INTL_ALIAS_CITY_ID =
  /^city_sa_(?:es|ma|pt|tn|id|my|in)_/i;

/** Africa compat shadows: city_sa_{ng|td|ne}_* (legacy_africa_geo_compat.js). */
export const LEGACY_AFRICA_COMPAT_CITY_ID = /^city_sa_(?:ng|td|ne)_/i;

export function isLegacyIntlAliasCityId(documentId: string): boolean {
  return LEGACY_INTL_ALIAS_CITY_ID.test(documentId.trim());
}

export function isLegacyAfricaCompatCityId(documentId: string): boolean {
  return LEGACY_AFRICA_COMPAT_CITY_ID.test(documentId.trim());
}

/**
 * Normalize display name for semantic comparison.
 * Unicode-aware lowercasing + whitespace collapse; no transliteration.
 */
export function normalizeSafeName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ");
}

function isOperational(m: CityDuplicateAuditMember): boolean {
  return m.mappingStatus !== "testOrNoncanonical" && m.mappingStatus !== "malformed";
}

function classifyActivity(
  members: CityDuplicateAuditMember[],
): CityDuplicateActivityClass {
  const statuses = members.map((m) => m.activeStatus);
  const hasActive = statuses.includes("active");
  const hasInactive = statuses.includes("inactive");
  const hasUnknown = statuses.includes("unknown");
  if (hasActive && hasInactive && !hasUnknown) return "activeInactive";
  if (hasActive && !hasInactive && !hasUnknown) {
    const activeCount = statuses.filter((s) => s === "active").length;
    return activeCount >= 2 ? "activeActive" : "unknownMixed";
  }
  if (!hasActive && hasInactive && !hasUnknown) {
    const inactiveCount = statuses.filter((s) => s === "inactive").length;
    return inactiveCount >= 2 ? "inactiveInactive" : "unknownMixed";
  }
  if (hasActive && hasInactive) return "activeInactive";
  return "unknownMixed";
}

function semanticKey(m: CityDuplicateAuditMember): string {
  const name = normalizeSafeName(m.safeName);
  const region = m.regionId && m.regionId.trim() ? m.regionId.trim() : "";
  // When region is present, include it so distinct regional cities do not collide.
  // When absent, key is country + name only (Legacy often omits cities ref).
  return region
    ? `${m.countryId}|${name}|region:${region}`
    : `${m.countryId}|${name}|region:∅`;
}

function toGroup(
  kind: CityDuplicateGroupKind,
  key: string,
  members: CityDuplicateAuditMember[],
): CityDuplicateGroup {
  return {
    kind,
    key,
    activityClass: classifyActivity(members),
    members: [...members].sort((a, b) =>
      a.sourceDocumentId.localeCompare(b.sourceDocumentId),
    ),
  };
}

/**
 * Audit mapped city rows for exact + semantic duplicates.
 * testOrNoncanonical / malformed excluded from all operational counts and groups.
 */
export function auditCityDuplicateIdentity(
  rows: readonly CityDuplicateAuditMember[],
): CityDuplicateIdentityAuditResult {
  const operational = rows.filter(isOperational);

  const byCanonical = new Map<string, CityDuplicateAuditMember[]>();
  for (const m of operational) {
    const id = m.canonicalCityId?.trim() ?? "";
    if (!id) continue;
    const list = byCanonical.get(id) ?? [];
    list.push(m);
    byCanonical.set(id, list);
  }

  const exactCanonicalIdDuplicateGroups: CityDuplicateGroup[] = [];
  for (const [id, members] of byCanonical) {
    const distinctSources = new Set(members.map((m) => m.sourceDocumentId));
    if (distinctSources.size < 2) continue;
    exactCanonicalIdDuplicateGroups.push(
      toGroup("exactCanonicalId", id, members),
    );
  }
  exactCanonicalIdDuplicateGroups.sort((a, b) => a.key.localeCompare(b.key));

  const bySemantic = new Map<string, CityDuplicateAuditMember[]>();
  for (const m of operational) {
    if (!m.countryId?.trim() || !m.safeName?.trim()) continue;
    const key = semanticKey(m);
    const list = bySemantic.get(key) ?? [];
    list.push(m);
    bySemantic.set(key, list);
  }

  const semanticDuplicateGroups: CityDuplicateGroup[] = [];
  for (const [key, members] of bySemantic) {
    const distinctCanonical = new Set(members.map((m) => m.canonicalCityId));
    const distinctSources = new Set(members.map((m) => m.sourceDocumentId));
    // Semantic = same country+name(+region) with distinct canonical identities.
    // Exact canonical collisions are reported separately (do not collapse).
    if (distinctSources.size < 2 || distinctCanonical.size < 2) continue;
    semanticDuplicateGroups.push(toGroup("semantic", key, members));
  }
  semanticDuplicateGroups.sort((a, b) => a.key.localeCompare(b.key));

  const unionKeys = new Set<string>();
  const allGroups: CityDuplicateGroup[] = [];
  for (const g of exactCanonicalIdDuplicateGroups) {
    const uk = `exact:${g.key}`;
    if (!unionKeys.has(uk)) {
      unionKeys.add(uk);
      allGroups.push(g);
    }
  }
  for (const g of semanticDuplicateGroups) {
    const uk = `semantic:${g.key}`;
    if (!unionKeys.has(uk)) {
      unionKeys.add(uk);
      allGroups.push(g);
    }
  }

  const activeActiveDuplicateGroups = allGroups.filter(
    (g) => g.activityClass === "activeActive",
  );
  const activeInactiveDuplicateGroups = allGroups.filter(
    (g) => g.activityClass === "activeInactive",
  );
  const inactiveInactiveDuplicateGroups = allGroups.filter(
    (g) => g.activityClass === "inactiveInactive",
  );

  const activeOperationalDuplicates = activeActiveDuplicateGroups.length;

  return {
    exactCanonicalIdDuplicateGroups,
    semanticDuplicateGroups,
    activeActiveDuplicateGroups,
    activeInactiveDuplicateGroups,
    inactiveInactiveDuplicateGroups,
    exactCanonicalDuplicates: exactCanonicalIdDuplicateGroups.length,
    semanticDuplicates: semanticDuplicateGroups.length,
    activeOperationalDuplicates,
  };
}

/**
 * Phase 4A-2 live readiness gate for city mapping stats (mapping + duplicates).
 * Does not require historical inactive/inactive duplicate groups to be zero.
 */
export function cityMappingReadyForLiveClose(stats: {
  unmappedCountry: number;
  ambiguousCountry: number;
  malformed: number;
  activeOperationalDuplicates: number;
}): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.ambiguousCountry === 0 &&
    stats.malformed === 0 &&
    stats.activeOperationalDuplicates === 0
  );
}
