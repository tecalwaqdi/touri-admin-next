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
  executeNotificationControlledWrite,
  FakeAudienceResolver,
  FakeNotificationWriteRepository,
} from "@/application/controlled-writes/notifications/NotificationControlledWriteService";
import {
  assertNoClientFcmTokens,
  FakePushDeliveryAdapter,
} from "@/application/controlled-writes/notifications/PushDeliveryAdapter";
import { snapshotNotificationWriteFlags } from "@/application/controlled-writes/notifications/NotificationWriteFlags";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

const fakeRepo = new FakeNotificationWriteRepository();
const fakePush = new FakePushDeliveryAdapter();
const audience = new FakeAudienceResolver();
const idempotency = new Map<
  string,
  Awaited<ReturnType<typeof executeNotificationControlledWrite>>
>();

export async function POST(request: Request) {
  const trap = maybeShadowTrapResponse(request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(request);
    try {
      await requirePermission(ctx, "drivers:approve");
    } catch {
      await requirePermission(ctx, "users:manage");
    }

    const body = (await request.json().catch(() => ({}))) as {
      categoryFilter?: string;
    };
    assertNoClientFcmTokens(body);

    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      request.headers.get("idempotency-key") ??
      createIdempotencyKey(`ui-notif-mark-all-${ctx.user.id}`);

    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    const result = await executeNotificationControlledWrite(
      {
        actor: {
          uid: ctx.user.id,
          role: ctx.user.role,
          permissions: ctx.user.permissions,
          scope: ctx.user.scope,
        },
        action: "mark_all_read",
        categoryFilter: body.categoryFilter,
        idempotencyKey,
        correlationId: ctx.correlationId,
      },
      {
        flags: snapshotNotificationWriteFlags(env),
        repository: fakeRepo,
        audienceResolver: audience,
        pushAdapter: fakePush,
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
        { error: result.message, code: result.code },
        {
          status:
            result.code === "PRODUCTION_WRITE_DISABLED" ? 503 : 400,
        },
      );
    }

    return jsonWithIds({ ...result, realPushSent: false }, ctx);
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
