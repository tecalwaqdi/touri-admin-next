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
import { getTripWriteApiService } from "@/application/trips/TripWriteApiService";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import type { TripCancelReasonCode } from "@/application/controlled-writes/trips/TripWriteTypes";

const REASONS: readonly TripCancelReasonCode[] = [
  "operational",
  "customer_request",
  "safety",
  "no_driver",
  "payment_issue",
  "other",
];

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
      return 403;
    case "TRIP_NOT_FOUND":
      return 404;
    case "TRIP_ALREADY_TERMINAL":
    case "INVALID_TRIP_STATE_TRANSITION":
    case "PRECONDITION_FAILED":
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

/**
 * POST /api/trips/[id]/cancel — Admin cancel (controlled write).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id } = await context.params;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "trips:manage");

    const body = (await request.json().catch(() => ({}))) as {
      expectedLifecycleStatus?: TripLifecycleStatus;
      reasonCode?: TripCancelReasonCode;
      note?: string;
    };

    if (!body.expectedLifecycleStatus) {
      return Response.json(
        {
          error: "expectedLifecycleStatus is required",
          code: "VALIDATION_FAILED",
        },
        { status: 400 },
      );
    }
    if (!body.reasonCode || !REASONS.includes(body.reasonCode)) {
      return Response.json(
        { error: "reasonCode is required", code: "REASON_REQUIRED" },
        { status: 400 },
      );
    }

    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-trip-cancel-${id}`);

    const outcome = await getTripWriteApiService().cancel(ctx.user, {
      tripId: id,
      expectedLifecycleStatus: body.expectedLifecycleStatus,
      reasonCode: body.reasonCode,
      note: body.note,
      idempotencyKey,
      correlationId: ctx.correlationId,
    });

    if (!outcome.ok) {
      const code = outcome.code ?? "INTERNAL_WRITE_FAILURE";
      return Response.json(
        {
          error: outcome.message,
          code,
          tripId: id,
          productionWriteExecuted: false,
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
        ok: true,
        tripId: outcome.tripId,
        fromLifecycle: outcome.fromLifecycle,
        toLifecycle: outcome.toLifecycle,
        productionWriteExecuted: outcome.productionWriteExecuted,
        customerLockCleared: outcome.customerLockCleared,
        status: outcome.status,
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
      { error: sanitizeErrorMessage(error), code: "INTERNAL_WRITE_FAILURE" },
      { status: 500 },
    );
  }
}
