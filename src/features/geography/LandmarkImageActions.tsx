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
const SLOTS = ["0", "1", "2"] as const;

/**
 * Landmark multi-image replace / archive — Legacy img1/img2/img3 slots.
 * Real Production upload remains gate-controlled (no fake URLs invented).
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
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmArchiveSlot, setConfirmArchiveSlot] = useState<string | null>(
    null,
  );
  const [previewBySlot, setPreviewBySlot] = useState<
    Record<string, { url: string; name: string }>
  >({});
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
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(
        `/api/storage/landmarks/${encodeURIComponent(landmarkId)}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "idempotency-key": `lm-img-${action}-${landmarkId}-${slot}-${Date.now()}`,
          },
          body: JSON.stringify({
            action,
            slotOrIndex: slot,
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
    }
  };

  return (
    <section
      data-testid="landmark-image-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{t("image")}</h3>
      <p className={`mb-3 ${adminUi.caption}`}>{t("multiImageHint")}</p>
      <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
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
              {previewBySlot[slot] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewBySlot[slot]!.url}
                  alt={previewBySlot[slot]!.name}
                  className="mb-2 h-24 w-full rounded object-cover"
                  data-testid={`landmark-image-preview-slot-${slot}`}
                />
              ) : (
                <div className="mb-2 flex h-24 items-center justify-center rounded bg-slate-50 text-xs text-slate-400">
                  {slotPresent ? t("image") : "—"}
                </div>
              )}
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
