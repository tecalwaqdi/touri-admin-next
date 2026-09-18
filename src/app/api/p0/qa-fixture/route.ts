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
import { ensureP0QaFixture } from "@/application/controlled-writes/pilot/PilotQaFixtureProvision";
import { qaResourceId } from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import type { P0WriteDomain } from "@/application/controlled-writes/P0WriteGates";
import { randomUUID } from "node:crypto";

const DOMAINS: P0WriteDomain[] = [
  "vehicle_catalog",
  "partner",
  "fleet",
  "guide",
];

/** POST /api/p0/qa-fixture — synthetic P0 master-data ensure. */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const env = getEnv();
    const body = (await request.json().catch(() => ({}))) as {
      domain?: P0WriteDomain;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    };

    const domain = (body.domain || "vehicle_catalog") as P0WriteDomain;
    if (!DOMAINS.includes(domain)) {
      return Response.json(
        {
          error: "domain must be vehicle_catalog|partner|fleet|guide",
          code: "VALIDATION_FAILED",
        },
        { status: 400 },
      );
    }

    const resourceId = String(
      body.resourceId ||
        qaResourceId(
          domain === "vehicle_catalog" ? "vehicle" : domain,
          `pilot_${randomUUID().slice(0, 8)}`,
        ),
    ).trim();

    const result = await ensureP0QaFixture({
      domain,
      resourceId,
      metadata: body.metadata,
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
        VEHICLE_CATALOG_WRITE_ENABLED: env.VEHICLE_CATALOG_WRITE_ENABLED,
        PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
        FLEET_WRITE_ENABLED: env.FLEET_WRITE_ENABLED,
        GUIDE_WRITE_ENABLED: env.GUIDE_WRITE_ENABLED,
        GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
        FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
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
