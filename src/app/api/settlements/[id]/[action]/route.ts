import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getSettlementService } from "@/application/services";
import {
  IllegalSettlementTransitionError,
  SettlementBusinessError,
} from "@/application/settlements/SettlementService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";

type Action = "submit" | "approve" | "reject" | "close" | "reverse";

function errorResponse(error: unknown, ctx?: { correlationId: string; requestId: string }) {
  const headers = ctx
    ? { "x-correlation-id": ctx.correlationId, "x-request-id": ctx.requestId }
    : undefined;
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message, code: error.code }, { status: 401, headers });
  }
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message, code: error.code }, { status: 403, headers });
  }
  if (error instanceof IllegalSettlementTransitionError) {
    return Response.json({ error: error.message, code: error.code }, { status: 409, headers });
  }
  if (error instanceof SettlementBusinessError) {
    const status = error.code === "NOT_FOUND" ? 404 : 400;
    return Response.json({ error: error.message, code: error.code }, { status, headers });
  }
  return Response.json({ error: sanitizeErrorMessage(error) }, { status: 500, headers });
}

async function handleAction(request: Request, id: string, action: Action) {
  let ctx;
  try {
    ctx = await resolveApiActor(request);
    const { assertSettlementNotLegacyOrphan, LegacySettlementMutationDeniedError } =
      await import("@/application/finance/assertSettlementNotLegacyOrphan");
    try {
      await assertSettlementNotLegacyOrphan(id);
    } catch (e) {
      if (e instanceof LegacySettlementMutationDeniedError) {
        return Response.json(
          { error: e.message, code: e.code },
          { status: 403 },
        );
      }
      throw e;
    }
    const service = getSettlementService();
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
    };

    let settlement;
    switch (action) {
      case "submit":
        await requirePermission(ctx, "settlements:create");
        settlement = await service.submit(ctx.user, id, ctx.correlationId);
        break;
      case "approve":
        await requirePermission(ctx, "settlements:approve");
        settlement = await service.approve(ctx.user, id, {
          correlationId: ctx.correlationId,
          idempotencyKey: ctx.idempotencyKey ?? undefined,
        });
        break;
      case "reject":
        await requirePermission(ctx, "settlements:approve");
        settlement = await service.reject(
          ctx.user,
          id,
          body.reason ?? "Rejected",
          ctx.correlationId,
        );
        break;
      case "close":
        await requirePermission(ctx, "settlements:approve");
        settlement = await service.close(ctx.user, id, {
          correlationId: ctx.correlationId,
          idempotencyKey: ctx.idempotencyKey ?? undefined,
        });
        break;
      case "reverse":
        await requirePermission(ctx, "settlements:approve");
        settlement = await service.reverse(ctx.user, id, body.reason ?? "Reversal", {
          correlationId: ctx.correlationId,
          idempotencyKey: ctx.idempotencyKey ?? undefined,
        });
        break;
    }
    return jsonWithIds(settlement, ctx);
  } catch (error) {
    return errorResponse(error, ctx);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, action } = await context.params;
  const allowed: Action[] = ["submit", "approve", "reject", "close", "reverse"];
  if (!allowed.includes(action as Action)) {
    return Response.json({ error: "Unknown action" }, { status: 404 });
  }
  return handleAction(request, id, action as Action);
}
