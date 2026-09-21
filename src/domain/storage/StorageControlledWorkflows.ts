/**
 * Controlled storage workflows — no arbitrary Storage paths.
 * Driver document preview + landmark/city/country/region image replace/archive.
 */

export type StorageResourceKind =
  | "driver_document"
  | "landmark_image"
  | "city_image"
  | "country_image"
  | "region_image";

export type DriverDocumentSlot =
  | "national_id"
  | "license"
  | "vehicle_registration"
  | "profile_photo"
  | "other";

export type StorageWriteAction =
  | "issue_preview_url"
  | "replace_landmark_image"
  | "archive_landmark_image"
  | "replace_city_image"
  | "archive_city_image"
  | "replace_country_image"
  | "archive_country_image"
  | "replace_region_image"
  | "archive_region_image";

export type StorageWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: boolean;
  PRODUCTION_WRITE_ENABLED: boolean;
  /** Landmark/city/country/region image mutations share GEOGRAPHY / PARTNER gates by resource. */
  GEOGRAPHY_WRITE_ENABLED: boolean;
  /** Narrow region gate — required when kind === region_image. */
  REGION_WRITE_ENABLED?: boolean;
  PARTNER_WRITE_ENABLED: boolean;
  /** Driver doc preview is read-ish but still gated for signed URL issuance in prod. */
  DRIVER_WRITE_ENABLED: boolean;
};

export const DEFAULT_STORAGE_WRITE_FLAGS_FALSE: StorageWriteFlagGate = {
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  PRODUCTION_WRITE_ENABLED: false,
  GEOGRAPHY_WRITE_ENABLED: false,
  REGION_WRITE_ENABLED: false,
  PARTNER_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
};

/**
 * Historical inventory constant — remains false in docs/tests.
 * Production geography image writes are armed via env flags
 * (GLOBAL + PRODUCTION + GEOGRAPHY[+REGION]), same pattern as
 * GeographyControlledWriteService (HARD_FALSE not consulted at runtime).
 */
export const STORAGE_WRITE_PRODUCTION_HARD_FALSE = false as const;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const GEOGRAPHY_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_BYTES = 8 * 1024 * 1024;

export function assertStorageMimeAndSize(input: {
  mimeType: string;
  sizeBytes: number;
}): void {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw Object.assign(new Error("Unsupported mime type"), {
      code: "VALIDATION_FAILED",
    });
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
    throw Object.assign(new Error("File size out of bounds"), {
      code: "VALIDATION_FAILED",
    });
  }
}

/** Geography cover/gallery images — JPG/PNG/WEBP only (no PDF). */
export function assertGeographyImageMimeAndSize(input: {
  mimeType: string;
  sizeBytes: number;
}): void {
  const mime = input.mimeType === "image/jpg" ? "image/jpeg" : input.mimeType;
  if (!GEOGRAPHY_IMAGE_MIME.has(mime)) {
    throw Object.assign(new Error("Unsupported mime type"), {
      code: "VALIDATION_FAILED",
    });
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
    throw Object.assign(new Error("File size out of bounds"), {
      code: "VALIDATION_FAILED",
    });
  }
}

/** Env-flag gate for Storage mutations (no HARD_FALSE always-deny). */
export function areStorageProductionWritesEnabled(
  flags: StorageWriteFlagGate,
  kind: StorageResourceKind,
): boolean {
  if (
    !flags.GLOBAL_PRODUCTION_WRITE_ENABLED ||
    !flags.PRODUCTION_WRITE_ENABLED
  ) {
    return false;
  }
  if (kind === "driver_document") {
    return flags.DRIVER_WRITE_ENABLED === true;
  }
  if (
    kind === "landmark_image" ||
    kind === "city_image" ||
    kind === "country_image"
  ) {
    return flags.GEOGRAPHY_WRITE_ENABLED === true;
  }
  if (kind === "region_image") {
    return (
      flags.GEOGRAPHY_WRITE_ENABLED === true &&
      flags.REGION_WRITE_ENABLED === true
    );
  }
  return false;
}

/** Canonical object path builder — rejects client absolute paths. */
export function buildCanonicalStoragePath(input: {
  kind: StorageResourceKind;
  ownerId: string;
  slotOrIndex: string;
}): string {
  const owner = input.ownerId.trim();
  const slot = input.slotOrIndex.trim();
  if (!owner || owner.includes("/") || owner.includes("..")) {
    throw Object.assign(new Error("Invalid ownerId"), {
      code: "VALIDATION_FAILED",
    });
  }
  if (!slot || slot.includes("/") || slot.includes("..")) {
    throw Object.assign(new Error("Invalid slot"), {
      code: "VALIDATION_FAILED",
    });
  }
  if (input.kind === "driver_document") {
    return `drivers/${owner}/documents/${slot}`;
  }
  if (input.kind === "city_image") {
    return `cities/${owner}/images/${slot}`;
  }
  if (input.kind === "country_image") {
    return `countries/${owner}/images/${slot}`;
  }
  if (input.kind === "region_image") {
    return `regions/${owner}/images/${slot}`;
  }
  return `landmarks/${owner}/images/${slot}`;
}

export function assertNoArbitraryStoragePath(clientPath: unknown): void {
  if (typeof clientPath === "string" && clientPath.trim()) {
    throw Object.assign(
      new Error("Client-supplied Storage paths are forbidden"),
      { code: "ARBITRARY_STORAGE_PATH_FORBIDDEN" },
    );
  }
}

export type StorageControlledResult = {
  ok: boolean;
  code: string;
  message: string;
  productionWriteExecuted: boolean;
  previewUrl?: string;
  canonicalPath?: string;
  realUploadPerformed: boolean;
  storedReference?: string;
};

export type StorageWriteCommand = {
  actorUid: string;
  action: StorageWriteAction;
  kind: StorageResourceKind;
  ownerId: string;
  slotOrIndex: string;
  mimeType?: string;
  sizeBytes?: number;
  idempotencyKey: string;
  correlationId: string;
  /** Forbidden if present */
  clientStoragePath?: unknown;
};

/** Offline Fake storage service — no GCS / Firebase Storage. */
export function executeStorageControlledAction(
  command: StorageWriteCommand,
  opts?: { allowOfflineExecution?: boolean; flags?: StorageWriteFlagGate },
): StorageControlledResult {
  try {
    assertNoArbitraryStoragePath(command.clientStoragePath);
    const path = buildCanonicalStoragePath({
      kind: command.kind,
      ownerId: command.ownerId,
      slotOrIndex: command.slotOrIndex,
    });

    if (command.action !== "issue_preview_url") {
      if (command.mimeType != null && command.sizeBytes != null) {
        assertStorageMimeAndSize({
          mimeType: command.mimeType,
          sizeBytes: command.sizeBytes,
        });
      }
    }

    const flags = opts?.flags ?? DEFAULT_STORAGE_WRITE_FLAGS_FALSE;
    if (!opts?.allowOfflineExecution) {
      if (!areStorageProductionWritesEnabled(flags, command.kind)) {
        return {
          ok: false,
          code: "PRODUCTION_WRITE_DISABLED",
          message: "Storage mutations gated OFF",
          productionWriteExecuted: false,
          realUploadPerformed: false,
          canonicalPath: path,
        };
      }
    }

    if (command.action === "issue_preview_url") {
      return {
        ok: true,
        code: "APPLIED",
        message: "Fake signed preview URL (offline)",
        productionWriteExecuted: false,
        previewUrl: `https://storage.fake.local/${path}?sig=fake`,
        canonicalPath: path,
        realUploadPerformed: false,
      };
    }

    return {
      ok: true,
      code: "APPLIED",
      message: `Fake ${command.action} applied (no Production upload)`,
      productionWriteExecuted: false,
      canonicalPath: path,
      realUploadPerformed: false,
    };
  } catch (err) {
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
