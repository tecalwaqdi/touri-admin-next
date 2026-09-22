/** Resolve landmark image Storage paths; never accept client-supplied URLs. */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { classifyLandmarkImageUrlKind } from "@/domain/geography/LandmarkImageSummary";
import { resolveFirebaseStorageObjectPath } from "@/domain/storage/FirebaseStorageUrlReference";

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

  return resolveFirebaseStorageObjectPath(value, bucket);
}
