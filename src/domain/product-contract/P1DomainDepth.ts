/**
 * P1 domain depth contracts — vehicle / partners / fleet / guides.
 * Extends P0 surfaces with Legacy field parity without destructive migration.
 */

export type VehicleCatalogP1Fields = {
  classification: string | null;
  make: string | null;
  model: string | null;
  imageUrl: string | null;
  capacity: number | null;
  passengers: number | null;
  luggage: number | null;
  sortOrder: number | null;
  serviceCategory: string | null;
  countryIds: string[];
};

export function mapVehicleCatalogP1Fields(
  data: Record<string, unknown>,
): VehicleCatalogP1Fields {
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const countries = Array.isArray(data.countryIds)
    ? data.countryIds.filter((x): x is string => typeof x === "string")
    : [];
  return {
    classification: str(data.classification ?? data.class),
    make: str(data.make ?? data.brand),
    model: str(data.model),
    imageUrl: str(data.imageUrl ?? data.image ?? data.icon),
    capacity: num(data.capacity),
    passengers: num(data.passengers),
    luggage: num(data.luggage),
    sortOrder: num(data.sorting ?? data.sortOrder),
    serviceCategory: str(data.serviceCategory ?? data.category),
    countryIds: countries,
  };
}

export type PartnerP1Fields = {
  partnerKind: "hotel" | "airport" | "company" | "tourism" | "other" | null;
  contactName: string | null;
  contactPhone: string | null;
  countryId: string | null;
  regionId: string | null;
  cityId: string | null;
  agentId: string | null;
  active: boolean | null;
};

export function mapPartnerP1Fields(data: Record<string, unknown>): PartnerP1Fields {
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const kindRaw = str(data.partnerKind ?? data.kind ?? data.type)?.toLowerCase();
  let partnerKind: PartnerP1Fields["partnerKind"] = null;
  if (kindRaw?.includes("hotel")) partnerKind = "hotel";
  else if (kindRaw?.includes("airport")) partnerKind = "airport";
  else if (kindRaw?.includes("compan")) partnerKind = "company";
  else if (kindRaw?.includes("tour")) partnerKind = "tourism";
  else if (kindRaw) partnerKind = "other";

  const refId = (v: unknown) => {
    if (typeof v === "string" && v.trim()) {
      const parts = v.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? v.trim();
    }
    if (v && typeof v === "object" && "id" in (v as object)) {
      const id = (v as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    }
    return null;
  };

  return {
    partnerKind,
    contactName: str(data.contactName ?? data.contact),
    contactPhone: str(data.phone ?? data.contactPhone),
    countryId: refId(data.Rev_dolh ?? data.countryId),
    regionId: refId(data.regionId ?? data.cityRef),
    cityId: refId(data.villageId ?? data.cityId),
    agentId: refId(data.agentId),
    active:
      typeof data.acctev === "boolean"
        ? data.acctev
        : typeof data.actev === "boolean"
          ? data.actev
          : null,
  };
}

export type FleetP1Fields = {
  licenseNumber: string | null;
  countryId: string | null;
  regionId: string | null;
  contactPhone: string | null;
  vehicleCount: number | null;
  active: boolean | null;
};

export function mapFleetP1Fields(data: Record<string, unknown>): FleetP1Fields {
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const refId = (v: unknown) => {
    if (typeof v === "string" && v.trim()) {
      const parts = v.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? v.trim();
    }
    if (v && typeof v === "object" && "id" in (v as object)) {
      const id = (v as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    }
    return null;
  };
  return {
    licenseNumber: str(data.license_number ?? data.licenseNumber),
    countryId: refId(data.Rev_dolh ?? data.countryId),
    regionId: refId(data.regionId),
    contactPhone: str(data.phone),
    vehicleCount: num(data.vehicleCount ?? data.cars_count),
    active: typeof data.actev === "boolean" ? data.actev : null,
  };
}

export type GuideP1Fields = {
  status: string | null;
  countryId: string | null;
  regionId: string | null;
  cityId: string | null;
  services: string[];
  contactPhone: string | null;
};

export function mapGuideP1Fields(data: Record<string, unknown>): GuideP1Fields {
  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const refId = (v: unknown) => {
    if (typeof v === "string" && v.trim()) {
      const parts = v.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? v.trim();
    }
    if (v && typeof v === "object" && "id" in (v as object)) {
      const id = (v as { id?: unknown }).id;
      return typeof id === "string" ? id : null;
    }
    return null;
  };
  const services = Array.isArray(data.services)
    ? data.services.filter((x): x is string => typeof x === "string")
    : [];
  return {
    status: str(data.tour_guide_status ?? data.status),
    countryId: refId(data.countryId ?? data.Rev_dolh),
    regionId: refId(data.regionId),
    cityId: refId(data.cityId),
    services,
    contactPhone: str(data.phone),
  };
}

/** Partner bookings portal remains intentionally removed from Admin SoT. */
export const PARTNER_BOOKINGS_PORTAL = {
  status: "INTENTIONALLY_REMOVED" as const,
  reason: "Role-gated Legacy portal — not central admin SoT",
};
