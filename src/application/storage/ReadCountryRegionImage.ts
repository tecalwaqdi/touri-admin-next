import type { AccessScope } from "@/types/roles";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
import {
  resolveCountryImagePath,
  resolveRegionImagePath,
} from "@/domain/storage/CountryRegionImageReference";
import { assertDetailResourceInScope } from "@/application/production-read/detailScope";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";

export async function readCountryImage(
  input: {
    countryId: string;
    slot: string;
    bucket: string;
    scope: AccessScope;
  },
  deps: {
    client: FirestoreReadClient;
    documents: DriverDocumentRepository;
  },
) {
  if (!input.countryId || /[\\/\u0000]/.test(input.countryId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const doc = await deps.client.getDocument("countries", input.countryId);
  if (!doc.exists || !doc.data) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }
  assertDetailResourceInScope(input.scope, {
    countryId: input.countryId,
    cityId: null,
    agentId: null,
  });
  const path = resolveCountryImagePath(
    doc.data,
    input.countryId,
    input.slot,
    input.bucket,
  );
  return deps.documents.read(path);
}

export async function readRegionImage(
  input: {
    regionId: string;
    slot: string;
    bucket: string;
    scope: AccessScope;
  },
  deps: {
    client: FirestoreReadClient;
    documents: DriverDocumentRepository;
  },
) {
  if (!input.regionId || /[\\/\u0000]/.test(input.regionId)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  const doc = await deps.client.getDocument("cities", input.regionId);
  if (!doc.exists || !doc.data) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }
  const d = doc.data;
  assertDetailResourceInScope(input.scope, {
    countryId: extractLegacyDocRefId(d.dolh ?? d.country_id ?? d.countryId),
    cityId: null,
    agentId: null,
  });
  const path = resolveRegionImagePath(
    d,
    input.regionId,
    input.slot,
    input.bucket,
  );
  return deps.documents.read(path);
}
