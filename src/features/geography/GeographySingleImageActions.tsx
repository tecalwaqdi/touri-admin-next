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

type SingleImageAction =
  | "replace_city_image"
  | "archive_city_image"
  | "replace_country_image"
  | "archive_country_image"
  | "replace_region_image"
  | "archive_region_image";

/**
 * Shared single-slot geography image replace/archive (city/country/region).
 */
export function GeographySingleImageActions({
  ownerId,
  imagePresence,
  imageStorageKind,
  previewApiPath,
  writeApiPath,
  replaceAction,
  archiveAction,
  hintKey,
  testIdPrefix,
  onUpdated,
}: {
  ownerId: string;
  imagePresence: "present" | "missing" | "unavailable";
  imageStorageKind?: string | null;
  previewApiPath: string;
  writeApiPath: string;
  replaceAction: SingleImageAction;
  archiveAction: SingleImageAction;
  hintKey: "cityImageHint" | "countryImageHint" | "regionImageHint";
  testIdPrefix: string;
  onUpdated?: () => void;
}) {
  const { t } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [localPreview, setLocalPreview] = useState<{
    url: string;
    name: string;
  } | null>(null);
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
  const storageProxyable =
    imageStorageKind == null || imageStorageKind === "firebase_storage";

  const slotPresent = localPreview != null || imagePresence === "present";
  const remote = useSecureImageThumbnail(
    previewApiPath,
    slotPresent && storageProxyable && !localPreview,
  );

  if (!canRead) return null;

  const run = async (action: SingleImageAction, file?: File) => {
    if (inFlight.current) return;
    if (action.startsWith("replace_")) {
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
      form.set("slotOrIndex", "0");
      if (file) form.set("file", file, file.name);
      const res = await apiFetch(writeApiPath, {
        method: "POST",
        headers: {
          "idempotency-key": `${testIdPrefix}-${action}-${ownerId}-${Date.now()}`,
        },
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        const gatedOff = json.code === ["PRODUCTION", "WRITE", "DISABLED"].join("_");
        const uploadForbidden =
          json.code === "STORAGE_UNAVAILABLE" &&
          String(json.message ?? json.error ?? "").includes("UPLOAD_403");
        if (gatedOff) {
          setError(t("storageWriteDisabled") || json.message || json.code);
        } else if (uploadForbidden) {
          setError(t("storageUploadForbidden"));
        } else if (json.code === "NOT_FOUND") {
          setError(t("documentNotFound"));
        } else {
          setError(json.message ?? json.error ?? json.code ?? t("error"));
        }
        return;
      }
      setSuccess(t("writeApplied"));
      setConfirmArchive(false);
      if (file) {
        const url = URL.createObjectURL(file);
        setLocalPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url, name: file.name };
        });
      } else {
        setLocalPreview((prev) => {
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
      setProgress(null);
    }
  };

  const thumbSrc = localPreview?.url ?? remote.url;

  return (
    <section
      data-testid={`${testIdPrefix}-actions`}
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{t("image")}</h3>
      <p className={`mb-3 ${adminUi.caption}`}>{t(hintKey)}</p>
      {showWriteControls ? (
        <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
      ) : (
        <p
          className={`mb-3 ${adminUi.caption}`}
          data-testid={`${testIdPrefix}-read-only-notice`}
        >
          {writeChrome ? t("imageWritePermissionRequired") : t("imagePreviewReadOnlyHint")}
        </p>
      )}
      {imagePresence === "present" && !storageProxyable ? (
        <p
          className={`mb-3 ${adminUi.caption}`}
          data-testid={`${testIdPrefix}-external-hint`}
        >
          {t("imageExternalLegacyHint")}
        </p>
      ) : null}
      <div
        className="max-w-xs rounded-md border border-slate-200 p-3"
        data-testid={`${testIdPrefix}-slot`}
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt={localPreview?.name ?? t("image")}
            className="mb-2 h-32 w-full rounded object-cover"
            data-testid={`${testIdPrefix}-local-preview`}
          />
        ) : (
          <div className="mb-2 flex h-32 items-center justify-center rounded bg-slate-50 text-xs text-slate-400">
            {remote.status === "loading"
              ? "…"
              : remote.status === "missing"
                ? t("documentNotFound")
                : remote.status === "error"
                  ? t("documentLoadFailed")
                  : slotPresent
                    ? t("image")
                    : "—"}
          </div>
        )}
        {showWriteControls ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              data-testid={`${testIdPrefix}-file`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) {
                  const url = URL.createObjectURL(file);
                  setLocalPreview((prev) => {
                    if (prev) URL.revokeObjectURL(prev.url);
                    return { url, name: file.name };
                  });
                  void run(replaceAction, file);
                }
              }}
            />
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={adminUi.btnSecondary}
                disabled={pending}
                data-testid={`${testIdPrefix}-replace`}
                onClick={() => fileRef.current?.click()}
              >
                {t("replaceImage")}
              </button>
              {slotPresent ? (
                <button
                  type="button"
                  className={adminUi.btnGhost}
                  disabled={pending}
                  data-testid={`${testIdPrefix}-archive`}
                  onClick={() => setConfirmArchive(true)}
                >
                  {t("archiveImage")}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {confirmArchive ? (
        <ControlledWriteConfirmPanel
          testIdPrefix={`${testIdPrefix}-archive`}
          confirmTemplateKey="confirmGeographyWrite"
          actionLabelKey="archiveImage"
          targetId={ownerId}
          stateLabel={imagePresence}
          pending={pending}
          onConfirm={() => void run(archiveAction)}
          onCancel={() => setConfirmArchive(false)}
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
