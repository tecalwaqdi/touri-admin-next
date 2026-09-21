/**
 * Safe city image metadata only (Legacy villages.img).
 * Never expose signed URLs, Storage credentials, or binary payloads.
 */

import {
  classifyLandmarkImageUrlKind,
  type LandmarkStorageKind,
} from "@/domain/geography/LandmarkImageSummary";

export type CityImageSummary = {
  hasImage: boolean;
  imageCount: number | null;
  storageKind: LandmarkStorageKind;
};

function nonEmptyUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Summarize Legacy villages `img` — single cover slot. */
export function summarizeCityImage(
  data: Record<string, unknown> | null | undefined,
): CityImageSummary {
  if (data == null || typeof data !== "object") {
    return { hasImage: false, imageCount: 0, storageKind: "unknown" };
  }
  const img = nonEmptyUrl(data.img);
  if (!img) {
    return { hasImage: false, imageCount: 0, storageKind: "unknown" };
  }
  return {
    hasImage: true,
    imageCount: 1,
    storageKind: classifyLandmarkImageUrlKind(img),
  };
}

/**
 * Admin thumbnail only — https non-Storage URL when present.
 * Firebase Storage URLs are NEVER returned (use secure proxy).
 */
export function extractCityImagePreviewUrl(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (data == null || typeof data !== "object") return null;
  const img = nonEmptyUrl(data.img);
  if (!img) return null;
  const kind = classifyLandmarkImageUrlKind(img);
  if (kind === "firebase_storage") return null;
  const lower = img.toLowerCase();
  if (lower.startsWith("https://") && kind === "http_url") return img;
  return null;
}
