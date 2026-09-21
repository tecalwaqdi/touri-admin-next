/** Resolve persisted document references only; never fetch a client-supplied URL. */
export class DriverDocumentError extends Error {
  constructor(
    readonly code:
      | "VALIDATION_FAILED"
      | "NOT_FOUND"
      | "DOCUMENT_REFERENCE_INVALID"
      | "STORAGE_UNAVAILABLE",
    readonly status: number,
  ) {
    super(code);
  }
}

const fields: Record<string, string[]> = {
  national_id: ["doc_national_id", "img_id_rksh", "ID_image"],
  license: ["doc_driver_license", "doc_driver_license_front", "img_id", "license_image"],
  driver_license: [
    "doc_driver_license",
    "doc_driver_license_front",
    "img_id",
    "license_image",
  ],
  driver_license_back: ["doc_driver_license_back"],
  vehicle_registration: ["doc_vehicle_registration", "img_id_car", "car_image"],
  vehicle_insurance: ["doc_vehicle_insurance"],
  profile_photo: [
    "doc_profile_photo",
    "photo_storage_path",
    "photo_url",
    "photoUrl",
  ],
  vehicle_photo: ["doc_vehicle_photo", "img_id_car", "car_image"],
};

function candidateFromValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of [
      "storagePath",
      "storage_path",
      "path",
      "url",
      "downloadURL",
      "downloadUrl",
    ]) {
      const c = o[key];
      if (typeof c === "string" && c.trim()) return c.trim();
    }
  }
  return null;
}

function assertSafeObjectPath(path: string, driverId: string): string {
  if (
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\\\u0000-\u001f]/.test(path)
  ) {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }
  // Canonical V2 + historical uploads live under users/{driverId}/…
  if (path.startsWith(`users/${driverId}/`)) return path;
  // Some legacy rows store users/{uid}/… when uid === document id; already covered.
  // Reject cross-user paths.
  if (path.startsWith("users/") && !path.startsWith(`users/${driverId}/`)) {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }
  throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
}

export function resolveDriverDocumentPath(
  data: Record<string, unknown>,
  driverId: string,
  slot: string,
  bucket: string,
): string {
  if (!driverId || /[\\/\u0000]/.test(driverId) || !Object.hasOwn(fields, slot)) {
    throw new DriverDocumentError("VALIDATION_FAILED", 400);
  }
  let raw: string | null = null;
  for (const key of fields[slot]) {
    const candidate = candidateFromValue(data[key]);
    if (candidate) {
      raw = candidate;
      break;
    }
  }
  if (!raw) throw new DriverDocumentError("NOT_FOUND", 404);

  let path = raw;
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    // Download tokens in historical URLs are not returned or used for access.
    const prefix = `/v0/b/${bucket}/o/`;
    if (
      url.hostname !== "firebasestorage.googleapis.com" ||
      url.port ||
      url.username ||
      !url.pathname.startsWith(prefix)
    ) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    try {
      path = decodeURIComponent(url.pathname.slice(prefix.length));
    } catch {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
  } else if (raw.startsWith("gs://")) {
    if (!raw.startsWith(`gs://${bucket}/`)) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    path = raw.slice(`gs://${bucket}/`.length);
  }

  return assertSafeObjectPath(path, driverId);
}
