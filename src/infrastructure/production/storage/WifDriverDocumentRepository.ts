import type { DriverDocumentRepository } from "@/repositories/interfaces/DriverDocumentRepository";
import { createVercelOidcWifAuthClient, resolveVercelOidcWifConfig } from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import { DriverDocumentError } from "@/domain/storage/DriverDocumentReference";
const MAX_BYTES = 15 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export class WifDriverDocumentRepository implements DriverDocumentRepository {
  constructor(private readonly bucket: string) {}
  async read(path: string) {
    const config = resolveVercelOidcWifConfig();
    if (config.status !== "ready" || !config.config || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
    try {
      const token = await createVercelOidcWifAuthClient(config.config).getAccessToken();
      if (!token.token) throw new Error("WIF unavailable");
      const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(path)}`;
      const headers = { Authorization: `Bearer ${token.token}` };
      const metadata = await fetch(base, { headers, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (metadata.status === 404) throw new DriverDocumentError("NOT_FOUND", 404);
      if (!metadata.ok) throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
      const meta = await metadata.json() as { size?: string; contentType?: string; generation?: string };
      const size = Number(meta.size);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES || !TYPES.has(meta.contentType ?? "") || !meta.generation) throw new DriverDocumentError("DOCUMENT_REFERENCE_INVALID", 503);
      const media = await fetch(`${base}?alt=media&generation=${encodeURIComponent(meta.generation)}`, { headers, redirect: "error", signal: AbortSignal.timeout(30000), cache: "no-store" });
      if (!media.ok || !media.body) throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
      let seen = 0;
      const body = media.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { seen += chunk.byteLength; if (seen > MAX_BYTES) { controller.error(new Error("Document exceeds limit")); return; } controller.enqueue(chunk); } }));
      return { body, contentType: meta.contentType! };
    } catch (error) {
      if (error instanceof DriverDocumentError) throw error;
      // Upstream exceptions can contain request headers; never forward or log.
      throw new DriverDocumentError("STORAGE_UNAVAILABLE", 503);
    }
  }
}
