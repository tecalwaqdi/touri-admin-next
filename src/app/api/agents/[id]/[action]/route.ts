import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getAgentWriteApiService } from "@/application/agents/AgentWriteApiService";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import type { AgentWriteApiAction } from "@/application/agents/AgentWriteApiService";
import type { ProvenAgentOperationalState } from "@/application/controlled-writes/agents/AgentWriteTypes";
import { createIdempotencyKey } from "@/lib/ids";
import { getEnv } from "@/config/env";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { getRepositories } from "@/repositories/container";

const LIFECYCLE: AgentWriteApiAction[] = ["activate", "deactivate", "suspend"];
const ALLOWED = [...LIFECYCLE, "update_metadata"] as const;

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
      return 403;
    case "AGENT_NOT_FOUND":
      return 404;
    case "INVALID_AGENT_STATE_TRANSITION":
    case "PRECONDITION_FAILED":
    case "ACTIVE_AGENT_ALREADY_EXISTS_FOR_COUNTRY":
    case "COUNTRY_REASSIGNMENT_NOT_ALLOWED":
    case "IDEMPOTENCY_CONFLICT":
    case "REASON_REQUIRED":
    case "VALIDATION_FAILED":
    case "NOT_OPERATIONAL_AGENT":
    case "EXCLUDED_NON_AGENT":
      return 409;
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
  if (!(ALLOWED as readonly string[]).includes(action)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const body = (await request.json().catch(() => ({}))) as {
      expectedCurrentState?: ProvenAgentOperationalState;
      reasonCode?: string;
      note?: string;
      displayName?: string;
    };

    // Display-name metadata edit — Fake/offline chrome only (no country reassignment).
    if (action === "update_metadata") {
      const env = getEnv();
      const allowOffline =
        env.APP_ENV === "development" &&
        env.PRODUCTION_READ_MODE === "disabled" &&
        isControlledWriteChromeEnabled();
      if (!allowOffline) {
        return Response.json(
          {
            error: "Agent metadata update disabled in Production",
            code: "PRODUCTION_WRITE_DISABLED",
          },
          { status: 403 },
        );
      }
      const displayName = String(body.displayName ?? "").trim();
      if (!displayName) {
        return Response.json(
          { error: "displayName required", code: "VALIDATION_FAILED" },
          { status: 400 },
        );
      }
      const agents = getRepositories().agents;
      const current = await agents.getById(id);
      if (!current) {
        return Response.json(
          { error: "Agent not found", code: "AGENT_NOT_FOUND" },
          { status: 404 },
        );
      }
      const updated = await agents.save({ ...current, name: displayName });
      return jsonWithIds(updated, ctx);
    }

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
      createIdempotencyKey(`ui-agent-${action}-${id}`);

    const outcome = await getAgentWriteApiService().execute(ctx.user, {
      action: action as AgentWriteApiAction,
      agentId: id,
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
          agentId: id,
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
        ...outcome.agent,
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
