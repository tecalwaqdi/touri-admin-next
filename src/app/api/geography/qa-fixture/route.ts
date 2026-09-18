import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getEnv } from "@/config/env";
import {
  ensureGeographyQaFixture,
  type GeographyQaResource,
} from "@/application/controlled-writes/pilot/PilotQaFixtureProvision";
import { qaResourceId } from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import { randomUUID } from "node:crypto";

/** POST /api/geography/qa-fixture — synthetic geography ensure (region/city/landmark). */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const env = getEnv();
    const body = (await request.json().catch(() => ({}))) as {
      resource?: GeographyQaResource;
      resourceId?: string;
      countryId?: string;
      regionId?: string;
      cityId?: string;
      displayNameEn?: string;
    };

    const resource = (body.resource || "landmark") as GeographyQaResource;
    if (!["region", "city", "landmark"].includes(resource)) {
      return Response.json(
        { error: "resource must be region|city|landmark", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const resourceId = String(
      body.resourceId ||
        qaResourceId(resource, `pilot_${randomUUID().slice(0, 8)}`),
    ).trim();

    const result = await ensureGeographyQaFixture({
      resource,
      resourceId,
      countryId: String(body.countryId || "saudi_arabia").trim(),
      regionId: body.regionId,
      cityId: body.cityId,
      displayNameEn: body.displayNameEn,
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
        REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
      },
    });

    return jsonWithIds({ ok: true, synthetic: true, qaFixture: true, ...result }, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "INTERNAL_WRITE_FAILURE";
    const status =
      code === "PRODUCTION_WRITE_DISABLED" || code === "RESOURCE_WRITE_DISABLED"
        ? 503
        : code === "VALIDATION_FAILED"
          ? 409
          : 500;
    return Response.json(
      { error: sanitizeErrorMessage(error), code, ok: false },
      { status },
    );
  }
}
