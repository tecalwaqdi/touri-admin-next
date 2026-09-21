/**
 * Parse pasted coordinates or Google Maps URLs into lat/lng.
 * Does not call external services — Nominatim search is separate.
 */

export type ParsedLocation = {
  lat: number;
  lng: number;
  source: "coords" | "google_maps_url";
};

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)
  );
}

/** Parse "lat,lng" / "lat lng" / "lat, lng". */
export function parseLatLngPair(raw: string): ParsedLocation | null {
  const t = raw.trim();
  if (!t) return null;
  const m = t.match(
    /^([+-]?\d+(?:\.\d+)?)\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)$/,
  );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng, source: "coords" };
}

/**
 * Extract lat/lng from common Google Maps URL shapes.
 * Does not follow short links (goo.gl) — paste full URL or coords.
 */
export function parseGoogleMapsUrl(raw: string): ParsedLocation | null {
  const t = raw.trim();
  if (!t) return null;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes("google.") &&
    host !== "maps.app.goo.gl" &&
    !host.endsWith("goo.gl")
  ) {
    return null;
  }

  // /@lat,lng,zoom
  const at = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (isValidCoord(lat, lng)) {
      return { lat, lng, source: "google_maps_url" };
    }
  }

  // ?q=lat,lng or ?query=lat,lng
  for (const key of ["q", "query", "ll", "center"]) {
    const v = url.searchParams.get(key);
    if (!v) continue;
    const pair = parseLatLngPair(decodeURIComponent(v));
    if (pair) return { ...pair, source: "google_maps_url" };
    // place name in q — not coords; ignore here
  }

  // !3dLAT!4dLNG (data=... fragments)
  const bang = t.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (bang) {
    const lat = Number(bang[1]);
    const lng = Number(bang[2]);
    if (isValidCoord(lat, lng)) {
      return { lat, lng, source: "google_maps_url" };
    }
  }

  return null;
}

/** Try coords first, then Google Maps URL. */
export function parseLocationPaste(raw: string): ParsedLocation | null {
  return parseLatLngPair(raw) ?? parseGoogleMapsUrl(raw);
}
