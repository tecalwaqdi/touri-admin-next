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
import {
  executeFinancialPeriodWrite,
  mapFinancialPeriodDoc,
  type FinancialPeriodWriteAction,
} from "@/application/finance/periods/FinancialPeriodService";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";

export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");

    // Offline empty list — Production read wires later via allowlisted collection.
    const items = [
      mapFinancialPeriodDoc({
        id: "example_period",
        data: {
          label: "Synthetic example (not Production)",
          status: "open",
          currencyCode: "SAR",
        },
      }),
    ].filter(() => false);

    return jsonWithIds(
      {
        items,
        sourceLabel: resolveAdminDataSourceLabel({ syntheticSource: true }),
        writeGate: "FINANCE_WRITE_ENABLED",
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

export async function POST(
  request: Request,
  // periods list also accepts create/open via body when action routes unused
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "settlements:prepare");

    const body = (await request.json().catch(() => ({}))) as {
      periodId?: string;
      action?: FinancialPeriodWriteAction;
      expectedStatus?: "open" | "closed" | "locked" | "unknown";
    };

    if (!body.periodId || !body.action) {
      return Response.json(
        { error: "periodId and action required", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-period-${body.action}-${body.periodId}`);

    const result = executeFinancialPeriodWrite(
      {
        actorUid: ctx.user.id,
        periodId: body.periodId,
        action: body.action,
        idempotencyKey,
        correlationId: ctx.correlationId,
        expectedStatus: body.expectedStatus,
      },
      { status: body.expectedStatus ?? "open" },
      {
        allowOfflineExecution: false,
        financeWriteEnabled: env.FINANCE_WRITE_ENABLED,
      },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        {
          status:
            result.code === "PRODUCTION_WRITE_DISABLED" ? 503 : 409,
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
