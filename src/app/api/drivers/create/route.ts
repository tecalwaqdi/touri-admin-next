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
import {
  createWifWritePortOrThrow,
  FakeProductionFirestoreWritePort,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { resolveWritePrincipal } from "@/infrastructure/production/writes/ProductionWritePrincipals";

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
      transportCompanyId?: string | null;
    };

    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-driver-create-${ctx.user.id}`);

    let writePort = null as
      | ReturnType<typeof createWifWritePortOrThrow>
      | FakeProductionFirestoreWritePort
      | null;
    if (env.DRIVER_WRITE_ENABLED) {
      const principal = resolveWritePrincipal("ops_writer");
      if (principal.ready) {
        try {
          writePort = createWifWritePortOrThrow("ops_writer");
        } catch {
          writePort = null;
        }
      }
      // Development / armed without WIF: Fake port still records the apply shape.
      if (!writePort && env.APP_ENV !== "production") {
        writePort = new FakeProductionFirestoreWritePort();
      }
    }

    const result = await executeDriverCreate(
      {
        actorUid: ctx.user.id,
        displayName: body.displayName ?? "",
        phoneE164: body.phoneE164 ?? "",
        countryId: body.countryId ?? "",
        regionId: body.regionId,
        vehicleTypeId: body.vehicleTypeId,
        freeTextVehicleType: body.freeTextVehicleType,
        transportCompanyId: body.transportCompanyId,
        idempotencyKey,
        correlationId: ctx.correlationId,
      },
      {
        allowOfflineExecution: false,
        driverWriteEnabled: env.DRIVER_WRITE_ENABLED,
        writePort,
        actorRole: ctx.user.role,
        actorTransportCompanyIds: ctx.user.scope.transportCompanyIds ?? [],
      },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        {
          status:
            result.code === "PRODUCTION_WRITE_DISABLED"
              ? 503
              : result.code === "SCOPE_DENIED"
                ? 403
                : 400,
        },
      );
    }

    return jsonWithIds(
      {
        ...result,
        writeGate: "DRIVER_WRITE_ENABLED",
        productionArmed: env.DRIVER_WRITE_ENABLED,
      },
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
