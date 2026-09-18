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
import { ensureSupportQaFixture } from "@/application/controlled-writes/pilot/PilotQaFixtureProvision";
import { qaResourceId } from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import { snapshotSupportWriteFlags } from "@/application/controlled-writes/support/SupportWriteFlags";
import { randomUUID } from "node:crypto";

/** POST /api/support/qa-fixture — synthetic support ticket ensure. */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    try {
      await requirePermission(ctx, "customers:manage");
    } catch {
      await requirePermission(ctx, "users:manage");
    }

    const env = getEnv();
    const body = (await request.json().catch(() => ({}))) as {
      ticketId?: string;
    };

    const ticketId = String(
      body.ticketId || qaResourceId("support", `pilot_${randomUUID().slice(0, 8)}`),
    ).trim();

    const result = await ensureSupportQaFixture({
      ticketId,
      flags: snapshotSupportWriteFlags(env),
    });

    return jsonWithIds({ ok: true, synthetic: true, qaFixture: true, ...result }, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: error.message, code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "INTERNAL_WRITE_FAILURE";
    const status =
      code === "PRODUCTION_WRITE_DISABLED" || code === "RESOURCE_WRITE_DISABLED"
        ? 503
        : code === "VALIDATION_FAILED"
          ? 409
          : 500;
    return Response.json(
      { error: sanitizeErrorMessage(error), code, ok: false },
      { status },
    );
  }
}
