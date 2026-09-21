/**
 * Map geography image slots → Legacy Firestore string fields.
 * Never invent URLs; callers supply canonical gs:// references only.
 */

import type { StorageResourceKind } from "@/domain/storage/StorageControlledWorkflows";

export type GeographyImageOwnerKind =
  | "landmark_image"
  | "city_image"
  | "country_image"
  | "region_image";

export function isGeographyImageKind(
  kind: StorageResourceKind,
): kind is GeographyImageOwnerKind {
  return (
    kind === "landmark_image" ||
    kind === "city_image" ||
    kind === "country_image" ||
    kind === "region_image"
  );
}

export function geographyImageCollection(
  kind: GeographyImageOwnerKind,
): "mkan" | "villages" | "countries" | "cities" {
  switch (kind) {
    case "landmark_image":
      return "mkan";
    case "city_image":
      return "villages";
    case "country_image":
      return "countries";
    case "region_image":
      return "cities";
  }
}

/** Normalize slot token → Legacy field names to patch. */
export function geographyImageFieldPatch(
  kind: GeographyImageOwnerKind,
  slotOrIndex: string,
  value: string | null,
): Record<string, string> {
  const slot = slotOrIndex.trim();
  if (kind === "landmark_image") {
    const index =
      slot === "0" || slot === "img1" || slot === "cover"
        ? 0
        : slot === "1" || slot === "img2"
          ? 1
          : slot === "2" || slot === "img3"
            ? 2
            : -1;
    if (index < 0) {
      throw Object.assign(new Error("Invalid landmark image slot"), {
        code: "VALIDATION_FAILED",
      });
    }
    const field = index === 0 ? "img1" : index === 1 ? "img2" : "img3";
    const patch: Record<string, string> = {
      [field]: value ?? "",
    };
    // Dual-read: Legacy `img` mirrors cover when slot 0 changes.
    if (index === 0) {
      patch.img = value ?? "";
    }
    return patch;
  }

  if (slot !== "0" && slot !== "img" && slot !== "cover") {
    throw Object.assign(new Error("Invalid image slot"), {
      code: "VALIDATION_FAILED",
    });
  }
  return { img: value ?? "" };
}

export function buildGeographyImageGsUrl(
  bucket: string,
  canonicalPath: string,
): string {
  const b = bucket.trim();
  const p = canonicalPath.replace(/^\/+/, "").trim();
  if (!b || !p) {
    throw Object.assign(new Error("Invalid storage reference"), {
      code: "VALIDATION_FAILED",
    });
  }
  return `gs://${b}/${p}`;
}
