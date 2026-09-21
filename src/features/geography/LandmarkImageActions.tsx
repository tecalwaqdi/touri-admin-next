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
 * Landmark image replace / archive — uses controlled Storage API.
 * Real Production upload remains gate-controlled (no fake URLs invented).
 */
export function LandmarkImageActions({
  landmarkId,
  imagePresence,
  onUpdated,
}: {
  landmarkId: string;
  imagePresence: "present" | "missing" | "unavailable";
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmArchive, setConfirmArchive] = useState(false);
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

  const run = async (action: "replace_landmark_image" | "archive_landmark_image", file?: File) => {
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
            "idempotency-key": `lm-img-${action}-${landmarkId}-${Date.now()}`,
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
      <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="landmark-image-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void run("replace_landmark_image", file);
          }}
        />
        <button
          type="button"
          className={adminUi.btnSecondary}
          disabled={pending}
          data-testid="landmark-image-replace"
          onClick={() => fileRef.current?.click()}
        >
          {imagePresence === "present" ? t("replaceImage") : t("replaceImage")}
        </button>
        {imagePresence === "present" ? (
          <button
            type="button"
            className={adminUi.btnGhost}
            disabled={pending}
            data-testid="landmark-image-archive"
            onClick={() => setConfirmArchive(true)}
          >
            {t("archiveImage")}
          </button>
        ) : null}
      </div>
      {confirmArchive ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="landmark-image-archive"
          confirmTemplateKey="confirmGeographyWrite"
          actionLabelKey="archiveImage"
          targetId={landmarkId}
          stateLabel={imagePresence}
          pending={pending}
          onConfirm={() => void run("archive_landmark_image")}
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
