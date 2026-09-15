/**
 * Geography presentation + data-quality diagnostics (read-only).
 * Never fabricates country/agent names; never mutates Production data.
 */

import {
  COUNTRY_CANONICAL_TABLE,
  resolveCanonicalCountryId,
} from "@/domain/geography/CountryCanonicalization";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import {
  buildCanonicalCountryOptions,
} from "@/domain/geography/CountryOption";

export type GeographyDataQualityWarningCode =
  | "malformed_legacy_country_id"
  | "missing_country_display_name"
  | "suspicious_active_agent_mapping"
  | "duplicate_active_agents"
  | "test_or_noncanonical_country";

export type GeographyDataQualityWarning = {
  code: GeographyDataQualityWarningCode;
  messageEn: string;
  messageAr: string;
};

export type GeographyCountryPresentation = {
  countryId: string;
  /** Canonical id when mapped; null if unmapped (never invent). */
  canonicalCountryId: string | null;
  /** Evidence-backed display name only — null when missing. */
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  iso2: string | null;
  testOrNoncanonical: boolean;
  warnings: GeographyDataQualityWarning[];
};

const NAME_BY_CANONICAL = new Map(
  COUNTRY_CANONICAL_TABLE.map((r) => [r.canonicalCountryId, r.name] as const),
);

const OPTION_BY_CANONICAL = new Map(
  buildCanonicalCountryOptions().map((o) => [o.canonicalId, o] as const),
);

export function isMalformedOrLegacyCountryId(countryId: string): boolean {
  const id = countryId.trim().toLowerCase();
  if (!id) return true;
  if (id.startsWith("cp5_country_")) return true;
  if (id.startsWith("cp5_")) return true;
  return false;
}

export function isTestOrNoncanonicalCountryId(countryId: string): boolean {
  const id = countryId.trim().toLowerCase();
  return (
    id.startsWith("cp5_country_") ||
    id.startsWith("cp5_") ||
    id.startsWith("test_") ||
    id.startsWith("demo_") ||
    id.startsWith("golden_") ||
    id.startsWith("qa_")
  );
}

/**
 * Resolve a presentation name without fabricating.
 * Prefer live Provenanced name; else canonical table name; else null.
 * Never uses document IDs as the primary display name when a real name exists.
 */
export function resolveCountryDisplayName(input: {
  countryId: string;
  liveName?: string | null;
  liveNameAr?: string | null;
  liveNameEn?: string | null;
  locale?: "ar" | "en";
}): string | null {
  const locale = input.locale ?? "en";
  const bilingual = resolveCountryDisplayNames(input);
  if (locale === "ar") {
    return bilingual.displayNameAr ?? bilingual.displayNameEn ?? null;
  }
  return bilingual.displayNameEn ?? bilingual.displayNameAr ?? null;
}

export function resolveCountryDisplayNames(input: {
  countryId: string;
  liveName?: string | null;
  liveNameAr?: string | null;
  liveNameEn?: string | null;
}): {
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
} {
  const resolved = resolveCanonicalCountryId(input.countryId);
  const canonicalId =
    resolved.status === "mapped" ? resolved.canonicalCountryId : null;
  const option = canonicalId ? OPTION_BY_CANONICAL.get(canonicalId) : null;

  const liveAr = input.liveNameAr?.trim() || null;
  const liveEn = input.liveNameEn?.trim() || null;
  const live = input.liveName?.trim() || null;

  // Prefer evidence-backed localized names; live Provenanced overrides table.
  let displayNameAr = liveAr ?? option?.displayNameAr ?? null;
  let displayNameEn =
    liveEn ??
    option?.displayNameEn ??
    (canonicalId ? NAME_BY_CANONICAL.get(canonicalId) ?? null : null);

  // Single live name: assign to EN when no bilingual split (never invent AR).
  if (live && !liveAr && !liveEn) {
    if (!displayNameEn) displayNameEn = live;
    else if (!displayNameAr && live !== displayNameEn) displayNameAr = live;
  }

  // Safe fallback to canonical ID only when no display name exists — callers
  // may show id as secondary mono label; primary stays null here.
  return {
    displayName: displayNameEn ?? displayNameAr ?? null,
    displayNameAr,
    displayNameEn,
  };
}

export function buildGeographyCountryPresentation(input: {
  countryId: string;
  liveName?: string | null;
  liveNameAr?: string | null;
  liveNameEn?: string | null;
}): GeographyCountryPresentation {
  const resolved = resolveCanonicalCountryId(input.countryId);
  const canonicalCountryId =
    resolved.status === "mapped" ? resolved.canonicalCountryId : null;
  const names = resolveCountryDisplayNames(input);
  const warnings: GeographyDataQualityWarning[] = [];
  const testOrNoncanonical = isTestOrNoncanonicalCountryId(input.countryId);

  if (isMalformedOrLegacyCountryId(input.countryId)) {
    warnings.push({
      code: "malformed_legacy_country_id",
      messageEn: "Malformed or legacy test country ID",
      messageAr: "معرّف دولة تالف أو تجريبي قديم",
    });
  }
  if (!names.displayName) {
    warnings.push({
      code: "missing_country_display_name",
      messageEn: "Missing country display name",
      messageAr: "اسم الدولة غير متوفر",
    });
  }
  if (testOrNoncanonical) {
    warnings.push({
      code: "test_or_noncanonical_country",
      messageEn: "Test / non-canonical country record",
      messageAr: "سجل دولة تجريبي / غير معياري",
    });
  }

  return {
    countryId: input.countryId,
    canonicalCountryId,
    displayName: names.displayName,
    displayNameAr: names.displayNameAr,
    displayNameEn: names.displayNameEn,
    iso2: resolved.status === "mapped" ? resolved.iso2 : null,
    testOrNoncanonical,
    warnings,
  };
}

export function diagnoseSuspiciousActiveAgent(input: {
  agentName: string | null | undefined;
  authoritativeRole?: string | null;
  isOperationalAgent?: boolean;
  mappingStatus?: string | null;
}): GeographyDataQualityWarning | null {
  const role = input.authoritativeRole ?? "";
  const contaminatingRoles = new Set([
    "super_admin",
    "finance",
    "partner",
    "transport",
  ]);
  const name = (input.agentName ?? "").toLowerCase();
  const nameLooksAdmin =
    name.includes("super admin") ||
    name.includes("superadmin") ||
    name.includes("توري سوبر");

  if (
    contaminatingRoles.has(role) ||
    input.isOperationalAgent === false ||
    input.mappingStatus === "excludedNonAgent" ||
    nameLooksAdmin
  ) {
    return {
      code: "suspicious_active_agent_mapping",
      messageEn:
        "Suspicious active-agent mapping (admin/contamination signals) — review without mutating",
      messageAr:
        "تعيين وكيل نشط مشبوه (إشارات إدارة/تلوث) — للمراجعة دون تعديل البيانات",
    };
  }
  return null;
}

export function diagnoseDuplicateActiveAgents(
  activeCount: number,
): GeographyDataQualityWarning | null {
  if (activeCount > 1) {
    return {
      code: "duplicate_active_agents",
      messageEn: "Duplicate active agents — invariant fail",
      messageAr: "وكلاء نشطون متعددون — فشل القيد",
    };
  }
  return null;
}

/** Bucket key for matching agents↔countries across aliases (SA ↔ saudi_arabia). */
export function geographyCountryBucketKey(countryId: string): string {
  return tryCanonicalCountryId(countryId) ?? countryId.trim().toLowerCase();
}
