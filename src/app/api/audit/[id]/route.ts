import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { getRepositories } from "@/repositories/container";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "audit:read");
    const { id } = await context.params;
    const event = await getRepositories().audit.getById(id);
    if (!event) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    // Safe formatting — omit secret-like keys if present
    const safe = JSON.parse(
      JSON.stringify(event, (key, value) => {
        if (/password|secret|token|credential/i.test(key)) return "[redacted]";
        return value;
      }),
    );
    return jsonWithIds(safe, ctx);
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
