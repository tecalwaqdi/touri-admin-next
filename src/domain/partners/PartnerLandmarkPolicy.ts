/**
 * Legacy Partners = landmarks (`mkan`) with `isShrek == true`.
 * Not a separate Firestore collection — filtered landmark product surface.
 * Evidence: AdminPartnersWidget → AdminM3almWidget(partnersOnly: true).
 */

export const PARTNER_LANDMARK_FLAG_FIELD = "isShrek" as const;

/** Coerce legacy bool / "true" / 1 partner flags without inventing new sources. */
function isTruthyLegacyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

export function isPartnerLandmark(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return (
    isTruthyLegacyFlag(data[PARTNER_LANDMARK_FLAG_FIELD]) ||
    isTruthyLegacyFlag(data.is_partner) ||
    isTruthyLegacyFlag(data.isPartner)
  );
}

export type PartnerListFilter = {
  countryId?: string;
  partnersOnly: true;
};
