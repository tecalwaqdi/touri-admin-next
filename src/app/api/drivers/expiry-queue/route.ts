import {
  jsonWithIds,
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import {
  buildDriverDocExpiryQueue,
  type DriverDocExpiryItem,
} from "@/application/controlled-writes/drivers-create/DriverCreateService";
import { resolveAdminDataSourceLabel } from "@/domain/production-read/SourceLabel";

/**
 * Doc expiry queue — returns empty bounded sample when Production read is off.
 * Populated from Production driver document slots when read path is armed.
 */
export async function GET(request: Request) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "drivers:read");

    const items: DriverDocExpiryItem[] = buildDriverDocExpiryQueue([]);

    return jsonWithIds(
      {
        items,
        accuracy: "unavailable" as const,
        sourceLabel: resolveAdminDataSourceLabel({ unavailable: true }),
        note: "Expiry queue ready; requires Production driver document reads",
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
