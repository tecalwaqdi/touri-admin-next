/**
 * Legacy Partners = landmarks (`mkan`) with `isShrek == true`.
 * Not a separate Firestore collection — filtered landmark product surface.
 * Evidence: AdminPartnersWidget → AdminM3almWidget(partnersOnly: true).
 */

export const PARTNER_LANDMARK_FLAG_FIELD = "isShrek" as const;

export function isPartnerLandmark(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return data[PARTNER_LANDMARK_FLAG_FIELD] === true || data.is_partner === true;
}

export type PartnerListFilter = {
  countryId?: string;
  partnersOnly: true;
};
