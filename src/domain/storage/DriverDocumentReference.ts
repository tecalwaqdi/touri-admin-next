/** Resolve persisted document references only; never fetch a client-supplied URL. */
export class DriverDocumentError extends Error {
  constructor(readonly code: "VALIDATION_FAILED" | "NOT_FOUND" | "DOCUMENT_REFERENCE_INVALID" | "STORAGE_UNAVAILABLE", readonly status: number) { super(code); }
}
const fields: Record<string, string[]> = {
  national_id: ["doc_national_id", "img_id_rksh"],
  license: ["doc_driver_license", "doc_driver_license_front", "img_id"],
  driver_license: ["doc_driver_license", "doc_driver_license_front", "img_id"],
  driver_license_back: ["doc_driver_license_back"],
  vehicle_registration: ["doc_vehicle_registration", "img_id_car"],
  vehicle_insurance: ["doc_vehicle_insurance"],
  profile_photo: ["doc_profile_photo", "photo_storage_path", "photo_url"],
  vehicle_photo: ["doc_vehicle_photo"],
};
export function resolveDriverDocumentPath(data: Record<string, unknown>, driverId: string, slot: string, bucket: string): string {
  if (!driverId || /[\\/\u0000]/.test(driverId) || !Object.hasOwn(fields, slot)) throw new DriverDocumentError("VALIDATION_FAILED", 400);
  let raw: unknown;
  for (const key of fields[slot]) {
    const value = data[key];
    const candidate = value && typeof value === "object" ? (value as Record<string, unknown>).storagePath || (value as Record<string, unknown>).url : value;
    if (typeof candidate === "string" && candidate.trim()) { raw = candidate.trim(); break; }
  }
  if (typeof raw !== "string") throw new DriverDocumentError("NOT_FOUND", 404);
  let path = raw;
  if (raw.startsWith("https://")) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503); }
    // Download tokens in historical URLs are not returned or used for access.
    const prefix = `/v0/b/${bucket}/o/`;
    if (url.hostname !== "firebasestorage.googleapis.com" || url.port || url.username || !url.pathname.startsWith(prefix)) throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    try { path = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503); }
  } else if (raw.startsWith("gs://")) {
    if (!raw.startsWith(`gs://${bucket}/`)) throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    path = raw.slice(`gs://${bucket}/`.length);
  }
  if (!path.startsWith(`users/${driverId}/`) || path.split("/").some(p => !p || p === "." || p === "..") || /[\\\u0000-\u001f]/.test(path)) throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  return path;
}
