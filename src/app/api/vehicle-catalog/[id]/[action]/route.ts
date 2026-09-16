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
import { createIdempotencyKey } from "@/lib/ids";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import {
  DisabledP0MasterWriteRepository,
  FakeP0MasterWriteRepository,
  executeP0MasterControlledWrite,
  type P0MasterWriteAction,
} from "@/application/controlled-writes/P0MasterControlledWriteService";
import type { P0WriteDomain } from "@/application/controlled-writes/P0WriteGates";

const ACTIONS: P0MasterWriteAction[] = [
  "create",
  "update_metadata",
  "activate",
  "deactivate",
  "archive",
];

const offline = new FakeP0MasterWriteRepository();

/**
 * POST /api/vehicle-catalog/[id]/[action]
 * Gated type_car master writes — Production default denied.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, action } = await context.params;
  if (!ACTIONS.includes(action as P0MasterWriteAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const env = getEnv();
    const flags = {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
      VEHICLE_CATALOG_WRITE_ENABLED: env.VEHICLE_CATALOG_WRITE_ENABLED,
      PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
      FLEET_WRITE_ENABLED: env.FLEET_WRITE_ENABLED,
      GUIDE_WRITE_ENABLED: env.GUIDE_WRITE_ENABLED,
      GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
      FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    };

    const body = (await request.json().catch(() => ({}))) as {
      preconditionToken?: string;
      metadata?: Record<string, string | number | boolean | null>;
      reasonCode?: string;
      note?: string;
    };

    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const domain: P0WriteDomain = "vehicle_catalog";
    const repository = allowOffline
      ? offline
      : new DisabledP0MasterWriteRepository(domain, flags);

    const result = await executeP0MasterControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        domain,
        resourceId: id,
        action: action as P0MasterWriteAction,
        preconditionToken: body.preconditionToken ?? "unknown",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() || createIdempotencyKey(),
        correlationId: ctx.correlationId,
        metadata: body.metadata,
        reasonCode: body.reasonCode ?? "operational",
        note: body.note,
      },
      { flags, repository, allowOfflineExecution: allowOffline },
    );

    return jsonWithIds(result, ctx, {
      status: result.ok
        ? 200
        : result.code === "PRODUCTION_WRITE_DISABLED"
          ? 403
          : 409,
    });
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
