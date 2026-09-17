import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getAgentCommandService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { getAdminControlledWritesRuntime } from "@/application/controlled-writes/runtime/DriversControlledWritesRuntime";
import { getRepositories } from "@/repositories/container";
import { getEnv } from "@/config/env";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

function isOfflineAgentWriteAllow(): boolean {
  const env = getEnv();
  return (
    env.APP_ENV === "development" &&
    env.PRODUCTION_READ_MODE === "disabled" &&
    isControlledWriteChromeEnabled()
  );
}

/**
 * Legacy activate entrypoint.
 * Production / gated-off: deny BEFORE any Agent resource lookup (no existence leak).
 * Offline chrome only: synthetic AgentCommandService uniqueness path.
 * Canonical Production mutations: POST /api/agents/[id]/activate.
 */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);

    if (!isOfflineAgentWriteAllow()) {
      await requirePermission(ctx, "agents:manage");
      const repos = getRepositories();
      const runtime = getAdminControlledWritesRuntime({
        drivers: repos.drivers,
        agents: repos.agents,
        customers: repos.customers,
      });
      const gateDenial = runtime.service.denyAgentWriteIfDisabled("activate");
      const code = gateDenial?.code ?? "PRODUCTION_WRITE_DISABLED";
      const message =
        gateDenial?.message ??
        "Agent writes disabled — use POST /api/agents/{id}/activate when armed";
      return Response.json(
        { error: message, code, action: "activate" },
        {
          status: 403,
          headers: {
            "x-correlation-id": ctx.correlationId,
            "x-request-id": ctx.requestId,
          },
        },
      );
    }

    await requirePermission(ctx, "agents:read");
    const body = (await request.json()) as {
      agentId: string;
      countryId: string;
      effectiveFromUtc?: string;
    };
    const result = await getAgentCommandService().attemptActivate(ctx.user, {
      ...body,
      correlationId: ctx.correlationId,
    });
    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code },
        {
          status: 409,
          headers: {
            "x-correlation-id": ctx.correlationId,
            "x-request-id": ctx.requestId,
          },
        },
      );
    }
    return jsonWithIds(result, ctx);
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
