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
import {
  type P0WriteFlagGate,
} from "@/application/controlled-writes/P0WriteGates";
import {
  executeP0MasterControlledWrite,
  FakeP0MasterWriteRepository,
} from "@/application/controlled-writes/P0MasterControlledWriteService";
import { ProductionP0MasterWriteRepository } from "@/infrastructure/production/writes/ProductionDomainWriteRepositories";
import type { TourGuideWriteAction } from "@/domain/guides/TourGuideMaster";

const ACTIONS: TourGuideWriteAction[] = [
  "approve",
  "reject",
  "suspend",
  "reactivate",
];

const offline = new FakeP0MasterWriteRepository();

const statusMap: Record<TourGuideWriteAction, string> = {
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
  reactivate: "approved",
};

/** POST /api/guides/[id]/[action] — soft status only; no hard delete. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;
  const { id, action } = await context.params;
  if (!ACTIONS.includes(action as TourGuideWriteAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:approve");
    const env = getEnv();
    const flags: P0WriteFlagGate = {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
      VEHICLE_CATALOG_WRITE_ENABLED: env.VEHICLE_CATALOG_WRITE_ENABLED,
      PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
      FLEET_WRITE_ENABLED: env.FLEET_WRITE_ENABLED,
      GUIDE_WRITE_ENABLED: env.GUIDE_WRITE_ENABLED,
      GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
      FINANCE_WRITE_ENABLED: env.FINANCE_WRITE_ENABLED,
    };
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const repository = allowOffline
      ? offline
      : new ProductionP0MasterWriteRepository("guide", flags);

    const p0Action =
      action === "approve" || action === "reactivate"
        ? "activate"
        : action === "suspend" || action === "reject"
          ? "deactivate"
          : "update_metadata";

    const result = await executeP0MasterControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        domain: "guide",
        resourceId: id,
        action: p0Action,
        preconditionToken:
          request.headers.get("x-precondition-token")?.trim() || "unknown",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() || createIdempotencyKey(),
        correlationId: ctx.correlationId,
        metadata: {
          guide_status: statusMap[action as TourGuideWriteAction],
          is_tour_guide: true,
        },
        reasonCode: "operational",
      },
      { flags, repository, allowOfflineExecution: allowOffline },
    );

    return jsonWithIds(
      {
        ...result,
        action,
        guideId: id,
        nextStatus: statusMap[action as TourGuideWriteAction],
      },
      ctx,
      { status: result.ok ? 200 : 403 },
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
