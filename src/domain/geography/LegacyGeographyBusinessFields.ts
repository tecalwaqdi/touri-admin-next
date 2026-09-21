/**
 * Extract Legacy business fields for city/landmark Admin forms.
 * Used at Production read → canonical enrichment (not invented defaults).
 */

import { summarizeCityImage } from "@/domain/geography/CityImageSummary";

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseI18n(
  raw: unknown,
): Record<string, string> | null {
  if (raw == null || typeof raw !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const t = str(v);
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? out : null;
}

function extractGeoPoint(
  raw: unknown,
): { latitude: number; longitude: number } | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = num(o.latitude ?? o._latitude ?? o.lat);
  const lng = num(o.longitude ?? o._longitude ?? o.lng ?? o.lon);
  if (
    lat == null ||
    lng == null ||
    !(Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)
  ) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

export type LandmarkLegacyBusinessFields = {
  descriptionAr: string | null;
  descriptionEn: string | null;
  category: string | null;
  address: string | null;
  isMosque: boolean | null;
  isFood: boolean | null;
  isRestroom: boolean | null;
  asAds: boolean | null;
  rate: number | null;
};

export function extractLandmarkLegacyBusinessFields(
  data: Record<string, unknown>,
): LandmarkLegacyBusinessFields {
  const osfI18n = parseI18n(data.osf_i18n);
  const osf = str(data.osf);
  return {
    descriptionAr: osfI18n?.ar ?? osf,
    descriptionEn: osfI18n?.en ?? null,
    category: str(data.tsnef) ?? str(data.category),
    address: str(data.address),
    isMosque: bool(data.ismsgd),
    isFood: bool(data.isfood),
    isRestroom: bool(data.ishmam),
    asAds: bool(data.as_ads),
    rate: num(data.rate),
  };
}

export type CityLegacyBusinessFields = {
  descriptionAr: string | null;
  descriptionEn: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  imagePresence: "present" | "missing";
  imageStorageKind: string | null;
};

export function extractCityLegacyBusinessFields(
  data: Record<string, unknown>,
): CityLegacyBusinessFields {
  const osfI18n = parseI18n(data.osf_i18n);
  const osf = str(data.osf);
  const imgSummary = summarizeCityImage(data);
  return {
    descriptionAr: osfI18n?.ar ?? osf,
    descriptionEn: osfI18n?.en ?? null,
    coordinates:
      extractGeoPoint(data.lat_ling) ??
      extractGeoPoint(data.Location) ??
      extractGeoPoint(data.location),
    imagePresence: imgSummary.hasImage ? "present" : "missing",
    imageStorageKind: imgSummary.hasImage ? imgSummary.storageKind : null,
  };
}
