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
import {
  DisabledGeographyWriteRepository,
  FakeGeographyWriteRepository,
  executeGeographyControlledWrite,
  type GeographyResource,
  type GeographyWriteAction,
} from "@/application/controlled-writes/geography/GeographyControlledWriteService";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

const RESOURCES: GeographyResource[] = ["country", "region", "city", "landmark"];
const ACTIONS: GeographyWriteAction[] = [
  "create",
  "update_metadata",
  "activate",
  "deactivate",
  "archive",
];

const offline = new FakeGeographyWriteRepository();

/**
 * POST /api/geography/[resource]/[id]/[action]
 * Gated geography mutations — Production default denied; no CP5 cleanup.
 */
export async function POST(
  request: Request,
  context: {
    params: Promise<{ resource: string; id: string; action: string }>;
  },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { resource, id, action } = await context.params;
  if (
    !RESOURCES.includes(resource as GeographyResource) ||
    !ACTIONS.includes(action as GeographyWriteAction)
  ) {
    return Response.json(
      { error: "Unknown geography action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const env = getEnv();
    const flags = {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
      REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
    };

    const body = (await request.json().catch(() => ({}))) as {
      expectedActive?: boolean | null;
      preconditionToken?: string;
      metadata?: Record<string, unknown>;
      reasonCode?: string;
      note?: string;
    };

    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const repository = allowOffline
      ? offline
      : new DisabledGeographyWriteRepository(flags);

    const result = await executeGeographyControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        resource: resource as GeographyResource,
        resourceId: id,
        action: action as GeographyWriteAction,
        expectedActive: body.expectedActive ?? null,
        preconditionToken: body.preconditionToken ?? "unknown",
        idempotencyKey:
          request.headers.get("idempotency-key")?.trim() || createIdempotencyKey(),
        correlationId: ctx.correlationId,
        metadata: body.metadata as
          | {
              displayNameEn?: string;
              displayNameAr?: string;
              countryId?: string;
              regionId?: string;
              cityId?: string;
              category?: string;
              visibility?: "public" | "hidden" | "pending";
              lat?: number;
              lng?: number;
            }
          | undefined,
        reasonCode: body.reasonCode ?? "operational",
        note: body.note,
      },
      { flags, repository, allowOfflineExecution: allowOffline },
    );

    return jsonWithIds(result, ctx, {
      status: result.ok ? 200 : result.code === "PRODUCTION_WRITE_DISABLED" ? 403 : 409,
    });
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
