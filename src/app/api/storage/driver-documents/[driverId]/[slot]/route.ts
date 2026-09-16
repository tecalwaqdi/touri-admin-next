import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  executeStorageControlledAction,
  type DriverDocumentSlot,
} from "@/domain/storage/StorageControlledWorkflows";
import { createIdempotencyKey } from "@/lib/ids";

export async function GET(
  request: Request,
  context: { params: Promise<{ driverId: string; slot: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:read");

    const { driverId, slot } = await context.params;
    const result = executeStorageControlledAction(
      {
        actorUid: ctx.user.id,
        action: "issue_preview_url",
        kind: "driver_document",
        ownerId: driverId,
        slotOrIndex: slot as DriverDocumentSlot,
        idempotencyKey:
          ctx.idempotencyKey ??
          createIdempotencyKey(`preview-${driverId}-${slot}`),
        correlationId: ctx.correlationId,
      },
      { allowOfflineExecution: true },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        { status: 400 },
      );
    }

    return jsonWithIds(
      {
        ...result,
        note: "Fake signed URL offline — Production Storage WIF not armed",
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
