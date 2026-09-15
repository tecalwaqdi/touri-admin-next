/**
 * Geography presentation + data-quality diagnostics (read-only).
 * Never fabricates country/agent names; never mutates Production data.
 */

import {
  COUNTRY_CANONICAL_TABLE,
  resolveCanonicalCountryId,
} from "@/domain/geography/CountryCanonicalization";
import { tryCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";

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
  iso2: string | null;
  testOrNoncanonical: boolean;
  warnings: GeographyDataQualityWarning[];
};

const NAME_BY_CANONICAL = new Map(
  COUNTRY_CANONICAL_TABLE.map((r) => [r.canonicalCountryId, r.name] as const),
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
 */
export function resolveCountryDisplayName(input: {
  countryId: string;
  liveName?: string | null;
}): string | null {
  const live = input.liveName?.trim();
  if (live) return live;
  const resolved = resolveCanonicalCountryId(input.countryId);
  if (resolved.status === "mapped") {
    return NAME_BY_CANONICAL.get(resolved.canonicalCountryId) ?? null;
  }
  return null;
}

export function buildGeographyCountryPresentation(input: {
  countryId: string;
  liveName?: string | null;
}): GeographyCountryPresentation {
  const resolved = resolveCanonicalCountryId(input.countryId);
  const canonicalCountryId =
    resolved.status === "mapped" ? resolved.canonicalCountryId : null;
  const displayName = resolveCountryDisplayName(input);
  const warnings: GeographyDataQualityWarning[] = [];
  const testOrNoncanonical = isTestOrNoncanonicalCountryId(input.countryId);

  if (isMalformedOrLegacyCountryId(input.countryId)) {
    warnings.push({
      code: "malformed_legacy_country_id",
      messageEn: "Malformed or legacy test country ID",
      messageAr: "معرّف دولة تالف أو تجريبي قديم",
    });
  }
  if (!displayName) {
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
    displayName,
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
