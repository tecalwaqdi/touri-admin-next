import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError, assertScope } from "@/permissions/guards";
import { getSettlementService } from "@/application/services";
import {
  IllegalSettlementTransitionError,
  SettlementBusinessError,
} from "@/application/settlements/SettlementService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { getRepositories } from "@/repositories/container";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getEnv } from "@/config/env";

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

export async function GET(request: Request) {
  const env = getEnv();
  if (env.PRODUCTION_READ_MODE === "shadow") {
    return Response.json(
      { error: "SHADOW_SETTLEMENT_DISABLED", code: "SHADOW_SETTLEMENT_DISABLED" },
      { status: 403 },
    );
  }
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "finance:read");
    const { searchParams } = new URL(request.url);
    let countryId = searchParams.get("countryId") ?? undefined;

    // Country-scoped actors: explicit out-of-scope country → deny; else force in-scope filter.
    if (ctx.user.scope.type === "country") {
      if (countryId) {
        assertScope(ctx.user.scope, { countryId });
      } else {
        const scoped = ctx.user.scope.countryIds ?? [];
        if (scoped.length === 0) {
          throw new AuthorizationError("Resource outside user scope");
        }
        countryId = scoped[0];
      }
    }

    const result = await getRepositories().settlements.list({
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "20"),
      status: searchParams.get("status") ?? undefined,
      countryId,
      partyType: searchParams.get("partyType") ?? undefined,
      partyId: searchParams.get("partyId") ?? undefined,
      currencyCode: searchParams.get("currencyCode") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });
    return jsonWithIds(result, ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  const env = getEnv();
  if (env.PRODUCTION_READ_MODE === "shadow") {
    return Response.json(
      { error: "SHADOW_SETTLEMENT_DISABLED", code: "SHADOW_SETTLEMENT_DISABLED" },
      { status: 403 },
    );
  }
  let ctx;
  try {
    ctx = await resolveApiActor(request);
    await requirePermission(ctx, "settlements:create");
    const body = (await request.json()) as {
      partyType: "driver" | "agent";
      partyId: string;
      currencyCode: string;
      periodFromUtc: string;
      periodToUtc: string;
      countryId: string;
      tripIds?: string[];
    };
    const settlement = await getSettlementService().createDraft(ctx.user, {
      ...body,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
      correlationId: ctx.correlationId,
    });
    return jsonWithIds(settlement, ctx, { status: 201 });
  } catch (error) {
    return errorResponse(error, ctx);
  }
}
