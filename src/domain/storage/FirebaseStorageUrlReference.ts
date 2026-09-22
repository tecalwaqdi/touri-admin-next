/** Parse Legacy Firebase Storage references into GCS object paths (no client paths). */
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";

function projectIdFromBucket(bucket: string): string | null {
  const b = bucket.trim();
  if (!b) return null;
  if (b.endsWith(".appspot.com")) return b.slice(0, -".appspot.com".length);
  if (b.endsWith(".firebasestorage.app")) {
    return b.slice(0, -".firebasestorage.app".length);
  }
  return null;
}

/** Same Firebase project may use appspot vs firebasestorage.app bucket names in Legacy URLs. */
export function firebaseStorageBucketsEquivalent(
  urlBucket: string,
  configuredBucket: string,
): boolean {
  const a = urlBucket.trim();
  const b = configuredBucket.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = projectIdFromBucket(a);
  const pb = projectIdFromBucket(b);
  return pa != null && pa === pb;
}

function assertSafeObjectPath(path: string): string {
  if (
    !path ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    /[\\\u0000-\u001f]/.test(path)
  ) {
    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }
  return path;
}

/**
 * Resolve a Legacy img/img1 URL or gs:// reference to a GCS object path
 * using the configured Admin bucket (WIF reads use configured bucket name).
 */
export function resolveFirebaseStorageObjectPath(
  value: string,
  configuredBucket: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DriverDocumentError("NOT_FOUND", 404);
  }

  if (trimmed.startsWith("gs://")) {
    const without = trimmed.slice("gs://".length);
    const slash = without.indexOf("/");
    if (slash <= 0) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    const urlBucket = without.slice(0, slash);
    if (!firebaseStorageBucketsEquivalent(urlBucket, configuredBucket)) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    return assertSafeObjectPath(without.slice(slash + 1));
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }
    if (url.port || url.username) {
      throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
    }

    if (url.hostname === "firebasestorage.googleapis.com") {
      const prefix = "/v0/b/";
      const mid = "/o/";
      if (!url.pathname.startsWith(prefix)) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      const rest = url.pathname.slice(prefix.length);
      const oIdx = rest.indexOf(mid);
      if (oIdx <= 0) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      const urlBucket = decodeURIComponent(rest.slice(0, oIdx));
      if (!firebaseStorageBucketsEquivalent(urlBucket, configuredBucket)) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      try {
        return assertSafeObjectPath(
          decodeURIComponent(rest.slice(oIdx + mid.length)),
        );
      } catch {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
    }

    if (url.hostname.endsWith(".firebasestorage.app")) {
      const urlBucket = url.hostname;
      if (!firebaseStorageBucketsEquivalent(urlBucket, configuredBucket)) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      const oPrefix = "/o/";
      if (!url.pathname.startsWith(oPrefix)) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      try {
        return assertSafeObjectPath(
          decodeURIComponent(url.pathname.slice(oPrefix.length)),
        );
      } catch {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
    }

    throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
  }

  throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
}
