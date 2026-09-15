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
import { executeIdentityControlledWrite } from "@/application/controlled-writes/identity/IdentityControlledWriteService";
import {
  FakeIdentityWriteRepository,
  DisabledIdentityWriteRepository,
} from "@/application/controlled-writes/identity/IdentityWriteRepository";
import { snapshotIdentityWriteFlags } from "@/application/controlled-writes/identity/IdentityWriteFlags";
import type {
  IdentityWriteAction,
  IdentityWriteCommand,
  IdentityWritableRole,
} from "@/application/controlled-writes/identity/IdentityWriteTypes";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

const ALLOWED: IdentityWriteAction[] = [
  "create_persona",
  "activate",
  "deactivate",
  "assign_role",
  "change_role",
  "assign_country_scope",
  "assign_agent_scope",
  "clear_scope",
];

const offlineStore = new FakeIdentityWriteRepository();
const offlineIdempotency = new Map<
  string,
  Awaited<ReturnType<typeof executeIdentityControlledWrite>>
>();
const offlineAudit = {
  async recordIntent() {
    return { intentId: `intent_${Date.now().toString(36)}` };
  },
  async recordResult() {
    return { resultId: `result_${Date.now().toString(36)}` };
  },
};

function statusForCode(code: string): number {
  switch (code) {
    case "PERMISSION_DENIED":
    case "SCOPE_DENIED":
    case "SELF_ESCALATION_DENIED":
    case "ESCALATION_DENIED":
    case "LAST_SUPER_ADMIN_PROTECTED":
      return 403;
    case "USER_NOT_FOUND":
      return 404;
    case "PRODUCTION_WRITE_DISABLED":
    case "RESOURCE_WRITE_DISABLED":
    case "IDENTITY_ADMIN_WIF_REQUIRED":
      return 403;
    case "PRECONDITION_FAILED":
    case "IDEMPOTENCY_CONFLICT":
    case "VALIDATION_FAILED":
    case "INVALID_ROLE":
      return 409;
    default:
      return 400;
  }
}

/**
 * POST /api/users/[id]/[action] — gated identity persona mutations.
 * Production default denied. Offline Fake when APP_ENV=development + chrome.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  const { id, action } = await context.params;
  if (!ALLOWED.includes(action as IdentityWriteAction)) {
    return Response.json(
      { error: "Unknown action", code: "VALIDATION_FAILED" },
      { status: 404 },
    );
  }

  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "users:manage");

    const env = getEnv();
    const flags = snapshotIdentityWriteFlags({
      GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
      PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
      ADMIN_IDENTITY_WRITE_ENABLED: env.ADMIN_IDENTITY_WRITE_ENABLED,
    });

    const body = (await request.json().catch(() => ({}))) as {
      expectedCurrentRole?: IdentityWritableRole | "none" | "unknown";
      expectedDisabled?: boolean;
      preconditionToken?: string;
      role?: IdentityWritableRole;
      countryId?: string;
      agentId?: string;
      reasonCode?: string;
      note?: string;
    };

    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() || createIdempotencyKey();

    const base = {
      actor: {
        uid: ctx.user.id,
        role: ctx.user.role,
        permissions: ctx.user.permissions,
        scope: ctx.user.scope,
      },
      targetUserId: id,
      expectedCurrentRole: body.expectedCurrentRole ?? "unknown",
      expectedDisabled: body.expectedDisabled ?? false,
      preconditionToken: body.preconditionToken ?? "unknown",
      idempotencyKey,
      correlationId: ctx.correlationId,
      reasonCode: body.reasonCode ?? "operational",
      note: body.note,
    };

    let command: IdentityWriteCommand;
    switch (action as IdentityWriteAction) {
      case "create_persona":
        command = {
          ...base,
          action: "create_persona",
          role: body.role ?? "accountant",
          countryId: body.countryId ?? null,
          agentId: body.agentId ?? null,
        };
        break;
      case "activate":
        command = { ...base, action: "activate" };
        break;
      case "deactivate":
        command = { ...base, action: "deactivate" };
        break;
      case "assign_role":
      case "change_role":
        command = {
          ...base,
          action: action as "assign_role" | "change_role",
          role: body.role ?? "accountant",
          countryId: body.countryId ?? null,
        };
        break;
      case "assign_country_scope":
        command = {
          ...base,
          action: "assign_country_scope",
          countryId: body.countryId ?? "",
        };
        break;
      case "assign_agent_scope":
        command = {
          ...base,
          action: "assign_agent_scope",
          agentId: body.agentId ?? "",
          countryId: body.countryId ?? "",
        };
        break;
      case "clear_scope":
        command = { ...base, action: "clear_scope" };
        break;
    }

    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const repository = allowOffline
      ? offlineStore
      : new DisabledIdentityWriteRepository(flags);

    if (allowOffline && !offlineStore.get(id) && action === "create_persona") {
      // create path seeds via apply
    } else if (allowOffline && !offlineStore.get(id)) {
      offlineStore.seed({
        userId: id,
        exists: true,
        isPanelPersona: true,
        role: (body.expectedCurrentRole as IdentityWritableRole) ?? "accountant",
        disabled: body.expectedDisabled ?? false,
        countryId: body.countryId ?? null,
        agentId: null,
        superAdminCountHint: 2,
        preconditionToken: body.preconditionToken ?? "unknown",
        reconciliation: "UNKNOWN",
      });
    }

    const result = await executeIdentityControlledWrite(command, {
      flags,
      loadPort: {
        async load(userId) {
          return offlineStore.get(userId) ?? null;
        },
      },
      repository,
      idempotency: {
        async get(key) {
          return offlineIdempotency.get(key) ?? null;
        },
        async put(key, response) {
          offlineIdempotency.set(key, response);
        },
      },
      audit: offlineAudit,
      allowOfflineExecution: allowOffline,
    });

    return jsonWithIds(result, ctx, {
      status: result.ok ? 200 : statusForCode(result.code),
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
