import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getCustomerWriteApiService } from "@/application/customers/CustomerWriteApiService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import type { CustomerWriteApiAction } from "@/application/customers/CustomerWriteApiService";
import type { ProvenCustomerOperationalState } from "@/application/controlled-writes/customers/CustomerWriteTypes";
import { createIdempotencyKey } from "@/lib/ids";

const ALLOWED: CustomerWriteApiAction[] = ["disable", "block", "reactivate"];

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
      return 403;
    case "CUSTOMER_NOT_FOUND":
      return 404;
    case "INVALID_CUSTOMER_STATE_TRANSITION":
    case "PRECONDITION_FAILED":
    case "CUSTOMER_HAS_ACTIVE_TRIP":
    case "NOT_OPERATIONAL_CUSTOMER":
    case "IDEMPOTENCY_CONFLICT":
    case "REASON_REQUIRED":
    case "VALIDATION_FAILED":
      return 409;
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
    case "AUTH_WRITE_DISABLED":
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
  if (!ALLOWED.includes(action as CustomerWriteApiAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "customers:manage");

    const body = (await request.json().catch(() => ({}))) as {
      expectedCurrentState?: ProvenCustomerOperationalState;
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
      createIdempotencyKey(`ui-customer-${action}-${id}`);

    const outcome = await getCustomerWriteApiService().execute(ctx.user, {
      action: action as CustomerWriteApiAction,
      customerId: id,
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
          customerId: id,
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
        ...outcome.customer,
        write: {
          status: outcome.result.status,
          action: outcome.result.action,
          fromState: outcome.result.fromState,
          toState: outcome.result.toState,
          auditIntentId: outcome.result.auditIntentId,
          auditResultId: outcome.result.auditResultId,
          authWriteExecuted: outcome.result.authWriteExecuted,
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
