import {
  resolveApiActor,
  requirePermission,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { boundsFromNominatimBoundingBox } from "@/domain/geography/GeoBounds";
import { COUNTRY_CANONICAL_TABLE } from "@/domain/geography/CountryCanonicalization";

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  boundingbox?: string[];
  type?: string;
  class?: string;
  addresstype?: string;
};

type GeocodeItem = {
  lat: number;
  lng: number;
  label: string;
  bounds: {
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  } | null;
  kind: string | null;
};

function mapHits(raw: NominatimHit[], fallbackLabel: string): GeocodeItem[] {
  return (Array.isArray(raw) ? raw : [])
    .map((h) => {
      const lat = Number(h.lat);
      const lng = Number(h.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const bounds = boundsFromNominatimBoundingBox(h.boundingbox);
      return {
        lat,
        lng,
        label:
          typeof h.display_name === "string" ? h.display_name : fallbackLabel,
        bounds: bounds
          ? {
              swLat: bounds.sw.lat,
              swLng: bounds.sw.lng,
              neLat: bounds.ne.lat,
              neLng: bounds.ne.lng,
            }
          : null,
        kind:
          h.addresstype === "country" || h.type === "administrative"
            ? "country"
            : (h.type ?? h.class ?? null),
      };
    })
    .filter((x): x is GeocodeItem => x != null);
}

/**
 * Place-name / ISO country search via OSM Nominatim (server-side proxy).
 * Returns lat/lng (+ optional bounding box) — never writes Firestore.
 * - `q` place search
 * - `iso=SA` (+ optional q) → country-level bounds (Legacy AdminCountryGeoService parity)
 * - `featureType=country` prefers country hits
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:read");

    const { searchParams } = new URL(request.url);
    const qRaw = (searchParams.get("q") ?? "").trim();
    const isoRaw = (searchParams.get("iso") ?? "").trim().toUpperCase();
    const iso = /^[A-Z]{2}$/.test(isoRaw) ? isoRaw : "";
    const featureType = (searchParams.get("featureType") ?? "").trim();

    const tableName = iso
      ? (COUNTRY_CANONICAL_TABLE.find((r) => r.iso2 === iso)?.name ?? null)
      : null;
    const q = qRaw || tableName || iso;

    if (!q || q.length < 2 || q.length > 200) {
      return Response.json(
        {
          error: "q or iso required (ISO-2 or 2–200 char query)",
          code: "VALIDATION_FAILED",
        },
        { status: 400 },
      );
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set(
      "limit",
      featureType === "country" || iso ? "8" : "5",
    );
    if (featureType === "country" || iso) {
      url.searchParams.set("featureType", "country");
    }
    if (iso) {
      url.searchParams.set("countrycodes", iso.toLowerCase());
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TouriAdminNext/1.0 (geography place search)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return Response.json(
        { error: "Geocode upstream failed", code: "GEOCODE_UNAVAILABLE" },
        { status: 503 },
      );
    }
    const raw = (await res.json()) as NominatimHit[];
    const items = mapHits(raw, q);

    return jsonWithIds({ items, iso: iso || null }, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
