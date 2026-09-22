import { describe, expect, it } from "vitest";
import {
  LEGACY_LANDMARK_CATEGORIES,
  LEGACY_LANDMARK_CATEGORY_VALUES,
  isKnownLegacyLandmarkCategory,
  labelForLegacyLandmarkCategory,
} from "@/domain/geography/LegacyLandmarkCategories";
import { LEGACY_DEFAULT_LANDMARK_CATEGORY } from "@/application/controlled-writes/geography/GeographyLegacyWriteFields";

describe("LegacyLandmarkCategories", () => {
  it("matches TouryLandmarkCategories writable storage values (no الكل)", () => {
    expect(LEGACY_LANDMARK_CATEGORY_VALUES).toEqual([
      "معالم دينية",
      "أماكن ترفيهية",
      "معالم سياحية",
      "مقهى",
      "معالم تاريخية",
      "أماكن سياحية",
      "أسواق",
      "جولة برية",
      "جولة بحرية",
      "فنادق",
      "مطاعم",
    ]);
    expect(LEGACY_LANDMARK_CATEGORY_VALUES).not.toContain("الكل");
  });

  it("default create category is in the canonical list", () => {
    expect(
      isKnownLegacyLandmarkCategory(LEGACY_DEFAULT_LANDMARK_CATEGORY),
    ).toBe(true);
  });

  it("exposes AR/EN labels without inventing values", () => {
    const tourism = LEGACY_LANDMARK_CATEGORIES.find(
      (c) => c.value === "معالم سياحية",
    );
    expect(tourism?.labelEn).toBe("Tourist landmarks");
    expect(tourism?.labelAr).toBe("معالم سياحية");
    expect(labelForLegacyLandmarkCategory("معالم سياحية", "en")).toBe(
      "Tourist landmarks",
    );
    expect(labelForLegacyLandmarkCategory("معالم سياحية", "ar")).toBe(
      "معالم سياحية",
    );
  });
});
