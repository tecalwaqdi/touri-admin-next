import {
  requirePermission,
  resolveApiActor,
  UnauthorizedError,
} from "@/infrastructure/http/apiAuth";
import { AuthorizationError } from "@/permissions/guards";
import {
  productionReadPathActive,
  productionReadDisabledResponse,
  mapProductionReadError,
} from "@/infrastructure/http/shadowApi";
import { readLandmarkImage } from "@/application/storage/ReadLandmarkImage";
import { getProductionOperationalReadRuntime } from "@/infrastructure/production/runtime/ProductionOperationalReadRuntime";
import { WifDriverDocumentRepository } from "@/infrastructure/production/storage/WifDriverDocumentRepository";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";

export async function GET(
  request: Request,
  context: { params: Promise<{ landmarkId: string; slot: string }> },
) {
  try {
    const ctx = await resolveApiActor(request);
    await requirePermission(ctx, "agents:read");
    if (!productionReadPathActive()) return productionReadDisabledResponse();
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
    const params = await context.params;
    const runtime = await getProductionOperationalReadRuntime();
    const result = await readLandmarkImage(
      { ...params, bucket, scope: ctx.user.scope },
      {
        client: runtime.client,
        documents: new WifDriverDocumentRepository(bucket),
      },
    );
    return new Response(result.body as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Content-Disposition": 'inline; filename="landmark-image"',
        "x-correlation-id": ctx.correlationId,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ code: error.code }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ code: error.code }, { status: 403 });
    }
    if (error instanceof DriverDocumentError) {
      return Response.json({ code: error.code }, { status: error.status });
    }
    return mapProductionReadError(error);
  }
}
