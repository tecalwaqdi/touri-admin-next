/** Resolve country/region image Storage path from Legacy `img`; never accept client paths. */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { classifyLandmarkImageUrlKind } from "@/domain/geography/LandmarkImageSummary";
import { resolveFirebaseStorageObjectPath } from "@/domain/storage/FirebaseStorageUrlReference";

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

  return resolveFirebaseStorageObjectPath(value, bucket);
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
