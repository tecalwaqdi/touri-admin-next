"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { adminUi } from "@/components/ui/adminUi";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;
const LANDMARK_SLOTS = ["0", "1", "2"] as const;

export type StagedImageSlot = {
  file: File;
  previewUrl: string;
};

function validateImageFile(file: File): boolean {
  return ALLOWED.has(file.type) && file.size > 0 && file.size <= MAX_BYTES;
}

/**
 * Create-form image staging — pick files before the resource exists.
 * Caller uploads via Storage API after create (legacy needs doc id).
 */
export function useStagedGeographyImages(slotCount: 1 | 3) {
  const slots = slotCount === 3 ? LANDMARK_SLOTS : (["0"] as const);
  const [staged, setStaged] = useState<
    Record<string, StagedImageSlot | undefined>
  >({});

  useEffect(() => {
    return () => {
      for (const slot of Object.values(staged)) {
        if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, []);

  const setSlot = (slot: string, file: File | null) => {
    setStaged((prev) => {
      const next = { ...prev };
      if (prev[slot]?.previewUrl) URL.revokeObjectURL(prev[slot]!.previewUrl);
      if (!file) {
        delete next[slot];
        return next;
      }
      next[slot] = { file, previewUrl: URL.createObjectURL(file) };
      return next;
    });
  };

  const clearAll = () => {
    setStaged((prev) => {
      for (const slot of Object.values(prev)) {
        if (slot?.previewUrl) URL.revokeObjectURL(slot.previewUrl);
      }
      return {};
    });
  };

  const entries: { slot: string; file: File }[] = [];
  for (const slot of slots) {
    const item = staged[slot];
    if (item) entries.push({ slot, file: item.file });
  }

  return { slots, staged, setSlot, clearAll, entries, validateImageFile };
}

export function GeographyCreateImageStaging({
  mode,
  staged,
  onPick,
  onClear,
  disabled,
}: {
  mode: "landmark" | "city" | "country";
  staged: Record<string, StagedImageSlot | undefined>;
  onPick: (slot: string, file: File | null) => void;
  onClear: (slot: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const slots =
    mode === "landmark" ? LANDMARK_SLOTS : (["0"] as const);
  const hintKey =
    mode === "landmark"
      ? "multiImageHint"
      : mode === "city"
        ? "cityImageHint"
        : "countryImageHint";

  return (
    <section
      data-testid={`geography-create-image-staging-${mode}`}
      className="sm:col-span-2 rounded-lg border-2 border-emerald-300 bg-emerald-50/40 p-4"
    >
      <h3 className="mb-1 text-sm font-semibold text-slate-900">
        {t("image")}
      </h3>
      <p className={`mb-1 ${adminUi.caption}`}>{t(hintKey)}</p>
      <p className={`mb-3 ${adminUi.caption}`}>{t("createImageStagingHint")}</p>
      <p className={`mb-3 ${adminUi.caption}`}>{t("imageUploadHint")}</p>
      <div
        className={
          mode === "landmark"
            ? "grid gap-3 sm:grid-cols-3"
            : "grid max-w-xs gap-3"
        }
      >
        {slots.map((slot) => {
          const item = staged[slot];
          return (
            <div
              key={slot}
              className="rounded-md border border-slate-200 bg-white p-3"
              data-testid={`geography-create-image-slot-${slot}`}
            >
              <div className="mb-2 text-xs font-medium text-slate-600">
                {mode === "landmark"
                  ? `${t("imageSlot")} ${Number(slot) + 1}`
                  : t("image")}
              </div>
              {item?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="mb-2 h-24 w-full rounded object-cover"
                  data-testid={`geography-create-image-preview-${slot}`}
                />
              ) : (
                <div
                  className="mb-2 flex h-24 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-400"
                  data-testid={`geography-create-image-placeholder-${slot}`}
                >
                  {t("selectImage")}
                </div>
              )}
              <input
                ref={(el) => {
                  fileRefs.current[slot] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                data-testid={`geography-create-image-file-${slot}`}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  if (file && !validateImageFile(file)) return;
                  onPick(slot, file);
                }}
              />
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  className={adminUi.btnSecondary}
                  disabled={disabled}
                  data-testid={`geography-create-image-pick-${slot}`}
                  onClick={() => fileRefs.current[slot]?.click()}
                >
                  {item ? t("replaceImage") : t("uploadImage")}
                </button>
                {item ? (
                  <button
                    type="button"
                    className={adminUi.btnGhost}
                    disabled={disabled}
                    data-testid={`geography-create-image-clear-${slot}`}
                    onClick={() => onClear(slot)}
                  >
                    {t("archiveImage")}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
