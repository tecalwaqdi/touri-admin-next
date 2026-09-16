/**
 * Map Legacy `transport_company/{id}` → CanonicalTransportCompanyReadModel.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import type {
  CanonicalTransportCompanyReadModel,
  FleetActiveStatus,
} from "@/domain/fleet/TransportCompanyMaster";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function activeFrom(data: Record<string, unknown>): FleetActiveStatus {
  if (typeof data.actev === "boolean") return data.actev ? "active" : "inactive";
  return "unknown";
}

export function mapTransportCompanyFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
}): CanonicalTransportCompanyReadModel {
  const warnings: string[] = [];
  const displayName = str(input.data.naim);
  if (!displayName) warnings.push("missing_fleet_name");

  return {
    id: input.documentId,
    sourceDocumentId: input.documentId,
    displayName,
    licenseNumber: str(input.data.license_number),
    countryId: extractLegacyDocRefId(input.data.Rev_dolh),
    countryText: str(input.data.dolh_text),
    phone: str(input.data.phone),
    email: str(input.data.email),
    activeStatus: activeFrom(input.data),
    ownerUserId: extractLegacyDocRefId(input.data.owner_user),
    source: "legacy_transport_company",
    warnings,
  };
}
