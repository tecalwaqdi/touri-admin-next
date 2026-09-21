import { NextResponse } from "next/server";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  maybeShadowTrapResponse,
  productionReadPathActive,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import {
  resolveApiActor,
  requirePermission,
  UnauthorizedError,
  jsonWithIds,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { listProductionAgentsApi } from "@/application/production-read/ProductionOperationalApiReads";
import { getEnv } from "@/config/env";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import {
  assertNoOtherActiveAgentForCountry,
} from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { AgentWriteError } from "@/application/controlled-writes/agents/AgentWriteErrors";
import type { AgentStatus } from "@/types/agent";

export async function GET(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  if (productionReadPathActive()) {
    try {
      const ctx = await resolveApiActor(request);
      await requirePermission(ctx, "agents:read");
      const { searchParams } = new URL(request.url);
      const result = await listProductionAgentsApi(ctx, {
        pageSize: Number(searchParams.get("pageSize") ?? "20"),
        cursor: searchParams.get("cursor"),
        countryId: searchParams.get("countryId") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });
      return jsonWithIds(result, ctx);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 401 },
        );
      }
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: 403 },
        );
      }
      return mapProductionReadError(error);
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const pageSize = Number(searchParams.get("pageSize") ?? "10");
    const search = searchParams.get("search") ?? undefined;
    const countryId = searchParams.get("countryId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const result = await getRepositories().agents.list({
      page,
      pageSize,
      search,
      countryId,
      status,
    });
    return NextResponse.json({
      ...result,
      synthetic: true,
      sourceEnvironment: "synthetic",
      sourceSystem: "admin_next_synthetic",
      readMode: "synthetic",
      label: "development_synthetic",
    });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizeErrorMessage(error) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/agents — create agent (Fake/offline chrome only).
 * Production Auth+Firestore provision remains separately gated.
 * Create-as-active enforces one-country-one-active.
 */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:manage");

    const env = getEnv();
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    if (!allowOffline) {
      return NextResponse.json(
        {
          error:
            "Agent create disabled in Production — use Auth provision + activate when AGENT_WRITE_ENABLED",
          code: "PRODUCTION_WRITE_DISABLED",
        },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      agentId?: string;
      displayName?: string;
      countryId?: string;
      status?: AgentStatus;
      phone?: string | null;
      activeFromUtc?: string | null;
      activeToUtc?: string | null;
    };
    const agentId = String(body.agentId ?? "").trim();
    const displayName = String(body.displayName ?? "").trim();
    const countryId = String(body.countryId ?? "").trim();
    const status: AgentStatus =
      body.status === "active" ? "active" : "inactive";

    if (!agentId || !displayName || !countryId) {
      return NextResponse.json(
        { error: "agentId, displayName, countryId required", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const agents = getRepositories().agents;
    if (await agents.getById(agentId)) {
      return NextResponse.json(
        { error: "Agent already exists", code: "ALREADY_EXISTS" },
        { status: 409 },
      );
    }

    if (status === "active") {
      try {
        await assertNoOtherActiveAgentForCountry({
          countryId,
          agentId,
          lookup: {
            findActiveAgentIdForCountry: (cid) =>
              agents.findActiveAgentIdForCountryBucket(cid),
          },
        });
      } catch (err) {
        if (err instanceof AgentWriteError) {
          return NextResponse.json(
            { error: err.message, code: err.code },
            { status: 409 },
          );
        }
        throw err;
      }
    }

    const now = new Date().toISOString();
    const phoneRaw = body.phone;
    const phone =
      phoneRaw === undefined || phoneRaw === null
        ? undefined
        : String(phoneRaw).trim() || null;
    const activeFromUtc =
      body.activeFromUtc != null && String(body.activeFromUtc).trim()
        ? String(body.activeFromUtc).trim()
        : status === "active"
          ? now
          : null;
    const activeToUtc =
      body.activeToUtc != null && String(body.activeToUtc).trim()
        ? String(body.activeToUtc).trim()
        : null;
    const created = await agents.save({
      id: agentId,
      name: displayName,
      ...(phone !== undefined ? { phone } : {}),
      countryId,
      status,
      commissionPlaceholder: "—",
      driversCount: 0,
      tripsCount: 0,
      activeFromUtc,
      activeToUtc,
      createdAtUtc: now,
    });

    return jsonWithIds({ ok: true, ...created, productionWriteExecuted: false }, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
