/** Resolve landmark image Storage paths; never accept client-supplied URLs. */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { classifyLandmarkImageUrlKind } from "@/domain/geography/LandmarkImageSummary";

export function resolveLandmarkImagePath(
  data: Record<string, unknown>,
  landmarkId: string,
  slot: string,
  bucket: string,
): string {
  if (!landmarkId || /[\\/\u0000]/.test(landmarkId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const index = slot === "0" || slot === "img1" || slot === "cover" ? 0
    : slot === "1" || slot === "img2" ? 1
    : slot === "2" || slot === "img3" ? 2
    : -1;
  if (index < 0) throw new DriverDocumentError("VALIDATION_FAILED", 400);

  const candidates = [
    index === 0 ? (data.img1 ?? data.img) : null,
    index === 1 ? data.img2 : null,
    index === 2 ? data.img3 : null,
  ];
  const raw = candidates[index];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }
  const value = raw.trim();
  const kind = classifyLandmarkImageUrlKind(value);
  if (kind !== "firebase_storage") {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }

  let path = value;
  if (value.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    const prefix = `/v0/b/${bucket}/o/`;
    if (
      url.hostname !== "firebasestorage.googleapis.com" ||
      url.port ||
      url.username ||
      !url.pathname.startsWith(prefix)
    ) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    try {
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
  } else if (value.startsWith("gs://")) {
    if (!value.startsWith(`gs://${bucket}/`)) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    path = value.slice(`gs://${bucket}/`.length);
  } else {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }

  if (
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\\\u0000-\u001f]/.test(path)
  ) {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }
  return path;
}
