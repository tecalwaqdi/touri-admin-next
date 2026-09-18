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
import {
  executeSupportControlledWrite,
} from "@/application/controlled-writes/support/SupportControlledWriteService";
import { FakeSupportWriteRepository } from "@/application/controlled-writes/support/SupportWriteRepository";
import { ProductionSupportWriteRepository } from "@/infrastructure/production/writes/ProductionDomainWriteRepositories";
import { createProductionSupportWriteLoadPort } from "@/application/controlled-writes/support/ProductionSupportWriteLoadPort";
import type {
  SupportDisplayStatus,
  SupportWriteAction,
} from "@/application/controlled-writes/support/SupportWriteTypes";
import { snapshotSupportWriteFlags } from "@/application/controlled-writes/support/SupportWriteFlags";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

const ALLOWED: SupportWriteAction[] = [
  "change_status",
  "assign",
  "reassign",
  "add_note",
  "resolve",
  "reopen",
  "categorize",
  "update_priority",
];

const fakeRepo = new FakeSupportWriteRepository();
const idempotency = new Map<string, Awaited<ReturnType<typeof executeSupportControlledWrite>>>();

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
      return 403;
    case "SUPPORT_NOT_FOUND":
      return 404;
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
      return 503;
    case "ILLEGAL_STATUS_TRANSITION":
    case "PRECONDITION_FAILED":
    case "IDEMPOTENCY_CONFLICT":
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
  if (!ALLOWED.includes(action as SupportWriteAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    try {
      await requirePermission(ctx, "customers:manage");
    } catch {
      await requirePermission(ctx, "users:manage");
    }

    const body = (await request.json().catch(() => ({}))) as {
      expectedPreconditionToken?: string;
      targetStatus?: SupportDisplayStatus;
      assigneeAdminId?: string;
      noteText?: string;
      category?: string;
      priority?: string;
      reasonCode?: string;
    };

    if (!body.expectedPreconditionToken) {
      return Response.json(
        { error: "expectedPreconditionToken required", code: "VALIDATION_FAILED" },
        { status: 400 },
      );
    }

    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-support-${action}-${id}`);

    const flags = snapshotSupportWriteFlags(env);
    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();
    const repository = allowOffline
      ? fakeRepo
      : new ProductionSupportWriteRepository(flags);
    const productionLoadPort = allowOffline
      ? null
      : createProductionSupportWriteLoadPort();

    // Seed Fake so offline chrome can demonstrate pipeline (never Production).
    if (allowOffline && !fakeRepo.docs.has(id)) {
      fakeRepo.seed(id, { halh: "Open", status: "open" }, body.expectedPreconditionToken);
    }

    const result = await executeSupportControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        ticketId: id,
        action: action as SupportWriteAction,
        expectedPreconditionToken: body.expectedPreconditionToken,
        idempotencyKey,
        correlationId: ctx.correlationId,
        targetStatus: body.targetStatus,
        assigneeAdminId: body.assigneeAdminId,
        noteText: body.noteText,
        category: body.category,
        priority: body.priority,
        reasonCode: body.reasonCode,
      },
      {
        flags,
        loadPort: {
          async load(ticketId) {
            if (productionLoadPort) {
              return productionLoadPort.load(ticketId);
            }
            const doc = fakeRepo.docs.get(ticketId);
            if (!doc) return null;
            return {
              exists: true,
              ticketId,
              status: "open",
              displayStatus: "open",
              countryId: null,
              assignedAdminId: null,
              category: null,
              priority: null,
              isDriverSchema: false,
              preconditionToken: doc.token,
            };
          },
        },
        repository,
        idempotency: {
          get: async (k) => idempotency.get(k) ?? null,
          put: async (k, v) => {
            idempotency.set(k, v);
          },
        },
        audit: {
          recordIntent: async () => ({ intentId: `intent-${idempotencyKey}` }),
          recordResult: async () => ({ resultId: `result-${idempotencyKey}` }),
        },
        allowOfflineExecution: allowOffline,
      },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.message, code: result.code, action, ticketId: id },
        {
          status: statusForCode(result.code),
          headers: {
            "x-correlation-id": ctx.correlationId,
            "x-request-id": ctx.requestId,
          },
        },
      );
    }

    return jsonWithIds(
      {
        ...result,
        writeGate: "SUPPORT_WRITE_ENABLED",
        productionArmed: false,
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
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
