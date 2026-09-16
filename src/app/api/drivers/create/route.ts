import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { createIdempotencyKey } from "@/lib/ids";
import { getEnv } from "@/config/env";
import { executeDriverCreate } from "@/application/controlled-writes/drivers-create/DriverCreateService";

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:approve");

    const body = (await request.json().catch(() => ({}))) as {
      displayName?: string;
      phoneE164?: string;
      countryId?: string;
      regionId?: string | null;
      vehicleTypeId?: string | null;
      freeTextVehicleType?: string | null;
    };

    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-driver-create-${ctx.user.id}`);

    const result = executeDriverCreate(
      {
        actorUid: ctx.user.id,
        displayName: body.displayName ?? "",
        phoneE164: body.phoneE164 ?? "",
        countryId: body.countryId ?? "",
        regionId: body.regionId,
        vehicleTypeId: body.vehicleTypeId,
        freeTextVehicleType: body.freeTextVehicleType,
        idempotencyKey,
        correlationId: ctx.correlationId,
      },
      {
        allowOfflineExecution: false,
        driverWriteEnabled: env.DRIVER_WRITE_ENABLED,
      },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        {
          status:
            result.code === "PRODUCTION_WRITE_DISABLED" ? 503 : 400,
        },
      );
    }

    return jsonWithIds(
      { ...result, writeGate: "DRIVER_WRITE_ENABLED", productionArmed: false },
      ctx,
    );
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
