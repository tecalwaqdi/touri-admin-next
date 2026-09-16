/**
 * Map Legacy `type_car/{id}` → CanonicalVehicleTypeReadModel.
 */

import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";
import type {
  CanonicalVehicleTypeReadModel,
  VehicleTypeActiveStatus,
} from "@/domain/vehicle-catalog/VehicleTypeMaster";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseI18n(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const t = str(v);
    if (t) out[k] = t;
  }
  return out;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function activeFrom(data: Record<string, unknown>): VehicleTypeActiveStatus {
  if (typeof data.actev === "boolean") return data.actev ? "active" : "inactive";
  if (typeof data.acctev === "boolean") return data.acctev ? "active" : "inactive";
  return "unknown";
}

export function mapVehicleTypeFromLegacyDoc(input: {
  documentId: string;
  data: Record<string, unknown>;
}): CanonicalVehicleTypeReadModel {
  const warnings: string[] = [];
  const names = parseI18n(input.data.names_i18n);
  const naim = str(input.data.naim);
  const displayNameAr = names.ar ?? names.AR ?? null;
  const displayNameEn = names.en ?? names.EN ?? null;
  const displayName = displayNameEn ?? displayNameAr ?? naim;
  if (!displayName) warnings.push("missing_vehicle_type_name");

  return {
    id: input.documentId,
    sourceDocumentId: input.documentId,
    displayName,
    displayNameAr,
    displayNameEn,
    codeCar: str(input.data.codeCar),
    hourlyRateSr: num(input.data.sr),
    activeStatus: activeFrom(input.data),
    countryId: extractLegacyDocRefId(input.data.dolh),
    countryIso2: str(input.data.country_iso2),
    passengers: num(input.data.passengers ?? input.data.passenger_capacity),
    luggage: num(input.data.luggage ?? input.data.luggage_capacity),
    sortOrder: num(input.data.sort_order ?? input.data.num_trteb),
    description: str(input.data.osf),
    source: "legacy_type_car",
    warnings,
  };
}
