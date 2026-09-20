import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { maybeShadowTrapResponse } from "@/infrastructure/http/shadowApi";
import { createIdempotencyKey } from "@/lib/ids";
import { getEnv } from "@/config/env";
import { areDriverProductionWritesEnabled } from "@/application/controlled-writes/drivers/DriverWriteFlags";
import { CanonicalDriverReviewError } from "@/application/drivers/CanonicalDriverReview";
import {
  CanonicalDriverDocumentReviewError,
  driverDocumentSlotField,
  executeCanonicalDriverDocumentReview,
} from "@/application/drivers/CanonicalDriverDocumentReview";
import { ProductionCanonicalDriverDocumentReviewRepository } from "@/infrastructure/production/writes/CanonicalDriverDocumentReviewRepository";
import { WifDriverReviewRequestBindings } from "@/infrastructure/production/writes/WifDriverReviewRequestBindings";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { extractBearerIdToken } from "@/infrastructure/auth/productionVerifiedAuth";
import {
  getProductionOperationalReadRuntime,
  productionReadContextFromActor,
} from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import {
  isDriverDocumentReviewAction,
  isDriverDocumentReviewSlot,
  normalizeDocumentSlotReviewStatus,
  type DriverDocumentReviewAction,
  type DriverDocumentReviewSlot,
} from "@/domain/driver/DriverDocumentReview";
import { buildDriverComplianceSafeSummary } from "@/domain/driver/DriverComplianceSummary";

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
    case "PRODUCTION_WRITE_DISABLED":
      return 403;
    case "DRIVER_NOT_FOUND":
    case "DOCUMENT_NOT_FOUND":
      return 404;
    case "PRECONDITION_FAILED":
    case "DRIVER_NOT_READY":
    case "IDEMPOTENCY_CONFLICT":
    case "REASON_REQUIRED":
    case "VALIDATION_FAILED":
      return 409;
    case "WRITE_OUTCOME_UNKNOWN":
    case "WRITE_RECEIPT_MISMATCH":
    case "WRITE_RUNTIME_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}

/** POST /api/drivers/[id]/documents/[slot]/[action] — per-document review. */
export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string; slot: string; action: string }>;
  },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, slot, action } = await context.params;
  if (!isDriverDocumentReviewSlot(slot) || !isDriverDocumentReviewAction(action)) {
    return Response.json(
      { error: "Unknown document review action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:approve");

    const env = getEnv();
    const flags = {
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
    };
    if (!areDriverProductionWritesEnabled(flags)) {
      return Response.json(
        { error: "Production driver writes disabled", code: "PRODUCTION_WRITE_DISABLED" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      expectedDocumentVersion?: number;
      reason?: string;
      note?: string;
      reasonCode?: string;
    };

    if (
      body.expectedDocumentVersion == null ||
      !Number.isFinite(body.expectedDocumentVersion)
    ) {
      return Response.json(
        {
          error: "expectedDocumentVersion is required",
          code: "VALIDATION_FAILED",
        },
        { status: 400 },
      );
    }

    const token = extractBearerIdToken(
      request.headers.get("authorization"),
    );
    if (!token) {
      return Response.json(
        { error: "Bearer token required", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-driver-doc-${action}-${id}-${slot}`);

    const reason = (
      body.reason ??
      body.note ??
      body.reasonCode ??
      ""
    ).trim();

    const runtime = await getProductionOperationalReadRuntime();
    const readCtx = productionReadContextFromActor(ctx);

    let writePort;
    try {
      writePort = createWifWritePortOrThrow("driver_review");
    } catch {
      writePort = undefined;
    }

    const receipt = await executeCanonicalDriverDocumentReview(
      ctx.user,
      {
        action: action as DriverDocumentReviewAction,
        driverId: id,
        slot: slot as DriverDocumentReviewSlot,
        expectedDocumentVersion: body.expectedDocumentVersion,
        reason,
        idempotencyKey,
      },
      {
        assertEnabled: () => {
          if (!areDriverProductionWritesEnabled(flags)) {
            throw new CanonicalDriverDocumentReviewError(
              "PRODUCTION_WRITE_DISABLED",
              403,
            );
          }
        },
        loadTarget: async (driverId, reviewSlot) => {
          const envDoc = await runtime.repos.drivers.getById(readCtx, driverId);
          if (!envDoc?.data.isOperationalDriver) return null;
          const raw = await runtime.client.getDocument("user", driverId);
          if (!raw.exists || !raw.data) return null;
          const compliance = buildDriverComplianceSafeSummary(raw.data);
          const slotSummary = compliance.slots.find((s) => s.slot === reviewSlot);
          return {
            operationalDriver: true,
            countryId: envDoc.data.countryId.value,
            cityId: envDoc.data.cityId.value,
            agentId: null,
            registrationStatus: String(raw.data.registration_status ?? ""),
            submissionStatus:
              typeof raw.data.submission_status === "string"
                ? raw.data.submission_status
                : null,
            slotPresence: slotSummary?.presence ?? "unknown",
            documentVersion: slotSummary?.documentVersion ?? 1,
            slotField: driverDocumentSlotField(reviewSlot),
          };
        },
        repository: new ProductionCanonicalDriverDocumentReviewRepository({
          projectId: "tutorial-multi-language-70gx4j",
          firebaseIdToken: token,
          bindings: new WifDriverReviewRequestBindings(
            process.env,
            fetch,
            undefined,
            "reviewDriverDocument",
          ),
          writePort,
          actorUid: ctx.user.id,
        }),
      },
    );

    return jsonWithIds(
      {
        driverId: receipt.driverId,
        slot: receipt.slot,
        action: receipt.action,
        reviewStatus: normalizeDocumentSlotReviewStatus(receipt.reviewStatus),
        documentVersion: receipt.documentVersion,
        write: {
          status: receipt.replay ? "idempotent_replay" : "applied",
          action: receipt.action,
          toState: receipt.reviewStatus,
          documentVersion: receipt.documentVersion,
          canonical: true,
        },
      },
      ctx,
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
    if (error instanceof CanonicalDriverDocumentReviewError) {
      return Response.json(
        { error: error.code, code: error.code, action, driverId: id, slot },
        { status: error.status || statusForCode(error.code) },
      );
    }
    if (error instanceof CanonicalDriverReviewError) {
      return Response.json(
        { error: error.code, code: error.code, action, driverId: id, slot },
        { status: error.status || statusForCode(error.code) },
      );
    }
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
