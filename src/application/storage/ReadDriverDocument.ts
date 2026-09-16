import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import { DriverDocumentError, resolveDriverDocumentPath } from "@/domain/storage/DriverDocumentReference";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
export async function readDriverDocument(input: { driverId: string; slot: string; bucket: string; scope: AccessScope }, deps: { client: FirestoreReadClient; documents: DriverDocumentRepository }) {
  if (!input.driverId || /[\\/\u0000]/.test(input.driverId)) throw new DriverDocumentError("VALIDATION_FAILED", 400);
  const doc = await deps.client.getDocument("user", input.driverId);
  if (!doc.exists || !doc.data || (doc.data.ismndob !== true && doc.data.ismndom !== true)) throw new DriverDocumentError("NOT_FOUND", 404);
  const d = doc.data;
  assertDetailResourceInScope(input.scope, {
    countryId: extractLegacyDocRefId(d.Rev_dolh ?? d.country_id),
    cityId: extractLegacyDocRefId(d.mndob_vill),
    agentId: extractLegacyDocRefId(d.agentRef ?? d.agentId),
  });
  const path = resolveDriverDocumentPath(d, input.driverId, input.slot, input.bucket);
  return deps.documents.read(path);
}
