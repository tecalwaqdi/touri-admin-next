/**
 * Tour guides — Legacy `user` docs with is_tour_guide == true.
 * Genuine product surface (AdminTourGuides). Soft status transitions only.
 */

export const TOUR_GUIDE_STATUS = [
  "none",
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;

export type TourGuideStatus = (typeof TOUR_GUIDE_STATUS)[number];

export const TOUR_GUIDE_FIELDS = {
  isTourGuide: "is_tour_guide",
  status: "tour_guide_status",
  permitUrl: "tour_guide_permit_url",
  reviewedAt: "tour_guide_reviewed_at",
  rejectionReason: "tour_guide_rejection_reason",
} as const;

export type CanonicalTourGuideReadModel = {
  id: string;
  sourceDocumentId: string;
  displayName: string | null;
  emailHint: string | null;
  phoneHint: string | null;
  countryId: string | null;
  status: TourGuideStatus;
  isTourGuide: true;
  transportCompanyText: string | null;
  source: "legacy_user_tour_guide";
  warnings: string[];
};

export type TourGuideWriteAction =
  | "approve"
  | "reject"
  | "suspend"
  | "reactivate";

export function parseTourGuideStatus(raw: unknown): TourGuideStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if ((TOUR_GUIDE_STATUS as readonly string[]).includes(s)) {
    return s as TourGuideStatus;
  }
  return "none";
}

export function isTourGuideUser(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return data[TOUR_GUIDE_FIELDS.isTourGuide] === true;
}
