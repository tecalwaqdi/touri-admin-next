/**
 * Detect duplicate landmark display names within the same city/country.
 * Flag-only — no auto-merge / auto-delete.
 */

import type { GeographyDqIssue } from "@/domain/geography/GeographyDataQuality";

export type LandmarkDupInput = {
  landmarkId: string;
  displayName?: string | null;
  displayNameAr?: string | null;
  displayNameEn?: string | null;
  cityId?: string | null;
  countryId?: string | null;
  canonicalCountryId?: string | null;
};

function landmarkNameKey(row: LandmarkDupInput): string | null {
  const name = (
    row.displayNameEn ??
    row.displayNameAr ??
    row.displayName ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!name) return null;
  const city = (row.cityId ?? "").trim().toLowerCase();
  const country = (
    row.canonicalCountryId ??
    row.countryId ??
    ""
  )
    .trim()
    .toLowerCase();
  // Prefer city+name; also index country+name for cross-city duplicates.
  if (city) return `city:${city}::${name}`;
  if (country) return `country:${country}::${name}`;
  return `name:${name}`;
}

function landmarkCountryNameKey(row: LandmarkDupInput): string | null {
  const name = (
    row.displayNameEn ??
    row.displayNameAr ??
    row.displayName ??
    ""
  )
    .trim()
    .toLowerCase();
  const country = (
    row.canonicalCountryId ??
    row.countryId ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!name || !country) return null;
  return `country:${country}::${name}`;
}

export function detectDuplicateLandmarks(
  landmarks: readonly LandmarkDupInput[],
): GeographyDqIssue[] {
  const byKey = new Map<string, LandmarkDupInput[]>();
  for (const row of landmarks) {
    const key = landmarkNameKey(row);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  // Second pass: same display name within same country across cities
  // (e.g. Avenue Habib Bourguiba / Batu Caves synthetic vs real).
  for (const row of landmarks) {
    const key = landmarkCountryNameKey(row);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    if (!list.some((m) => m.landmarkId === row.landmarkId)) {
      list.push(row);
      byKey.set(key, list);
    }
  }

  const seenIssue = new Set<string>();
  const issues: GeographyDqIssue[] = [];
  for (const [, members] of byKey) {
    if (members.length < 2) continue;
    const label =
      members[0]?.displayNameEn ??
      members[0]?.displayNameAr ??
      members[0]?.displayName ??
      "landmark";
    for (const m of members) {
      const issueKey = `${m.landmarkId}::${label}`;
      if (seenIssue.has(issueKey)) continue;
      seenIssue.add(issueKey);
      issues.push({
        code: "DUPLICATE",
        severity: "WARNING",
        messageEn: `Duplicate landmark "${label}" (${members.length} records)`,
        messageAr: `معلم مكرر «${label}» (${members.length} سجلات)`,
        entityKind: "landmark",
        entityId: m.landmarkId,
      });
    }
  }
  return issues;
}
