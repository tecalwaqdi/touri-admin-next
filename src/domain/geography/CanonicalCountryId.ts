/**
 * Boundary-only country ID normalization.
 * Canonical IDs are deterministic (e.g. saudi_arabia). Aliases (SA, demo_saudi, …)
 * are accepted at input/read boundaries only — never as separate buckets.
 */

import {
  resolveCanonicalCountryId,
  COUNTRY_CANONICAL_TABLE,
  type CountryResolveResult,
} from "@/domain/geography/CountryCanonicalization";

export class InvalidCountryIdError extends Error {
  readonly code = "INVALID_COUNTRY_ID";
  constructor(readonly input: string) {
    super(`invalid_country_id:${input}`);
    this.name = "InvalidCountryIdError";
  }
}

/** Resolve without throwing — unmapped → null. */
export function tryCanonicalCountryId(
  input: string | null | undefined,
): string | null {
  const result = resolveCanonicalCountryId(input);
  return result.status === "mapped" ? result.canonicalCountryId : null;
}

/**
 * Firestore equality/`in` values for FR7 country queries.
 * Production docs mix ISO2 (`SA`), canonical (`saudi_arabia`), and path forms.
 */
export function financeCountryIdQueryValues(
  input: string | null | undefined,
): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) return [];
  const resolved = resolveCanonicalCountryId(raw);
  if (resolved.status !== "mapped") {
    return [raw];
  }
  const row = COUNTRY_CANONICAL_TABLE.find(
    (r) => r.canonicalCountryId === resolved.canonicalCountryId,
  );
  const values = new Set<string>();
  values.add(resolved.canonicalCountryId);
  values.add(`countries/${resolved.canonicalCountryId}`);
  if (row?.legacyId) values.add(row.legacyId);
  if (row?.iso2) {
    values.add(row.iso2);
    values.add(row.iso2.toLowerCase());
  }
  for (const alias of row?.aliases ?? []) {
    if (alias.trim()) values.add(alias.trim());
  }
  // Firestore `in` supports ≤30; keep a stable small set.
  return [...values].slice(0, 12);
}

/** Fail-closed: unknown / empty → InvalidCountryIdError. */
export function requireCanonicalCountryId(input: string): string {
  const result = resolveCanonicalCountryId(input);
  if (result.status !== "mapped") {
    throw new InvalidCountryIdError(String(input ?? ""));
  }
  return result.canonicalCountryId;
}

/** Normalize a list; duplicates collapse; invalid entries fail closed. */
export function canonicalizeCountryIdList(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const canonical = requireCanonicalCountryId(id);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/** True when both sides map to the same canonical ID. */
export function countryIdsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = tryCanonicalCountryId(a);
  const cb = tryCanonicalCountryId(b);
  if (ca == null || cb == null) return false;
  return ca === cb;
}

export function describeCountryResolve(
  input: string | null | undefined,
): CountryResolveResult {
  return resolveCanonicalCountryId(input);
}
