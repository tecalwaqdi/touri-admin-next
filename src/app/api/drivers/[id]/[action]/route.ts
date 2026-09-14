import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getDriverWriteService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import type { DriverWriteApiAction } from "@/application/drivers/DriverWriteApiService";
import type { ProvenDriverRegistrationState } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { createIdempotencyKey } from "@/lib/ids";

const ALLOWED: DriverWriteApiAction[] = [
  "approve",
  "reject",
  "needs_changes",
  "suspend",
];

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
      return 403;
    case "SCOPE_DENIED":
      return 403;
    case "DRIVER_NOT_FOUND":
      return 404;
    case "INVALID_DRIVER_STATE_TRANSITION":
    case "PRECONDITION_FAILED":
    case "DRIVER_HAS_ACTIVE_TRIP":
    case "DRIVER_NOT_READY_FOR_APPROVAL":
    case "IDEMPOTENCY_CONFLICT":
    case "REASON_REQUIRED":
    case "VALIDATION_FAILED":
      return 409;
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
      return 503;
    default:
      return 400;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, action } = await context.params;
  if (!ALLOWED.includes(action as DriverWriteApiAction)) {
    return Response.json({ error: "Unknown action", code: "VALIDATION_FAILED" }, { status: 404 });
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:approve");

    const body = (await request.json().catch(() => ({}))) as {
      expectedCurrentState?: ProvenDriverRegistrationState;
      reasonCode?: string;
      note?: string;
    };

    if (!body.expectedCurrentState) {
      return Response.json(
        {
          error: "expectedCurrentState is required",
          code: "VALIDATION_FAILED",
        },
        {
          status: 400,
          headers: {
            "x-correlation-id": ctx.correlationId,
            "x-request-id": ctx.requestId,
          },
        },
      );
    }

    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-driver-${action}-${id}`);

    const outcome = await getDriverWriteService().execute(ctx.user, {
      action: action as DriverWriteApiAction,
      driverId: id,
      expectedCurrentState: body.expectedCurrentState,
      reasonCode: body.reasonCode,
      note: body.note,
      idempotencyKey,
      correlationId: ctx.correlationId,
    });

    if (!outcome.ok) {
      const code = outcome.result.code ?? "INTERNAL_WRITE_FAILURE";
      return Response.json(
        {
          error: outcome.result.message,
          code,
          action,
          driverId: id,
        },
        {
          status: statusForCode(code),
          headers: {
            "x-correlation-id": ctx.correlationId,
            "x-request-id": ctx.requestId,
          },
        },
      );
    }

    return jsonWithIds(
      {
        ...outcome.driver,
        write: {
          status: outcome.result.status,
          action: outcome.result.action,
          fromState: outcome.result.fromState,
          toState: outcome.result.toState,
          auditIntentId: outcome.result.auditIntentId,
          auditResultId: outcome.result.auditResultId,
        },
      },
      ctx,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    return Response.json({ error: sanitizeErrorMessage(error) }, { status: 500 });
  }
}
