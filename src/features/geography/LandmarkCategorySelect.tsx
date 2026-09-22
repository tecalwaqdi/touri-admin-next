"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { adminUi } from "@/components/ui/adminUi";
import {
  LEGACY_DEFAULT_LANDMARK_CATEGORY,
} from "@/application/controlled-writes/geography/GeographyLegacyWriteFields";
import {
  LEGACY_LANDMARK_CATEGORIES,
  isKnownLegacyLandmarkCategory,
  labelForLegacyLandmarkCategory,
} from "@/domain/geography/LegacyLandmarkCategories";

/**
 * Landmark category (`tsnef`) select — Legacy customer chip values only.
 * Preserves unknown historical values as an extra option on edit.
 */
export function LandmarkCategorySelect({
  value,
  onChange,
  required,
  testId = "landmark-category-select",
}: {
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  testId?: string;
}) {
  const { t, locale } = useI18n();
  const trimmed = value.trim();
  const unknown =
    trimmed !== "" && !isKnownLegacyLandmarkCategory(trimmed) ? trimmed : null;

  return (
    <label className="text-sm">
      <span className="mb-1 block text-slate-600">
        {t("category")}
        {required ? (
          <span className="text-rose-600" title={t("requiredMark")}>
            {" "}
            *
          </span>
        ) : null}
      </span>
      <select
        className={adminUi.filterControl}
        aria-label={t("category")}
        data-testid={testId}
        value={trimmed || LEGACY_DEFAULT_LANDMARK_CATEGORY}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        {unknown ? (
          <option value={unknown}>
            {unknown} ({t("legacyCategoryOther")})
          </option>
        ) : null}
        {LEGACY_LANDMARK_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {labelForLegacyLandmarkCategory(c.value, locale)}
          </option>
        ))}
      </select>
    </label>
  );
}
