/**
 * Legacy country / agent operational bounding box (SW–NE corners).
 * Stored as GeoPoints: countries.bounds_sw|bounds_ne|geo_center,
 * agents.agent_bounds_sw|agent_bounds_ne|agent_geo_center.
 */

export type GeoLatLng = { lat: number; lng: number };

export type GeoBoundsBox = {
  sw: GeoLatLng;
  ne: GeoLatLng;
};

export type GeoBoundsWithCenter = GeoBoundsBox & {
  center: GeoLatLng;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function isValidGeoLatLng(lat: number | null, lng: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

/** Extract LatLng from GeoPoint / {lat,lng} / Flutter LatLng shapes. */
export function extractGeoLatLng(raw: unknown): GeoLatLng | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = num(o.latitude ?? o._latitude ?? o.lat);
  const lng = num(o.longitude ?? o._longitude ?? o.lng ?? o.lon);
  if (!isValidGeoLatLng(lat, lng)) return null;
  return { lat: lat!, lng: lng! };
}

/**
 * Nominatim boundingbox = [south, north, west, east] (strings or numbers).
 */
export function boundsFromNominatimBoundingBox(
  raw: unknown,
): GeoBoundsBox | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const south = num(raw[0]);
  const north = num(raw[1]);
  const west = num(raw[2]);
  const east = num(raw[3]);
  if (
    south == null ||
    north == null ||
    west == null ||
    east == null ||
    !isValidGeoLatLng(south, west) ||
    !isValidGeoLatLng(north, east)
  ) {
    return null;
  }
  if (south > north) return null;
  return {
    sw: { lat: south, lng: west },
    ne: { lat: north, lng: east },
  };
}

export function normalizeGeoBounds(input: {
  swLat?: number | null;
  swLng?: number | null;
  neLat?: number | null;
  neLng?: number | null;
}): GeoBoundsWithCenter | null {
  const swLat = input.swLat ?? null;
  const swLng = input.swLng ?? null;
  const neLat = input.neLat ?? null;
  const neLng = input.neLng ?? null;
  if (
    !isValidGeoLatLng(swLat, swLng) ||
    !isValidGeoLatLng(neLat, neLng)
  ) {
    return null;
  }
  const south = Math.min(swLat!, neLat!);
  const north = Math.max(swLat!, neLat!);
  const west = Math.min(swLng!, neLng!);
  const east = Math.max(swLng!, neLng!);
  if (south >= north) return null;
  // Allow antimeridian (west > east) only if span is non-zero — Legacy uses simple boxes.
  if (west === east) return null;
  return {
    sw: { lat: south, lng: west },
    ne: { lat: north, lng: east },
    center: {
      lat: (south + north) / 2,
      lng: (west + east) / 2,
    },
  };
}

/** Firestore GeoPoint shorthand for Production write port. */
export function toGeoPointValue(p: GeoLatLng): {
  latitude: number;
  longitude: number;
} {
  return { latitude: p.lat, longitude: p.lng };
}

export function extractCountryBoundsFromLegacyDoc(
  data: Record<string, unknown>,
): GeoBoundsWithCenter | null {
  const sw = extractGeoLatLng(data.bounds_sw);
  const ne = extractGeoLatLng(data.bounds_ne);
  if (!sw || !ne) return null;
  const normalized = normalizeGeoBounds({
    swLat: sw.lat,
    swLng: sw.lng,
    neLat: ne.lat,
    neLng: ne.lng,
  });
  if (!normalized) return null;
  const center = extractGeoLatLng(data.geo_center) ?? normalized.center;
  return { ...normalized, center };
}
