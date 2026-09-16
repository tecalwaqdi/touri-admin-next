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
import { executeSettlementPaymentAction } from "@/application/finance/SettlementPaymentApiBridge";
import type { FinancePermission } from "@/domain/finance/v2/FinanceImplementationContracts";

type PaymentAction = "confirm" | "reverse";

/**
 * POST /api/settlements/[id]/payments/[paymentId]/[action]
 * FR5 confirm/reverse — SoD; no immutable edit; no React money calc.
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string; paymentId: string; action: string }>;
  },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, paymentId, action } = await context.params;
  if (!["confirm", "reverse"].includes(action)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    if (action === "confirm") {
      await requirePermission(ctx, "settlements:execute");
    } else {
      await requirePermission(ctx, "settlements:reverse");
    }

    const env = getEnv();
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
    };
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const financePerms = ctx.user.permissions.filter((p) =>
      [
        "finance:read",
        "settlements:create",
        "settlements:prepare",
        "settlements:approve",
        "settlements:execute",
        "settlements:reverse",
        "finance:adjust",
        "finance:adjust_approve",
      ].includes(p),
    ) as FinancePermission[];

    const result = await executeSettlementPaymentAction({
      actor: { userId: ctx.user.id, permissions: financePerms },
      action: action as PaymentAction,
      settlementId: id,
      paymentId,
      reason: body.reason,
      clientKey:
        request.headers.get("idempotency-key")?.trim() || createIdempotencyKey(),
      correlationId: ctx.correlationId,
      allowOffline,
    });

    return jsonWithIds(
      {
        ...result,
        payment: result.payment
          ? {
              ...result.payment,
              amountMinor: result.payment.amountMinor.toString(),
            }
          : undefined,
        settlement: result.settlement
          ? {
              id: result.settlement.id,
              status: result.settlement.status,
              amountMinor: result.settlement.amountMinor.toString(),
              paidConfirmedMinor:
                result.settlement.paidConfirmedMinor.toString(),
            }
          : undefined,
      },
      ctx,
      {
        status: result.ok
          ? 200
          : result.code === "DENIED"
            ? 403
            : 409,
      },
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
