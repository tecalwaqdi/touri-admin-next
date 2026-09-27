/**
 * Legacy Flutter Admin agent metadata fields (user/{id}).
 * Finance fields (Agent_total, app_commission_percent, vat_percent) are
 * intentionally excluded — Finance hard constraint; read-only in Admin Next.
 *
 * When country is linked, optional country operational bounds are copied onto
 * agent_bounds_* / agent_geo_center so agent scope matches the country box.
 */

import { requireCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import {
  toGeoPointValue,
  type GeoBoundsWithCenter,
} from "@/domain/geography/GeoBounds";

export function buildAgentMetadataLegacyPatch(input: {
  displayName?: string;
  phone?: string | null;
  countryId?: string;
  countryDisplayName?: string | null;
  activeFromUtc?: string | null;
  activeToUtc?: string | null;
  /** When country changes and country doc has bounds — copy onto agent. */
  countryBounds?: GeoBoundsWithCenter | null;
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
  if (input.countryBounds) {
    patch.agent_bounds_sw = toGeoPointValue(input.countryBounds.sw);
    patch.agent_bounds_ne = toGeoPointValue(input.countryBounds.ne);
    patch.agent_geo_center = toGeoPointValue(input.countryBounds.center);
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
