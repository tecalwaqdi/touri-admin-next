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
import {
  assertNoOtherActiveAgentForCountry,
} from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import { areAgentProductionWritesEnabled } from "@/application/controlled-writes/agents/AgentWriteFlags";
import { createProductionAgentWriteLoadPort } from "@/application/controlled-writes/agents/ProductionAgentWriteLoadPort";
import {
  buildAgentMetadataLegacyPatch,
  parseOptionalIsoFromBody,
} from "@/domain/agent/AgentLegacyMetadataWriteFields";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { Agent } from "@/types/agent";

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
      phone?: string | null;
      countryId?: string;
      activeFromUtc?: string | null;
      activeToUtc?: string | null;
      countryDisplayName?: string | null;
    };

    /**
     * Legacy metadata edit (display name, phone, country, contract dates).
     * Finance fields (Agent_total, app_commission_percent, vat_percent) are never written here.
     */
    if (action === "update_metadata") {
      const env = getEnv();
      const flags = {
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
        AGENT_WRITE_ENABLED: env.AGENT_WRITE_ENABLED,
      };
      const allowOffline =
        env.APP_ENV === "development" &&
        env.PRODUCTION_READ_MODE === "disabled" &&
        isControlledWriteChromeEnabled();
      const productionWrites = areAgentProductionWritesEnabled(flags);

      if (!allowOffline && !productionWrites) {
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
      let current: Agent | null = null;
      let productionLoadPort: ReturnType<
        typeof createProductionAgentWriteLoadPort
      > | null = null;

      if (allowOffline) {
        current = (await agents.getById(id)) ?? null;
      } else {
        const port = createWifWritePortOrThrow("ops_writer");
        productionLoadPort = createProductionAgentWriteLoadPort(port);
        const snap = await productionLoadPort.loadForWrite(id);
        if (!snap) {
          return Response.json(
            { error: "Agent not found", code: "AGENT_NOT_FOUND" },
            { status: 404 },
          );
        }
        current = {
          id: snap.agentId,
          name: displayName,
          phone: null,
          countryId: snap.countryId ?? "",
          status:
            snap.operationalState === "active"
              ? "active"
              : snap.operationalState === "suspended"
                ? "suspended"
                : "inactive",
          commissionPlaceholder: "—",
          driversCount: 0,
          tripsCount: 0,
          activeFromUtc: null,
          activeToUtc: null,
          createdAtUtc: new Date().toISOString(),
        };
      }

      if (!current) {
        return Response.json(
          { error: "Agent not found", code: "AGENT_NOT_FOUND" },
          { status: 404 },
        );
      }

      const nextCountryId = String(body.countryId ?? current.countryId).trim();
      if (!nextCountryId) {
        return Response.json(
          { error: "countryId required", code: "VALIDATION_FAILED" },
          { status: 400 },
        );
      }

      const phoneProvided = body.phone !== undefined;
      const phone = phoneProvided
        ? body.phone == null
          ? null
          : String(body.phone).trim() || null
        : current.phone ?? null;
      const activeFromUtc = parseOptionalIsoFromBody(body.activeFromUtc);
      const activeToUtc = parseOptionalIsoFromBody(body.activeToUtc);

      const countryChanged = nextCountryId !== current.countryId;
      if (countryChanged && current.status === "active") {
        try {
          if (allowOffline) {
            await assertNoOtherActiveAgentForCountry({
              countryId: nextCountryId,
              agentId: id,
              lookup: {
                findActiveAgentIdForCountry: (cid) =>
                  agents.findActiveAgentIdForCountryBucket(cid),
              },
            });
          } else if (productionLoadPort) {
            await assertNoOtherActiveAgentForCountry({
              countryId: nextCountryId,
              agentId: id,
              lookup: {
                findActiveAgentIdForCountry: (cid) =>
                  productionLoadPort!.findActiveAgentIdForCountry(cid),
              },
            });
          }
        } catch (err) {
          if (err instanceof AgentWriteError) {
            return Response.json(
              { error: err.message, code: err.code },
              { status: 409 },
            );
          }
          throw err;
        }
      }

      const nextAgent: Agent = {
        ...current,
        name: displayName,
        countryId: nextCountryId,
        phone,
        activeFromUtc:
          activeFromUtc !== undefined ? activeFromUtc : current.activeFromUtc,
        activeToUtc:
          activeToUtc !== undefined ? activeToUtc : current.activeToUtc,
      };

      if (allowOffline) {
        const updated = await agents.save(nextAgent);
        return jsonWithIds(updated, ctx);
      }

      const patch = buildAgentMetadataLegacyPatch({
        displayName,
        phone: phoneProvided ? phone : undefined,
        countryId: countryChanged ? nextCountryId : undefined,
        countryDisplayName: body.countryDisplayName ?? undefined,
        activeFromUtc:
          activeFromUtc !== undefined ? activeFromUtc : undefined,
        activeToUtc: activeToUtc !== undefined ? activeToUtc : undefined,
      });

      const port = createWifWritePortOrThrow("ops_writer");
      await port.updateDocument("user", id, patch);
      return jsonWithIds(
        { ...nextAgent, productionWriteExecuted: true },
        ctx,
      );
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
