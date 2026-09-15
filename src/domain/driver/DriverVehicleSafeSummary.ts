/**
 * Phase 4A-5 — Vehicle safe summary with plate masking.
 * `normalized_plate` is NOT proven as a safe operational read field on user docs
 * (AdminDriverPlate.normalize is write-side). Always mask plate for shadow read.
 */

export type DriverVehicleSafeSummary = {
  typeCarId: string | null;
  typeCarSourcePath: string | null;
  name: string | null;
  model: string | null;
  /** Masked plate — never full plate in default shadow. */
  plateMasked: string | null;
  platePresent: boolean;
  /** Always false in default shadow — normalized_plate not proven safe operational SoT. */
  normalizedPlateExposed: false;
  /** Presence only — never expose normalized plate value in shadow. */
  normalizedPlatePresent: boolean;
  classificationText: string | null;
  year: number | null;
  color: string | null;
  registrationLinkageId: string | null;
  vehicleReviewStatus: string | null;
  incomplete: boolean;
};

/** Allowlisted vehicle correction fields for controlled writes (server-normalized). */
export const DRIVER_VEHICLE_CORRECTION_ALLOWLIST = [
  "NameCar",
  "ModelCar",
  "number_lohh_car",
  "mndob_type_car",
  "text_type_car_mndob",
  "year_car",
  "color_car",
  "vehicle_review_status",
] as const;

function extractRef(
  value: unknown,
): { id: string | null; path: string | null } {
  if (value == null) return { id: null, path: null };
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return { id: null, path: null };
    const parts = t.split("/").filter(Boolean);
    return { id: parts[parts.length - 1] ?? null, path: t.includes("/") ? t : `type_car/${t}` };
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const id =
      typeof o.id === "string" && o.id.trim() ? o.id.trim() : null;
    const path =
      typeof o.path === "string" && o.path.trim() ? o.path.trim() : null;
    if (id || path) {
      return {
        id: id ?? (path ? path.split("/").filter(Boolean).pop()! : null),
        path,
      };
    }
  }
  return { id: null, path: null };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/**
 * Mask plate like phone: keep 2 head + 2 tail digits/chars when long enough.
 * Never returns full plate.
 */
export function maskPlate(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  if (!s) return null;
  const compact = s.replace(/[\s-]/g, "");
  if (compact.length <= 3) return "*".repeat(compact.length);
  if (compact.length <= 5) {
    return `${compact[0]}${"*".repeat(compact.length - 2)}${compact[compact.length - 1]}`;
  }
  const head = compact.slice(0, 2);
  const tail = compact.slice(-2);
  return `${head}${"*".repeat(Math.max(compact.length - 4, 3))}${tail}`;
}

export function buildDriverVehicleSafeSummary(
  data: Record<string, unknown>,
): DriverVehicleSafeSummary {
  const typeRef = extractRef(data.mndob_type_car ?? data.carRev_mndob ?? data.car_rev_mndob);
  const name = str(data.NameCar ?? data.nameCar);
  const model = str(data.ModelCar ?? data.modelCar);
  const plateRaw = str(data.number_lohh_car ?? data.plate ?? data.plateNumber);
  const classificationText = str(data.text_type_car_mndob);
  const yearRaw = data.year_car ?? data.yearCar ?? data.year;
  const year =
    typeof yearRaw === "number" && Number.isFinite(yearRaw)
      ? yearRaw
      : typeof yearRaw === "string" && /^\d{4}$/.test(yearRaw.trim())
        ? Number(yearRaw.trim())
        : null;
  const color = str(data.color_car ?? data.colorCar ?? data.color);
  const registrationLinkageId = extractRef(
    data.doc_vehicle_registration ?? data.vehicle_registration_ref,
  ).id;
  const vehicleReviewStatus = str(data.vehicle_review_status);
  const normalizedPlatePresent =
    str(data.normalized_plate) != null || str(data.normalizedPlate) != null;

  const incomplete =
    typeRef.id == null &&
    !name &&
    !model &&
    !plateRaw &&
    !classificationText;

  return {
    typeCarId: typeRef.id,
    typeCarSourcePath: typeRef.path,
    name,
    model,
    plateMasked: maskPlate(plateRaw),
    platePresent: plateRaw != null,
    normalizedPlateExposed: false,
    normalizedPlatePresent,
    classificationText,
    year,
    color,
    registrationLinkageId,
    vehicleReviewStatus,
    incomplete,
  };
}
