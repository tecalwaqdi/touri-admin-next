import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { resolveLandmarkImagePath } from "@/domain/storage/LandmarkImageReference";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";

export async function readLandmarkImage(
  input: {
    landmarkId: string;
    slot: string;
    bucket: string;
    scope: AccessScope;
  },
  deps: {
    client: FirestoreReadClient;
    documents: DriverDocumentRepository;
  },
) {
  if (!input.landmarkId || /[\\/\u0000]/.test(input.landmarkId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const doc = await deps.client.getDocument("mkan", input.landmarkId);
  if (!doc.exists || !doc.data) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }
  const d = doc.data;
  assertDetailResourceInScope(input.scope, {
    countryId: extractLegacyDocRefId(d.Rev_dolh ?? d.country_id ?? d.countryId),
    cityId: extractLegacyDocRefId(d.mkan_vill ?? d.city_id ?? d.cityId),
    agentId: null,
  });
  const path = resolveLandmarkImagePath(
    d,
    input.landmarkId,
    input.slot,
    input.bucket,
  );
  return deps.documents.read(path);
}
