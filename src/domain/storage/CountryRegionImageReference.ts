/** Resolve country/region image Storage path from Legacy `img`; never accept client paths. */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { classifyLandmarkImageUrlKind } from "@/domain/geography/LandmarkImageSummary";

function resolveImgFieldPath(
  data: Record<string, unknown>,
  ownerId: string,
  slot: string,
  bucket: string,
): string {
  if (!ownerId || /[\\/\u0000]/.test(ownerId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const index =
    slot === "0" || slot === "img" || slot === "cover" ? 0 : -1;
  if (index < 0) throw new DriverDocumentError("VALIDATION_FAILED", 400);

  const raw = data.img;
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

export function resolveCountryImagePath(
  data: Record<string, unknown>,
  countryId: string,
  slot: string,
  bucket: string,
): string {
  return resolveImgFieldPath(data, countryId, slot, bucket);
}

export function resolveRegionImagePath(
  data: Record<string, unknown>,
  regionId: string,
  slot: string,
  bucket: string,
): string {
  return resolveImgFieldPath(data, regionId, slot, bucket);
}
