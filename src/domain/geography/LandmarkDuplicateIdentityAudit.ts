/**
 * Phase 4A-3 — Landmark duplicate identity audit (read-only diagnostics).
 *
 * Exact collisions: same canonicalLandmarkId from distinct sourceDocumentIds.
 * Same landmark+city: same canonicalLandmarkId + cityId (distinct sources).
 * Semantic: same cityId + normalizedSafeName; nearby coordinates are evidence
 * only (do NOT auto-merge identity). Coords within NEARBY_METERS reinforce a
 * semantic group flag but are never treated as sole identity.
 *
 * Never collapses or picks a winner. testOrNoncanonical / malformed excluded
 * from operational duplicate metrics.
 */

import type {
  LandmarkActiveStatus,
  LandmarkMappingStatus,
} from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { normalizeSafeName } from "@/domain/geography/CityDuplicateIdentityAudit";

export type LandmarkCoordinates = {
  latitude: number;
  longitude: number;
};

export type LandmarkDuplicateAuditMember = {
  sourceDocumentId: string;
  canonicalLandmarkId: string;
  safeName: string;
  countryId: string;
  cityId: string;
  regionId: string | null;
  activeStatus: LandmarkActiveStatus;
  mappingStatus: LandmarkMappingStatus;
  coordinates: LandmarkCoordinates | null;
};

export type LandmarkDuplicateGroupKind =
  | "exactCanonicalId"
  | "sameLandmarkCity"
  | "semantic";

export type LandmarkDuplicateActivityClass =
  | "activeActive"
  | "activeInactive"
  | "inactiveInactive"
  | "unknownMixed";

export type LandmarkDuplicateGroup = {
  kind: LandmarkDuplicateGroupKind;
  key: string;
  activityClass: LandmarkDuplicateActivityClass;
  /** True when ≥2 members have coords within NEARBY_METERS (evidence only). */
  nearbyCoordinatesEvidence: boolean;
  members: LandmarkDuplicateAuditMember[];
};

export type LandmarkDuplicateIdentityAuditResult = {
  exactCanonicalIdDuplicateGroups: LandmarkDuplicateGroup[];
  sameLandmarkCityDuplicateGroups: LandmarkDuplicateGroup[];
  semanticDuplicateGroups: LandmarkDuplicateGroup[];
  activeActiveDuplicateGroups: LandmarkDuplicateGroup[];
  activeInactiveDuplicateGroups: LandmarkDuplicateGroup[];
  inactiveInactiveDuplicateGroups: LandmarkDuplicateGroup[];
  exactCanonicalDuplicates: number;
  semanticDuplicates: number;
  /**
   * Operational groups (exact ∪ sameLandmarkCity ∪ semantic) with ≥2 active.
   * Blocks Phase 4A-3 live readiness when > 0.
   */
  activeOperationalDuplicates: number;
};

/** Evidence radius for coordinate proximity — not auto identity. */
export const LANDMARK_NEARBY_METERS = 80;

export { normalizeSafeName };

function isOperational(m: LandmarkDuplicateAuditMember): boolean {
  return (
    m.mappingStatus !== "testOrNoncanonical" &&
    m.mappingStatus !== "malformed"
  );
}

function classifyActivity(
  members: LandmarkDuplicateAuditMember[],
): LandmarkDuplicateActivityClass {
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

/** Haversine distance in meters. */
export function haversineMeters(
  a: LandmarkCoordinates,
  b: LandmarkCoordinates,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function hasNearbyCoordinateEvidence(
  members: readonly LandmarkDuplicateAuditMember[],
  radiusMeters: number = LANDMARK_NEARBY_METERS,
): boolean {
  const withCoords = members.filter((m) => m.coordinates != null);
  for (let i = 0; i < withCoords.length; i += 1) {
    for (let j = i + 1; j < withCoords.length; j += 1) {
      const a = withCoords[i]!.coordinates!;
      const b = withCoords[j]!.coordinates!;
      if (haversineMeters(a, b) <= radiusMeters) return true;
    }
  }
  return false;
}

function semanticKey(m: LandmarkDuplicateAuditMember): string {
  const name = normalizeSafeName(m.safeName);
  return `${m.cityId}|${name}`;
}

function toGroup(
  kind: LandmarkDuplicateGroupKind,
  key: string,
  members: LandmarkDuplicateAuditMember[],
): LandmarkDuplicateGroup {
  return {
    kind,
    key,
    activityClass: classifyActivity(members),
    nearbyCoordinatesEvidence: hasNearbyCoordinateEvidence(members),
    members: [...members].sort((a, b) =>
      a.sourceDocumentId.localeCompare(b.sourceDocumentId),
    ),
  };
}

/**
 * Audit mapped landmark rows for exact + semantic duplicates.
 * testOrNoncanonical / malformed excluded from all operational counts.
 */
export function auditLandmarkDuplicateIdentity(
  rows: readonly LandmarkDuplicateAuditMember[],
): LandmarkDuplicateIdentityAuditResult {
  const operational = rows.filter(isOperational);

  const byCanonical = new Map<string, LandmarkDuplicateAuditMember[]>();
  for (const m of operational) {
    const id = m.canonicalLandmarkId?.trim() ?? "";
    if (!id) continue;
    const list = byCanonical.get(id) ?? [];
    list.push(m);
    byCanonical.set(id, list);
  }

  const exactCanonicalIdDuplicateGroups: LandmarkDuplicateGroup[] = [];
  for (const [id, members] of byCanonical) {
    const distinctSources = new Set(members.map((m) => m.sourceDocumentId));
    if (distinctSources.size < 2) continue;
    exactCanonicalIdDuplicateGroups.push(
      toGroup("exactCanonicalId", id, members),
    );
  }
  exactCanonicalIdDuplicateGroups.sort((a, b) => a.key.localeCompare(b.key));

  const sameLandmarkCityDuplicateGroups: LandmarkDuplicateGroup[] = [];
  const byLandmarkCity = new Map<string, LandmarkDuplicateAuditMember[]>();
  for (const m of operational) {
    const lid = m.canonicalLandmarkId?.trim() ?? "";
    const cid = m.cityId?.trim() ?? "";
    if (!lid || !cid) continue;
    const key = `${lid}|city:${cid}`;
    const list = byLandmarkCity.get(key) ?? [];
    list.push(m);
    byLandmarkCity.set(key, list);
  }
  for (const [key, members] of byLandmarkCity) {
    const distinctSources = new Set(members.map((m) => m.sourceDocumentId));
    if (distinctSources.size < 2) continue;
    // Exact canonical already covers same id; still report sameLandmarkCity
    // when distinct sources share landmark+city (usually overlaps exact).
    sameLandmarkCityDuplicateGroups.push(
      toGroup("sameLandmarkCity", key, members),
    );
  }
  sameLandmarkCityDuplicateGroups.sort((a, b) => a.key.localeCompare(b.key));

  const bySemantic = new Map<string, LandmarkDuplicateAuditMember[]>();
  for (const m of operational) {
    if (!m.cityId?.trim() || !m.safeName?.trim()) continue;
    const key = semanticKey(m);
    const list = bySemantic.get(key) ?? [];
    list.push(m);
    bySemantic.set(key, list);
  }

  const semanticDuplicateGroups: LandmarkDuplicateGroup[] = [];
  for (const [key, members] of bySemantic) {
    const distinctCanonical = new Set(
      members.map((m) => m.canonicalLandmarkId),
    );
    const distinctSources = new Set(members.map((m) => m.sourceDocumentId));
    if (distinctSources.size < 2 || distinctCanonical.size < 2) continue;
    semanticDuplicateGroups.push(toGroup("semantic", key, members));
  }
  semanticDuplicateGroups.sort((a, b) => a.key.localeCompare(b.key));

  const unionKeys = new Set<string>();
  const allGroups: LandmarkDuplicateGroup[] = [];
  for (const g of exactCanonicalIdDuplicateGroups) {
    const uk = `exact:${g.key}`;
    if (!unionKeys.has(uk)) {
      unionKeys.add(uk);
      allGroups.push(g);
    }
  }
  for (const g of sameLandmarkCityDuplicateGroups) {
    const uk = `sameLandmarkCity:${g.key}`;
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

  return {
    exactCanonicalIdDuplicateGroups,
    sameLandmarkCityDuplicateGroups,
    semanticDuplicateGroups,
    activeActiveDuplicateGroups,
    activeInactiveDuplicateGroups,
    inactiveInactiveDuplicateGroups,
    exactCanonicalDuplicates: exactCanonicalIdDuplicateGroups.length,
    semanticDuplicates: semanticDuplicateGroups.length,
    activeOperationalDuplicates: activeActiveDuplicateGroups.length,
  };
}

/**
 * Phase 4A-3 live readiness gate for landmark mapping + duplicates.
 */
export function landmarkMappingReadyForLiveClose(stats: {
  unmappedCountry: number;
  unmappedCity: number;
  ambiguousCountry: number;
  ambiguousCity: number;
  malformed: number;
  activeOperationalDuplicates: number;
}): boolean {
  return (
    stats.unmappedCountry === 0 &&
    stats.unmappedCity === 0 &&
    stats.ambiguousCountry === 0 &&
    stats.ambiguousCity === 0 &&
    stats.malformed === 0 &&
    stats.activeOperationalDuplicates === 0
  );
}
