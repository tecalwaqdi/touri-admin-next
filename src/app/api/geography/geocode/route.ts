import {
  resolveApiActor,
  requirePermission,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

/**
 * Place-name search via OSM Nominatim (server-side proxy).
 * Returns lat/lng candidates — never writes Firestore.
 */
export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:read");

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 200) {
      return Response.json(
        { error: "q required (2–200 chars)", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");

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
    const items = (Array.isArray(raw) ? raw : [])
      .map((h) => {
        const lat = Number(h.lat);
        const lng = Number(h.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          lat,
          lng,
          label: typeof h.display_name === "string" ? h.display_name : q,
        };
      })
      .filter((x): x is { lat: number; lng: number; label: string } => x != null);

    return jsonWithIds({ items }, ctx);
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
