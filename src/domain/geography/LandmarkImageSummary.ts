/**
 * Phase 4A-3 — safe landmark image metadata only.
 * Never expose signed URLs, Storage credentials, or binary payloads.
 *
 * Legacy stores cover+gallery as string fields: img1 (+ legacy `img` fallback),
 * img2, img3. Values may be Firebase Storage download URLs, https://, or
 * commons:// pseudo-URLs from geo_import.
 */

export type LandmarkStorageKind =
  | "firebase_storage"
  | "http_url"
  | "mixed"
  | "unknown";

export type LandmarkImageSummary = {
  hasImage: boolean;
  /** Count of non-empty image slots when countable; null if unknown. */
  imageCount: number | null;
  storageKind: LandmarkStorageKind;
};

function nonEmptyUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Classify a single Legacy image string without returning the URL.
 */
export function classifyLandmarkImageUrlKind(
  url: string,
): Exclude<LandmarkStorageKind, "mixed"> {
  const u = url.trim().toLowerCase();
  if (!u) return "unknown";
  if (
    u.includes("firebasestorage.googleapis.com") ||
    u.includes("firebasestorage.app") ||
    u.startsWith("gs://")
  ) {
    return "firebase_storage";
  }
  if (
    u.startsWith("http://") ||
    u.startsWith("https://") ||
    u.startsWith("commons://")
  ) {
    return "http_url";
  }
  return "unknown";
}

/**
 * Summarize Legacy mkan image fields. Prefers img1; falls back to legacy `img`
 * when img1 empty (Admin/Customer dual-read). Does not copy or return URLs.
 */
export function summarizeLandmarkImages(
  data: Record<string, unknown> | null | undefined,
): LandmarkImageSummary {
  if (data == null || typeof data !== "object") {
    return { hasImage: false, imageCount: 0, storageKind: "unknown" };
  }

  const img1 = nonEmptyUrl(data.img1) ?? nonEmptyUrl(data.img);
  const img2 = nonEmptyUrl(data.img2);
  const img3 = nonEmptyUrl(data.img3);
  const slots = [img1, img2, img3].filter((x): x is string => x != null);

  if (slots.length === 0) {
    return { hasImage: false, imageCount: 0, storageKind: "unknown" };
  }

  const kinds = new Set(slots.map(classifyLandmarkImageUrlKind));
  let storageKind: LandmarkStorageKind;
  if (kinds.size === 1) {
    storageKind = [...kinds][0]!;
  } else if (
    kinds.has("firebase_storage") &&
    (kinds.has("http_url") || kinds.has("unknown"))
  ) {
    storageKind = "mixed";
  } else if (kinds.has("http_url") && kinds.has("unknown")) {
    storageKind = "mixed";
  } else {
    storageKind = "mixed";
  }

  return {
    hasImage: true,
    imageCount: slots.length,
    storageKind,
  };
}

/**
 * Admin detail thumbnail only — returns first non-Storage https URL when present.
 * Firebase Storage download URLs are NEVER returned (use secure proxy instead).
 * Never invents signed URLs; never returns gs:// or commons://.
 */
export function extractLandmarkImagePreviewUrl(
  data: Record<string, unknown> | null | undefined,
): string | null {
  if (data == null || typeof data !== "object") return null;
  const slots = [
    nonEmptyUrl(data.img1) ?? nonEmptyUrl(data.img),
    nonEmptyUrl(data.img2),
    nonEmptyUrl(data.img3),
  ].filter((x): x is string => x != null);
  for (const url of slots) {
    const kind = classifyLandmarkImageUrlKind(url);
    if (kind === "firebase_storage") continue;
    const lower = url.toLowerCase();
    if (lower.startsWith("https://") && kind === "http_url") return url;
  }
  return null;
}
