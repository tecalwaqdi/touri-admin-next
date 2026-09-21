/**
 * Legacy Flutter Admin agent metadata fields (user/{id}).
 * Finance fields (Agent_total, app_commission_percent, vat_percent) are
 * intentionally excluded — Finance hard constraint; read-only in Admin Next.
 */

import { requireCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";

export function buildAgentMetadataLegacyPatch(input: {
  displayName?: string;
  phone?: string | null;
  countryId?: string;
  countryDisplayName?: string | null;
  activeFromUtc?: string | null;
  activeToUtc?: string | null;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.displayName != null && input.displayName.trim()) {
    patch.display_name = input.displayName.trim();
  }
  if (input.phone !== undefined) {
    const p = input.phone == null ? "" : String(input.phone).trim();
    patch.phone_number = p || null;
  }
  if (input.countryId != null && input.countryId.trim()) {
    try {
      const canonical = requireCanonicalCountryId(input.countryId.trim());
      patch.Rev_dloh_agent = { path: `countries/${canonical}` };
      const label = input.countryDisplayName?.trim();
      if (label) {
        patch.dolh_agent = label;
      }
    } catch {
      // Unmapped country — skip Rev_dloh_agent / dolh_agent (no invention).
    }
  }
  if (input.activeFromUtc !== undefined) {
    patch.agent_date_reg = input.activeFromUtc;
  }
  if (input.activeToUtc !== undefined) {
    patch.agent_date_end = input.activeToUtc;
  }
  return patch;
}

export function parseOptionalIsoFromBody(
  value: unknown,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s;
}
