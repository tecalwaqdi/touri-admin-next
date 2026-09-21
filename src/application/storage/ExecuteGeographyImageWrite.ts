/**
 * Production geography image replace/archive — Storage upload + Firestore field patch.
 */

import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { GeographyImageObjectStore } from "@/infrastructure/production/storage/WifGeographyImageObjectStore";
import { GeographyImageStorageError } from "@/infrastructure/production/storage/WifGeographyImageObjectStore";
import {
  areStorageProductionWritesEnabled,
  assertGeographyImageMimeAndSize,
  assertNoArbitraryStoragePath,
  buildCanonicalStoragePath,
  type StorageControlledResult,
  type StorageWriteCommand,
  type StorageWriteFlagGate,
  type StorageWriteAction,
} from "@/domain/storage/StorageControlledWorkflows";
import {
  buildGeographyImageGsUrl,
  geographyImageCollection,
  geographyImageFieldPatch,
  isGeographyImageKind,
  type GeographyImageOwnerKind,
} from "@/domain/storage/GeographyImageFields";

export type GeographyImageWriteCommand = StorageWriteCommand & {
  kind: GeographyImageOwnerKind;
  action: Exclude<StorageWriteAction, "issue_preview_url">;
  /** Required for replace_* actions. */
  bytes?: Uint8Array;
};

export async function executeGeographyImageProductionWrite(
  command: GeographyImageWriteCommand,
  deps: {
    flags: StorageWriteFlagGate;
    bucket: string;
    firestore: ProductionFirestoreWritePort;
    objects: GeographyImageObjectStore;
  },
): Promise<StorageControlledResult> {
  try {
    assertNoArbitraryStoragePath(command.clientStoragePath);
    if (!isGeographyImageKind(command.kind)) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Unsupported storage kind",
        productionWriteExecuted: false,
        realUploadPerformed: false,
      };
    }

    const path = buildCanonicalStoragePath({
      kind: command.kind,
      ownerId: command.ownerId,
      slotOrIndex: command.slotOrIndex,
    });

    if (!areStorageProductionWritesEnabled(deps.flags, command.kind)) {
      return {
        ok: false,
        code: "PRODUCTION_WRITE_DISABLED",
        message: "Storage mutations gated OFF",
        productionWriteExecuted: false,
        realUploadPerformed: false,
        canonicalPath: path,
      };
    }

    const collection = geographyImageCollection(command.kind);
    const existing = await deps.firestore.getDocument(
      collection,
      command.ownerId,
    );
    if (!existing.exists) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Geography document not found",
        productionWriteExecuted: false,
        realUploadPerformed: false,
        canonicalPath: path,
      };
    }

    const isReplace = command.action.startsWith("replace_");
    const isArchive = command.action.startsWith("archive_");
    if (!isReplace && !isArchive) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "Unknown geography image action",
        productionWriteExecuted: false,
        realUploadPerformed: false,
        canonicalPath: path,
      };
    }

    if (isReplace) {
      const mime =
        command.mimeType === "image/jpg" ? "image/jpeg" : command.mimeType;
      const size = command.bytes?.byteLength ?? command.sizeBytes ?? 0;
      if (!mime || !command.bytes) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          message: "Image bytes required for replace",
          productionWriteExecuted: false,
          realUploadPerformed: false,
          canonicalPath: path,
        };
      }
      assertGeographyImageMimeAndSize({ mimeType: mime, sizeBytes: size });
      await deps.objects.upload({
        path,
        bytes: command.bytes,
        contentType: mime,
      });
      const storedReference = buildGeographyImageGsUrl(deps.bucket, path);
      const patch = geographyImageFieldPatch(
        command.kind,
        command.slotOrIndex,
        storedReference,
      );
      await deps.firestore.updateDocument(collection, command.ownerId, patch);
      return {
        ok: true,
        code: "APPLIED",
        message: "Geography image replaced",
        productionWriteExecuted: true,
        realUploadPerformed: true,
        canonicalPath: path,
        storedReference,
      };
    }

    // archive
    try {
      await deps.objects.delete(path);
    } catch (err) {
      if (
        !(err instanceof GeographyImageStorageError) ||
        err.code !== "NOT_FOUND"
      ) {
        // Best-effort delete; still clear Firestore so Admin preview stops.
        if (
          err instanceof GeographyImageStorageError &&
          err.code === "STORAGE_UNAVAILABLE"
        ) {
          // continue — field clear is the user-visible archive
        } else {
          throw err;
        }
      }
    }
    const patch = geographyImageFieldPatch(
      command.kind,
      command.slotOrIndex,
      null,
    );
    await deps.firestore.updateDocument(collection, command.ownerId, patch);
    return {
      ok: true,
      code: "APPLIED",
      message: "Geography image archived",
      productionWriteExecuted: true,
      realUploadPerformed: false,
      canonicalPath: path,
    };
  } catch (err) {
    if (err instanceof GeographyImageStorageError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        productionWriteExecuted: false,
        realUploadPerformed: false,
      };
    }
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "INTERNAL_WRITE_FAILURE";
    return {
      ok: false,
      code,
      message: err instanceof Error ? err.message : String(err),
      productionWriteExecuted: false,
      realUploadPerformed: false,
    };
  }
}
