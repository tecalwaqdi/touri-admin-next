"use client";

import { useEffect, useRef, useState } from "react";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { adminUi } from "@/components/ui/adminUi";

const PREVIEW_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Secure proxied image/document preview via Admin Storage API (blob CSP).
 * Maps 404 → documentNotFound, other failures → documentLoadFailed / previewUnavailable.
 */
export function SecureImagePreviewButton({
  apiPath,
  testIdPrefix = "secure-image",
}: {
  apiPath: string;
  testIdPrefix?: string;
}) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  return (
    <>
      <button
        type="button"
        data-testid={`${testIdPrefix}-preview-btn`}
        className={`${adminUi.btnGhost} mt-2`}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void (async () => {
            try {
              const res = await apiFetch(apiPath);
              if (res.status === 404) {
                setMessage(t("documentNotFound"));
                return;
              }
              if (!res.ok) {
                setMessage(t("documentLoadFailed") || t("previewUnavailable"));
                return;
              }
              const blob = await res.blob();
              if (!PREVIEW_TYPES.has(blob.type)) {
                setMessage(t("previewUnavailable"));
                return;
              }
              setPreview({ url: URL.createObjectURL(blob), type: blob.type });
              dialog.current?.showModal();
            } catch {
              setMessage(t("previewUnavailable"));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? t("loading") || "…" : t("previewDocument")}
      </button>
      {message ? (
        <p className="mt-1 text-xs text-slate-500" role="status">
          {message}
        </p>
      ) : null}
      <dialog
        ref={dialog}
        className="m-auto max-h-[90dvh] w-[min(92vw,60rem)] rounded-xl p-4 backdrop:bg-black/50"
        aria-label={t("previewDocument")}
        onClose={() => setPreview(null)}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t("previewDocument")}</h2>
          <button
            type="button"
            className={adminUi.btnGhost}
            onClick={() => dialog.current?.close()}
          >
            {locale === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
        {preview ? (
          preview.type === "application/pdf" ? (
            <iframe
              className="h-[70dvh] w-full"
              src={preview.url}
              title={t("previewDocument")}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-testid={`${testIdPrefix}-preview`}
              className="mx-auto max-h-[70dvh] max-w-full object-contain"
              src={preview.url}
              alt={t("previewDocument")}
            />
          )
        ) : null}
      </dialog>
    </>
  );
}

/** Load a secure Storage proxy thumbnail into a blob URL. */
export function useSecureImageThumbnail(
  apiPath: string | null,
  enabled: boolean,
): {
  url: string | null;
  status: "idle" | "loading" | "ready" | "missing" | "error";
} {
  const apiFetch = useApiFetch();
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "ready" | "missing" | "error"
  >("idle");

  useEffect(() => {
    if (!enabled || !apiPath) {
      setStatus("idle");
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setStatus("loading");
    void (async () => {
      try {
        const res = await apiFetch(apiPath);
        if (cancelled) return;
        if (res.status === 404) {
          setStatus("missing");
          setUrl(null);
          return;
        }
        if (!res.ok) {
          setStatus("error");
          setUrl(null);
          return;
        }
        const blob = await res.blob();
        if (!PREVIEW_TYPES.has(blob.type) || blob.type === "application/pdf") {
          setStatus("error");
          setUrl(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [apiFetch, apiPath, enabled]);

  return { url, status };
}
