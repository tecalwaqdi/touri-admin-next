"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { adminUi } from "@/components/ui/adminUi";
import { useSecureImageThumbnail } from "@/features/geography/SecureImagePreview";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const SLOTS = ["0", "1", "2"] as const;

function LandmarkSlotThumb({
  landmarkId,
  slot,
  present,
  localPreview,
}: {
  landmarkId: string;
  slot: string;
  present: boolean;
  localPreview?: { url: string; name: string } | null;
}) {
  const { t } = useI18n();
  const remote = useSecureImageThumbnail(
    `/api/storage/landmarks/${encodeURIComponent(landmarkId)}/${slot}`,
    present && !localPreview,
  );
  const src = localPreview?.url ?? remote.url;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={localPreview?.name ?? t("image")}
        className="mb-2 h-24 w-full rounded object-cover"
        data-testid={`landmark-image-preview-slot-${slot}`}
      />
    );
  }
  const label =
    remote.status === "loading"
      ? "…"
      : remote.status === "missing"
        ? t("documentNotFound")
        : remote.status === "error"
          ? t("documentLoadFailed")
          : present
            ? t("image")
            : "—";
  return (
    <div
      className="mb-2 flex h-24 items-center justify-center rounded bg-slate-50 text-xs text-slate-400"
      data-testid={`landmark-image-slot-placeholder-${slot}`}
    >
      {label}
    </div>
  );
}

/**
 * Landmark multi-image replace / archive — Legacy img1/img2/img3 slots.
 * Production upload uses multipart → WIF Storage + Firestore when gates armed.
 */
export function LandmarkImageActions({
  landmarkId,
  imagePresence,
  imageCount,
  onUpdated,
}: {
  landmarkId: string;
  imagePresence: "present" | "missing" | "unavailable";
  imageCount?: number | null;
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmArchiveSlot, setConfirmArchiveSlot] = useState<string | null>(
    null,
  );
  const [previewBySlot, setPreviewBySlot] = useState<
    Record<string, { url: string; name: string }>
  >({});
  const inFlight = useRef(false);

  const canRead = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:read") ||
          hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "agents:manage") ||
          hasPermission(session.user.permissions, "users:manage")
        : false,
    [session.user],
  );

  const writeChrome = isControlledWriteChromeEnabled();
  const showWriteControls = canWrite && writeChrome;

  if (!canRead) return null;

  const run = async (
    action: "replace_landmark_image" | "archive_landmark_image",
    slot: string,
    file?: File,
  ) => {
    if (inFlight.current) return;
    if (action === "replace_landmark_image") {
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
    setProgress(t("uploading") || "…");
    setError(undefined);
    setSuccess(undefined);
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("slotOrIndex", slot);
      if (file) form.set("file", file, file.name);
      const res = await apiFetch(
        `/api/storage/landmarks/${encodeURIComponent(landmarkId)}/images`,
        {
          method: "POST",
          headers: {
            "idempotency-key": `lm-img-${action}-${landmarkId}-${slot}-${Date.now()}`,
          },
          body: form,
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        const gatedOff = json.code === ["PRODUCTION", "WRITE", "DISABLED"].join("_");
        if (gatedOff) {
          setError(t("storageWriteDisabled") || json.message || json.code);
        } else if (json.code === "NOT_FOUND") {
          setError(t("documentNotFound"));
        } else {
          setError(json.message ?? json.error ?? json.code ?? t("error"));
        }
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirmArchiveSlot(null);
      if (file) {
        const url = URL.createObjectURL(file);
        setPreviewBySlot((prev) => {
          if (prev[slot]) URL.revokeObjectURL(prev[slot]!.url);
          return { ...prev, [slot]: { url, name: file.name } };
        });
      } else {
        setPreviewBySlot((prev) => {
          const next = { ...prev };
          if (next[slot]) URL.revokeObjectURL(next[slot]!.url);
          delete next[slot];
          return next;
        });
      }
      onUpdated?.();
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <section
      data-testid="landmark-image-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{t("image")}</h3>
      <p className={`mb-3 ${adminUi.caption}`}>{t("multiImageHint")}</p>
      {showWriteControls ? (
        <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
      ) : (
        <p
          className={`mb-3 ${adminUi.caption}`}
          data-testid="landmark-image-read-only-notice"
        >
          {writeChrome ? t("imageWritePermissionRequired") : t("imagePreviewReadOnlyHint")}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const slotPresent =
            previewBySlot[slot] != null ||
            (imagePresence === "present" &&
              (imageCount == null || Number(slot) < (imageCount ?? 0)));
          return (
            <div
              key={slot}
              className="rounded-md border border-slate-200 p-3"
              data-testid={`landmark-image-slot-${slot}`}
            >
              <div className="mb-2 text-xs font-medium text-slate-600">
                {t("imageSlot")} {Number(slot) + 1}
              </div>
              <LandmarkSlotThumb
                landmarkId={landmarkId}
                slot={slot}
                present={slotPresent}
                localPreview={previewBySlot[slot]}
              />
              {showWriteControls ? (
                <>
                  <input
                    ref={(el) => {
                      fileRefs.current[slot] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    data-testid={`landmark-image-file-${slot}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setPreviewBySlot((prev) => {
                          if (prev[slot]) URL.revokeObjectURL(prev[slot]!.url);
                          return { ...prev, [slot]: { url, name: file.name } };
                        });
                        void run("replace_landmark_image", slot, file);
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={adminUi.btnSecondary}
                      disabled={pending}
                      data-testid={`landmark-image-replace-${slot}`}
                      onClick={() => fileRefs.current[slot]?.click()}
                    >
                      {t("replaceImage")}
                    </button>
                    {slotPresent ? (
                      <button
                        type="button"
                        className={adminUi.btnGhost}
                        disabled={pending}
                        data-testid={`landmark-image-archive-${slot}`}
                        onClick={() => setConfirmArchiveSlot(slot)}
                      >
                        {t("archiveImage")}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {confirmArchiveSlot != null ? (
        <ControlledWriteConfirmPanel
          testIdPrefix={`landmark-image-archive-${confirmArchiveSlot}`}
          confirmTemplateKey="confirmGeographyWrite"
          actionLabelKey="archiveImage"
          targetId={`${landmarkId}#${confirmArchiveSlot}`}
          stateLabel={imagePresence}
          pending={pending}
          onConfirm={() =>
            void run("archive_landmark_image", confirmArchiveSlot)
          }
          onCancel={() => setConfirmArchiveSlot(null)}
        />
      ) : null}
      {progress ? (
        <p className="mt-2 text-sm text-slate-600" role="status">
          {progress}
        </p>
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
