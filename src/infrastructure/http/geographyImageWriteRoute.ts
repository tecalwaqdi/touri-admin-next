/**
 * Shared POST handler helpers for geography image replace/archive routes.
 */

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
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import {
  executeStorageControlledAction,
  type StorageWriteAction,
  type StorageWriteFlagGate,
} from "@/domain/storage/StorageControlledWorkflows";
import {
  executeGeographyImageProductionWrite,
  type GeographyImageWriteCommand,
} from "@/application/storage/ExecuteGeographyImageWrite";
import type { GeographyImageOwnerKind } from "@/domain/storage/GeographyImageFields";
import { createWifWritePortOrThrow } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { WifGeographyImageObjectStore } from "@/infrastructure/production/storage/WifGeographyImageObjectStore";

type ParsedImageWriteBody = {
  action: StorageWriteAction;
  slotOrIndex: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  bytes?: Uint8Array;
};

async function parseImageWriteRequest(
  request: Request,
  defaultAction: StorageWriteAction,
): Promise<ParsedImageWriteBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const actionRaw = String(form.get("action") ?? defaultAction);
    const slotOrIndex = String(form.get("slotOrIndex") ?? "0");
    const file = form.get("file");
    let bytes: Uint8Array | undefined;
    let mimeType: string | undefined;
    let sizeBytes: number | undefined;
    if (file instanceof File) {
      const buf = new Uint8Array(await file.arrayBuffer());
      bytes = buf;
      mimeType = file.type || undefined;
      sizeBytes = buf.byteLength;
    }
    return {
      action: actionRaw as StorageWriteAction,
      slotOrIndex,
      mimeType,
      sizeBytes,
      storagePath: form.get("storagePath")
        ? String(form.get("storagePath"))
        : undefined,
      bytes,
    };
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: StorageWriteAction;
    slotOrIndex?: string;
    mimeType?: string;
    sizeBytes?: number;
    storagePath?: string;
    /** Optional base64 payload when JSON is used. */
    contentBase64?: string;
  };
  let bytes: Uint8Array | undefined;
  if (typeof body.contentBase64 === "string" && body.contentBase64.trim()) {
    const bin = atob(body.contentBase64.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    bytes = out;
  }
  return {
    action: body.action ?? defaultAction,
    slotOrIndex: body.slotOrIndex ?? "0",
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes ?? bytes?.byteLength,
    storagePath: body.storagePath,
    bytes,
  };
}

function storageFlagsFromEnv(): StorageWriteFlagGate {
  const env = getEnv();
  return {
    GLOBAL_PRODUCTION_WRITE_ENABLED: env.GLOBAL_PRODUCTION_WRITE_ENABLED,
    PRODUCTION_WRITE_ENABLED: env.PRODUCTION_WRITE_ENABLED,
    GEOGRAPHY_WRITE_ENABLED: env.GEOGRAPHY_WRITE_ENABLED,
    REGION_WRITE_ENABLED: env.REGION_WRITE_ENABLED,
    PARTNER_WRITE_ENABLED: env.PARTNER_WRITE_ENABLED,
    DRIVER_WRITE_ENABLED: env.DRIVER_WRITE_ENABLED,
  };
}

export async function handleGeographyImageWritePost(input: {
  request: Request;
  kind: GeographyImageOwnerKind;
  ownerId: string;
  defaultAction: StorageWriteAction;
}): Promise<Response> {
  const trap = maybeShadowTrapResponse(input.request);
  if (trap) return trap;

  try {
    const ctx = await resolveApiActor(input.request);
    await requirePermission(ctx, "agents:manage");

    const parsed = await parseImageWriteRequest(
      input.request,
      input.defaultAction,
    );
    const flags = storageFlagsFromEnv();
    const env = getEnv();
    const idempotencyKey =
      ctx.idempotencyKey ??
      input.request.headers.get("idempotency-key") ??
      createIdempotencyKey(`geo-img-${input.kind}-${input.ownerId}`);

    const command: GeographyImageWriteCommand = {
      actorUid: ctx.user.id,
      action: parsed.action as GeographyImageWriteCommand["action"],
      kind: input.kind,
      ownerId: input.ownerId,
      slotOrIndex: parsed.slotOrIndex,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      idempotencyKey,
      correlationId: ctx.correlationId,
      clientStoragePath: parsed.storagePath,
      bytes: parsed.bytes,
    };

    const allowOffline =
      env.APP_ENV === "development" &&
      env.PRODUCTION_READ_MODE === "disabled" &&
      isControlledWriteChromeEnabled();

    if (allowOffline) {
      const result = executeStorageControlledAction(command, {
        allowOfflineExecution: true,
        flags,
      });
      return jsonWithIds(
        { ...result, productionArmed: false, realUploadPerformed: false },
        ctx,
      );
    }

    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
    if (!bucket) {
      return Response.json(
        {
          error: "Storage bucket not configured",
          code: "STORAGE_UNAVAILABLE",
          realUploadPerformed: false,
        },
        { status: 503 },
      );
    }

    const result = await executeGeographyImageProductionWrite(command, {
      flags,
      bucket,
      firestore: createWifWritePortOrThrow("ops_writer"),
      objects: new WifGeographyImageObjectStore(bucket),
    });

    if (!result.ok) {
      const status =
        result.code === "PRODUCTION_WRITE_DISABLED"
          ? 503
          : result.code === "NOT_FOUND"
            ? 404
            : result.code === "VALIDATION_FAILED" ||
                result.code === "ARBITRARY_STORAGE_PATH_FORBIDDEN"
              ? 400
              : 503;
      return Response.json(
        {
          error: result.message,
          code: result.code,
          realUploadPerformed: result.realUploadPerformed,
        },
        { status },
      );
    }

    return jsonWithIds(
      {
        ...result,
        productionArmed: true,
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
