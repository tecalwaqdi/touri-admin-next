"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * City single-image replace / archive — Legacy villages.img.
 * Real Production upload remains gate-controlled (STORAGE hard-false + write flags).
 */
export function CityImageActions({
  cityId,
  imagePresence,
  onUpdated,
}: {
  cityId: string;
  imagePresence: "present" | "missing" | "unavailable";
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  if (!canWrite || !isControlledWriteChromeEnabled()) return null;

  const run = async (
    action: "replace_city_image" | "archive_city_image",
    file?: File,
  ) => {
    if (inFlight.current) return;
    if (action === "replace_city_image") {
      if (!file) {
        setError(t("error"));
        return;
      }
      if (!ALLOWED.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
        setError(t("error"));
        return;
      }
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/storage/cities/${encodeURIComponent(cityId)}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": `city-img-${action}-${cityId}-${Date.now()}`,
          },
          body: JSON.stringify({
            action,
            slotOrIndex: "0",
            mimeType: file?.type,
            sizeBytes: file?.size,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        setError(json.message ?? json.error ?? json.code ?? t("error"));
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirmArchive(false);
      if (file) {
        const url = URL.createObjectURL(file);
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url, name: file.name };
        });
      } else {
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return null;
        });
      }
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const slotPresent = preview != null || imagePresence === "present";

  return (
    <section
      data-testid="city-image-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{t("image")}</h3>
      <p className={`mb-3 ${adminUi.caption}`}>{t("cityImageHint")}</p>
      <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
      <div
        className="max-w-xs rounded-md border border-slate-200 p-3"
        data-testid="city-image-slot"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.url}
            alt={preview.name}
            className="mb-2 h-32 w-full rounded object-cover"
            data-testid="city-image-local-preview"
          />
        ) : (
          <div className="mb-2 flex h-32 items-center justify-center rounded bg-slate-50 text-xs text-slate-400">
            {slotPresent ? t("image") : "—"}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="city-image-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              const url = URL.createObjectURL(file);
              setPreview((prev) => {
                if (prev) URL.revokeObjectURL(prev.url);
                return { url, name: file.name };
              });
              void run("replace_city_image", file);
            }
          }}
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={adminUi.btnSecondary}
            disabled={pending}
            data-testid="city-image-replace"
            onClick={() => fileRef.current?.click()}
          >
            {t("replaceImage")}
          </button>
          {slotPresent ? (
            <button
              type="button"
              className={adminUi.btnGhost}
              disabled={pending}
              data-testid="city-image-archive"
              onClick={() => setConfirmArchive(true)}
            >
              {t("archiveImage")}
            </button>
          ) : null}
        </div>
      </div>
      {confirmArchive ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="city-image-archive"
          confirmTemplateKey="confirmGeographyWrite"
          actionLabelKey="archiveImage"
          targetId={cityId}
          stateLabel={imagePresence}
          pending={pending}
          onConfirm={() => void run("archive_city_image")}
          onCancel={() => setConfirmArchive(false)}
        />
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {success}
        </p>
      ) : null}
    </section>
  );
}
