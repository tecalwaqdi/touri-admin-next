/**
 * Map Legacy `user/{id}` tour-guide persona → CanonicalTourGuideReadModel.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import {
  isTourGuideUser,
  parseTourGuideStatus,
  type CanonicalTourGuideReadModel,
} from "@/domain/guides/TourGuideMaster";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function maskHint(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.includes("@")) {
    const [u, d] = raw.split("@");
    if (!d) return "***";
    return `${(u ?? "").slice(0, 1)}***@${d}`;
  }
  if (raw.length <= 4) return "*".repeat(raw.length);
  return `${raw.slice(0, 2)}***${raw.slice(-2)}`;
}

export function mapTourGuideFromLegacyUser(input: {
  documentId: string;
  data: Record<string, unknown>;
}): CanonicalTourGuideReadModel | null {
  if (!isTourGuideUser(input.data)) return null;
  const warnings: string[] = [];
  const displayName =
    str(input.data.display_name) ??
    str(input.data.DisplayName) ??
    str(input.data.naim);
  if (!displayName) warnings.push("missing_guide_name");

  return {
    id: input.documentId,
    sourceDocumentId: input.documentId,
    displayName,
    emailHint: maskHint(str(input.data.email)),
    phoneHint: maskHint(str(input.data.phone_number) ?? str(input.data.phone)),
    countryId:
      extractLegacyDocRefId(input.data.Rev_dolh) ??
      extractLegacyDocRefId(input.data.rev_dolh),
    status: parseTourGuideStatus(input.data.tour_guide_status),
    isTourGuide: true,
    transportCompanyText: str(input.data.transport_company_text),
    source: "legacy_user_tour_guide",
    warnings,
  };
}
