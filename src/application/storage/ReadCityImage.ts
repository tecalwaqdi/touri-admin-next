import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import { resolveCityImagePath } from "@/domain/storage/CityImageReference";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";

export async function readCityImage(
  input: {
    cityId: string;
    slot: string;
    bucket: string;
    scope: AccessScope;
  },
  deps: {
    client: FirestoreReadClient;
    documents: DriverDocumentRepository;
  },
) {
  if (!input.cityId || /[\\/\u0000]/.test(input.cityId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const doc = await deps.client.getDocument("villages", input.cityId);
  if (!doc.exists || !doc.data) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }
  const d = doc.data;
  assertDetailResourceInScope(input.scope, {
    countryId: extractLegacyDocRefId(d.dolh ?? d.country_id ?? d.countryId),
    cityId: input.cityId,
    agentId: null,
  });
  const path = resolveCityImagePath(
    d,
    input.cityId,
    input.slot,
    input.bucket,
  );
  return deps.documents.read(path);
}
