/**
 * Vehicle master catalog — Legacy `type_car` SoT.
 * Distinct from driver-embedded vehicle fields (NameCar / ModelCar / mndob_type_car).
 */

export type VehicleTypeActiveStatus = "active" | "inactive" | "unknown";

export type CanonicalVehicleTypeReadModel = {
  id: string;
  sourceDocumentId: string;
  displayName: string | null;
  displayNameAr: string | null;
  displayNameEn: string | null;
  codeCar: string | null;
  /** Hourly rate field `sr` — display only; no client-side pricing calc. */
  hourlyRateSr: number | null;
  activeStatus: VehicleTypeActiveStatus;
  countryId: string | null;
  countryIso2: string | null;
  passengers: number | null;
  luggage: number | null;
  sortOrder: number | null;
  description: string | null;
  source: "legacy_type_car";
  warnings: string[];
};

/** Allowlisted create/update fields — never arbitrary patch. */
export const VEHICLE_TYPE_METADATA_ALLOWLIST = [
  "naim",
  "names_i18n",
  "sr",
  "actev",
  "acctev",
  "codeCar",
  "osf",
  "osf_i18n",
  "sort_order",
  "num_trteb",
  "passengers",
  "luggage",
  "icon",
  "country_iso2",
  "agl_saat",
  "NesbahkKsm",
  "TotalKsmUb",
  "not",
] as const;

/**
 * Driver forms: prefer canonical type_car id; keep free-text compatibility
 * via text_type_car_mndob when no master match.
 */
export type DriverVehicleTypeSelection = {
  typeCarId: string | null;
  freeTextLabel: string | null;
  selectionMode: "canonical" | "free_text" | "unset";
};

export function resolveDriverVehicleTypeSelection(input: {
  typeCarId?: string | null;
  freeTextLabel?: string | null;
}): DriverVehicleTypeSelection {
  const id = input.typeCarId?.trim() || null;
  const free = input.freeTextLabel?.trim() || null;
  if (id) {
    return { typeCarId: id, freeTextLabel: free, selectionMode: "canonical" };
  }
  if (free) {
    return { typeCarId: null, freeTextLabel: free, selectionMode: "free_text" };
  }
  return { typeCarId: null, freeTextLabel: null, selectionMode: "unset" };
}
