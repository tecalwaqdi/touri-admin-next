/** Resolve city image Storage path from villages.img; never accept client paths. */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { classifyLandmarkImageUrlKind } from "@/domain/geography/LandmarkImageSummary";
import { resolveFirebaseStorageObjectPath } from "@/domain/storage/FirebaseStorageUrlReference";

export function resolveCityImagePath(
  data: Record<string, unknown>,
  cityId: string,
  slot: string,
  bucket: string,
): string {
  if (!cityId || /[\\/\u0000]/.test(cityId)) {
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
