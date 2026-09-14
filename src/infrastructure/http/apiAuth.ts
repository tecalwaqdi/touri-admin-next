import type { AuthUser } from "@/types/auth";
import { AuthorizationError, assertPermission, assertScope } from "@/permissions/guards";
import { createCorrelationId, createRequestId } from "@/lib/ids";
import { getRepositories } from "@/repositories/container";
import { permissionsForRole } from "@/permissions/rbac";
import type { Permission } from "@/types/roles";
import { AuditService } from "@/audit/AuditService";
import { getEnv } from "@/config/env";
import {
  assertNoTrustedIdentityHeaders,
} from "@/infrastructure/production/firebase/FirebaseAdminProductionIdentityVerifier";
import {
  extractBearerIdToken,
  resolveProductionVerifiedActor,
} from "@/infrastructure/auth/productionVerifiedAuth";

export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type ApiActorContext = {
  user: AuthUser;
  correlationId: string;
  requestId: string;
  idempotencyKey: string | null;
};

/**
 * Dev/mock header auth. Staging/production MUST NOT trust
 * `x-user-id` / `x-role` / `x-country` / `x-agent` as authentication.
 * See docs/legacy-mapping/AUTH_PRODUCTION_BLOCKERS.md.
 */
export function isHeaderUserIdAuthAllowed(
  appEnv: string = getEnv().APP_ENV,
): boolean {
  return appEnv === "development";
}

/** Browser spoof headers that must never authorize staging/production. */
export const FORBIDDEN_TRUST_HEADERS = [
  "x-user-id",
  "x-role",
  "x-country",
  "x-agent",
] as const;

export function hasForbiddenTrustHeaders(request: Request): boolean {
  return FORBIDDEN_TRUST_HEADERS.some((h) => Boolean(request.headers.get(h)));
}

function parseUserFromHeaders(request: Request): {
  userId: string | null;
  email: string | null;
  usedHeaderUserId: boolean;
  usedMockBearer: boolean;
  usedSpoofHeaders: boolean;
} {
  const headerUserId = request.headers.get("x-user-id");
  const email = request.headers.get("x-user-email");
  const auth = request.headers.get("authorization");
  const usedSpoofHeaders =
    Boolean(request.headers.get("x-role")) ||
    Boolean(request.headers.get("x-country")) ||
    Boolean(request.headers.get("x-agent"));
  if (auth?.startsWith("Bearer mock:")) {
    return {
      userId: auth.slice("Bearer mock:".length),
      email,
      usedHeaderUserId: false,
      usedMockBearer: true,
      usedSpoofHeaders,
    };
  }
  return {
    userId: headerUserId,
    email,
    usedHeaderUserId: Boolean(headerUserId),
    usedMockBearer: false,
    usedSpoofHeaders,
  };
}

function mappedIdentityToAuthUser(identity: {
  uid: string;
  email: string;
  role: AuthUser["role"];
  permissions: AuthUser["permissions"];
  scope: AuthUser["scope"];
}): AuthUser {
  return {
    id: identity.uid,
    email: identity.email,
    displayName: identity.email || identity.uid,
    role: identity.role,
    permissions: identity.permissions.length
      ? identity.permissions
      : permissionsForRole(identity.role),
    scope: identity.scope,
    status: "active",
    locale: "en",
  };
}

export async function resolveApiActor(request: Request): Promise<ApiActorContext> {
  const correlationId =
    request.headers.get("x-correlation-id") ?? createCorrelationId();
  const requestId = request.headers.get("x-request-id") ?? createRequestId();
  const idempotencyKey = request.headers.get("idempotency-key");
  const env = getEnv();
  const { userId, email, usedHeaderUserId, usedMockBearer, usedSpoofHeaders } =
    parseUserFromHeaders(request);

  // Phase 4A-1+: verified_token path — Firebase ID token only (no header spoof).
  if (env.AUTH_MODE === "verified_token") {
    try {
      assertNoTrustedIdentityHeaders(request.headers, { APP_ENV: env.APP_ENV });
    } catch (err) {
      throw new UnauthorizedError(
        err instanceof Error ? err.message : "Untrusted identity header",
      );
    }
    if (usedHeaderUserId || usedMockBearer || usedSpoofHeaders) {
      throw new UnauthorizedError(
        "x-user-id / x-role / x-country / x-agent / mock bearer auth is forbidden when AUTH_MODE=verified_token",
      );
    }

    const token = extractBearerIdToken(request.headers.get("authorization"));
    if (!token) {
      throw new UnauthorizedError(
        "Missing Firebase ID token Bearer authorization",
      );
    }

    let resolved;
    try {
      resolved = await resolveProductionVerifiedActor(token, env);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Production Auth Client unavailable";
      throw new UnauthorizedError(
        msg.includes("private_key") || msg.includes("BEGIN PRIVATE")
          ? "Production Auth Client unavailable"
          : `Production Auth Client wiring error: ${msg}`,
      );
    }

    if (!resolved.ok) {
      throw new UnauthorizedError(
        `Production token verification failed: ${resolved.reason}`,
      );
    }

    return {
      user: mappedIdentityToAuthUser(resolved.identity),
      correlationId,
      requestId,
      idempotencyKey,
    };
  }

  if (!isHeaderUserIdAuthAllowed(env.APP_ENV)) {
    if (usedHeaderUserId || usedMockBearer || usedSpoofHeaders) {
      throw new UnauthorizedError(
        "x-user-id / x-role / x-country / x-agent / mock bearer auth is forbidden when APP_ENV is staging or production",
      );
    }
    // AUTH_MODE=mock outside development is already rejected by startup guard.
    throw new UnauthorizedError(
      "Production authentication is not configured; header identity is rejected",
    );
  }

  if (!userId && !email) {
    throw new UnauthorizedError();
  }

  const users = getRepositories().users;
  const user = userId
    ? await users.getById(userId)
    : email
      ? await users.findByEmail(email)
      : null;

  if (!user) throw new UnauthorizedError("Unknown user");
  if (user.status !== "active") throw new UnauthorizedError("Account not active");

  const full: AuthUser = {
    ...user,
    permissions: user.permissions?.length
      ? user.permissions
      : permissionsForRole(user.role),
  };

  return { user: full, correlationId, requestId, idempotencyKey };
}

export async function requirePermission(
  ctx: ApiActorContext,
  permission: Permission,
  resource?: { countryId?: string | null; cityId?: string | null; agentId?: string | null },
): Promise<void> {
  try {
    assertPermission(ctx.user.permissions, permission);
    if (resource) assertScope(ctx.user.scope, resource);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const audit = new AuditService(getRepositories().audit);
      await audit.record({
        actorUserId: ctx.user.id,
        actorRole: ctx.user.role,
        action: "permission_denied",
        resourceType: "permission",
        resourceId: permission,
        reason: err.message,
        correlationId: ctx.correlationId,
      });
    }
    throw err;
  }
}

export function jsonWithIds(
  body: unknown,
  ctx: ApiActorContext,
  init?: { status?: number },
): Response {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: {
      "x-correlation-id": ctx.correlationId,
      "x-request-id": ctx.requestId,
    },
  });
}
