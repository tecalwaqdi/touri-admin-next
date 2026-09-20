import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getDriverWriteService } from "@/application/services";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import type { DriverWriteApiAction } from "@/application/drivers/DriverWriteApiService";
import type { ProvenDriverRegistrationState } from "@/application/controlled-writes/drivers/DriverWriteTypes";
import { createIdempotencyKey } from "@/lib/ids";
import { getEnv } from "@/config/env";
import { areDriverProductionWritesEnabled } from "@/application/controlled-writes/drivers/DriverWriteFlags";
import {
  CanonicalDriverReviewError,
  executeCanonicalDriverReview,
} from "@/application/drivers/CanonicalDriverReview";
import { ProductionCanonicalDriverReviewRepository } from "@/infrastructure/production/writes/CanonicalDriverReviewRepository";
import { WifDriverReviewRequestBindings } from "@/infrastructure/production/writes/WifDriverReviewRequestBindings";
import { extractBearerIdToken } from "@/infrastructure/auth/productionVerifiedAuth";
import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import type { Driver } from "@/types/driver";

const ALLOWED: DriverWriteApiAction[] = [
  "approve",
  "reject",
  "needs_changes",
  "suspend",
];

const CANONICAL_ACTIONS = new Set(["approve", "reject", "needs_changes"]);

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
      return 403;
    case "SCOPE_DENIED":
      return 403;
    case "DRIVER_NOT_FOUND":
      return 404;
    case "INVALID_DRIVER_STATE_TRANSITION":
    case "PRECONDITION_FAILED":
    case "DRIVER_HAS_ACTIVE_TRIP":
    case "DRIVER_NOT_READY_FOR_APPROVAL":
    case "DRIVER_NOT_READY":
    case "IDEMPOTENCY_CONFLICT":
    case "REASON_REQUIRED":
    case "VALIDATION_FAILED":
      return 409;
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
    case "WRITE_RUNTIME_UNAVAILABLE":
      return 403;
    case "WRITE_OUTCOME_UNKNOWN":
    case "WRITE_RECEIPT_MISMATCH":
      return 503;
    default:
      return 400;
  }
}

async function tryCanonicalReview(input: {
  request: Request;
  ctx: Awaited<ReturnType<typeof resolveApiActor>>;
  id: string;
  action: "approve" | "reject" | "needs_changes";
  body: {
    expectedCurrentState?: ProvenDriverRegistrationState;
    reason?: string;
    note?: string;
    reasonCode?: string;
    fieldsToFix?: string[];
    reviewVersion?: number;
    idempotencyKey: string;
  };
}): Promise<Response | null> {
  const env = getEnv();
  const flags = {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
  };
  if (!areDriverProductionWritesEnabled(flags)) return null;
  if (input.body.expectedCurrentState !== "pending_review") return null;
  if (
    input.body.reviewVersion == null ||
    !Number.isFinite(input.body.reviewVersion)
  ) {
    return null;
  }

  const token = extractBearerIdToken(
    input.request.headers.get("authorization"),
  );
  if (!token) return null;

  const reason =
    (input.body.reason ?? input.body.note ?? input.body.reasonCode ?? "").trim();

  try {
    const runtime = await getProductionOperationalReadRuntime();
    const readCtx = productionReadContextFromActor(input.ctx);
    const receipt = await executeCanonicalDriverReview(
      input.ctx.user,
      {
        action: input.action,
        driverId: input.id,
        expectedCurrentState: "pending_review",
        reviewVersion: input.body.reviewVersion,
        reason,
        fieldsToFix: input.body.fieldsToFix ?? [],
        idempotencyKey: input.body.idempotencyKey,
      },
      {
        assertEnabled: () => {
          if (!areDriverProductionWritesEnabled(flags)) {
            throw new CanonicalDriverReviewError("PRODUCTION_WRITE_DISABLED", 403);
          }
        },
        loadTarget: async (driverId) => {
          const envDoc = await runtime.repos.drivers.getById(readCtx, driverId);
          if (!envDoc?.data.isOperationalDriver) return null;
          return {
            operationalDriver: true,
            countryId: envDoc.data.countryId.value,
            cityId: envDoc.data.cityId.value,
            agentId: null,
          };
        },
        repository: new ProductionCanonicalDriverReviewRepository({
          projectId: "tutorial-multi-language-70gx4j",
          firebaseIdToken: token,
          bindings: new WifDriverReviewRequestBindings(),
        }),
      },
    );

    const driver: Driver = {
      id: receipt.driverId,
      name: receipt.driverId,
      phone: "",
      email: "",
      countryId: "",
      cityId: "",
      agentId: null,
      registrationStatus: receipt.registrationStatus,
      approvalStatus:
        receipt.registrationStatus === "approved"
          ? "approved"
          : receipt.registrationStatus === "rejected"
            ? "rejected"
            : "pending",
      availabilityStatus: "unavailable",
      vehiclePlate: "",
      rating: null,
      tripCount: 0,
      createdAtUtc: new Date().toISOString(),
      lastSeenAtUtc: null,
    };

    return jsonWithIds(
      {
        ...driver,
        write: {
          status: receipt.replay ? "idempotent_replay" : "applied",
          action: receipt.action,
          fromState: "pending_review",
          toState: receipt.registrationStatus,
          reviewVersion: receipt.reviewVersion,
          canonical: true,
        },
      },
      input.ctx,
    );
  } catch (error) {
    if (error instanceof CanonicalDriverReviewError) {
      return Response.json(
        {
          error: error.code,
          code: error.code,
          action: input.action,
          driverId: input.id,
        },
        {
          status: error.status || statusForCode(error.code),
          headers: {
            "x-correlation-id": input.ctx.correlationId,
            "x-request-id": input.ctx.requestId,
          },
        },
      );
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, action } = await context.params;
  if (!ALLOWED.includes(action as DriverWriteApiAction)) {
    return Response.json({ error: "Unknown action", code: "VALIDATION_FAILED" }, { status: 404 });
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:approve");

    const body = (await request.json().catch(() => ({}))) as {
      expectedCurrentState?: ProvenDriverRegistrationState;
      reasonCode?: string;
      note?: string;
      reason?: string;
      fieldsToFix?: string[];
      reviewVersion?: number;
    };

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
      createIdempotencyKey(`ui-driver-${action}-${id}`);

    if (CANONICAL_ACTIONS.has(action)) {
      const canonical = await tryCanonicalReview({
        request,
        ctx,
        id,
        action: action as "approve" | "reject" | "needs_changes",
        body: { ...body, idempotencyKey },
      });
      if (canonical) return canonical;
    }

    const outcome = await getDriverWriteService().execute(ctx.user, {
      action: action as DriverWriteApiAction,
      driverId: id,
      expectedCurrentState: body.expectedCurrentState,
      reasonCode: body.reasonCode,
      note: body.note ?? body.reason,
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
          driverId: id,
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
        ...outcome.driver,
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
