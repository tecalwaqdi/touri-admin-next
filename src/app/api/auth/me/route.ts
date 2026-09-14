import {
  jsonWithIds,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

/** GET /api/auth/me — resolve actor from verified token (no duplicated RBAC in React). */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    const { user } = ctx;
    return jsonWithIds(
      {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          permissions: user.permissions,
          scope: user.scope,
          status: user.status,
          locale: user.locale,
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
    return Response.json(
      { error: sanitizeErrorMessage(error), code: "INTERNAL" },
      { status: 500 },
    );
  }
}
