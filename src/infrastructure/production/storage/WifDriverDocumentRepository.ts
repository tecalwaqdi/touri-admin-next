import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import {
  createVercelOidcWifAuthClient,
  resolveVercelOidcWifConfig,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";

const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function normalizeContentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const base = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!base) return null;
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

function sniffContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  return null;
}

export class WifDriverDocumentRepository implements DriverDocumentRepository {
  constructor(private readonly bucket: string) {}
  async read(path: string) {
    const config = resolveVercelOidcWifConfig();
    if (
      config.status !== "ready" ||
      !config.config ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
    }
    try {
      const token = await createVercelOidcWifAuthClient(
        config.config,
      ).getAccessToken();
      if (!token.token) throw new Error("WIF unavailable");
      const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(path)}`;
      const headers = { Authorization: `Bearer ${token.token}` };
      const metadata = await fetch(base, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (metadata.status === 404) {
        throw new DriverDocumentError("NOT_FOUND", 404);
      }
      if (!metadata.ok) {
        throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
      }
      const meta = (await metadata.json()) as {
        size?: string;
        contentType?: string;
        generation?: string;
      };
      const size = Number(meta.size);
      if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        size > MAX_BYTES ||
        !meta.generation
      ) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      let contentType = normalizeContentType(meta.contentType);
      const media = await fetch(
        `${base}?alt=media&generation=${encodeURIComponent(meta.generation)}`,
        {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(30000),
          cache: "no-store",
        },
      );
      if (!media.ok || !media.body) {
        throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
      }

      // Buffer with hard cap so we can sniff when GCS metadata is octet-stream.
      const reader = media.body.getReader();
      const chunks: Uint8Array[] = [];
      let seen = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        seen += value.byteLength;
        if (seen > MAX_BYTES) {
          throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
        }
        chunks.push(value);
      }
      const bodyBytes = new Uint8Array(seen);
      let offset = 0;
      for (const chunk of chunks) {
        bodyBytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (!contentType || !TYPES.has(contentType) || contentType === "application/octet-stream") {
        contentType = sniffContentType(bodyBytes) ?? contentType;
      } else {
        // Prefer magic-byte sniff when GCS metadata disagrees (common Legacy uploads).
        const sniffed = sniffContentType(bodyBytes);
        if (sniffed && sniffed !== contentType) {
          contentType = sniffed;
        }
      }
      if (contentType === "image/jpg") contentType = "image/jpeg";
      if (!contentType || !TYPES.has(contentType)) {
        throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      }
      return {
        body: bodyBytes,
        contentType,
      };
    } catch (error) {
      if (error instanceof DriverDocumentError) throw error;
      // Upstream exceptions can contain request headers; never forward or log.
      throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
    }
  }
}
