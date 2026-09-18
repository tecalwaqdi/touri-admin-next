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
import { ensureCustomerQaFixture } from "@/application/controlled-writes/customers/CustomerQaFixtureProvision";
import { qaResourceId } from "@/application/controlled-writes/pilot/SyntheticFixtureFactory";
import { randomUUID } from "node:crypto";

/**
 * POST /api/customers/qa-fixture — QA-only synthetic Customer ensure.
 * Requires customers:manage + CUSTOMER production write gates.
 */
export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "customers:manage");

    const env = getEnv();
    const body = (await request.json().catch(() => ({}))) as {
      customerId?: string;
      countryId?: string;
      displayNameHint?: string;
    };

    const countryId = String(body.countryId || "saudi_arabia").trim();
    const customerId = String(
      body.customerId ||
        qaResourceId("customer", `a_${randomUUID().slice(0, 8)}`),
    ).trim();

    const result = await ensureCustomerQaFixture({
      customerId,
      countryId,
      displayNameHint: body.displayNameHint,
      flags: {
        GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
        PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED === true,
        CUSTOMER_WRITE_ENABLED: env.CUSTOMER_WRITE_ENABLED,
        CUSTOMER_AUTH_WRITE_ENABLED: env.CUSTOMER_AUTH_WRITE_ENABLED,
      },
    });

    return jsonWithIds(
      {
        ok: true,
        ...result,
        synthetic: true,
        qaFixture: true,
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
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "INTERNAL_WRITE_FAILURE";
    const status =
      code === "PRODUCTION_WRITE_DISABLED" || code === "RESOURCE_WRITE_DISABLED"
        ? 503
        : code === "VALIDATION_FAILED" || code === "NOT_OPERATIONAL_CUSTOMER"
          ? 409
          : 500;
    return Response.json(
      { error: sanitizeErrorMessage(error), code, ok: false },
      { status },
    );
  }
}
