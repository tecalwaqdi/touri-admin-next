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
import { executeStorageControlledAction } from "@/domain/storage/StorageControlledWorkflows";

/** POST — replace/archive Legacy countries.img (gated; no real upload while hard-false). */
export async function POST(
  request: Request,
  context: { params: Promise<{ countryId: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const { countryId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: "replace_country_image" | "archive_country_image";
      slotOrIndex?: string;
      mimeType?: string;
      sizeBytes?: number;
      storagePath?: string;
    };

    const env = getEnv();
    const result = executeStorageControlledAction(
      {
        actorUid: ctx.user.id,
        action: body.action ?? "replace_country_image",
        kind: "country_image",
        ownerId: countryId,
        slotOrIndex: body.slotOrIndex ?? "0",
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        idempotencyKey:
          ctx.idempotencyKey ??
          request.headers.get("idempotency-key") ??
          createIdempotencyKey(`country-img-${countryId}`),
        correlationId: ctx.correlationId,
        clientStoragePath: body.storagePath,
      },
      {
        allowOfflineExecution: false,
        flags: {
          GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
          PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
          GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
          PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
          DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
        },
      },
    );

    if (!result.ok) {
      return Response.json(
        {
          error: result.message,
          code: result.code,
          realUploadPerformed: false,
        },
        {
          status: result.code === "PRODUCTION_WRITE_DISABLED" ? 503 : 400,
        },
      );
    }

    return jsonWithIds({ ...result, productionArmed: false }, ctx);
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
