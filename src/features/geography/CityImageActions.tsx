"use client";

import { GeographySingleImageActions } from "@/features/geography/GeographySingleImageActions";

/**
 * City single-image replace / archive — Legacy villages.img.
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
  return (
    <GeographySingleImageActions
      ownerId={cityId}
      imagePresence={imagePresence}
      previewApiPath={`/api/storage/cities/${encodeURIComponent(cityId)}/0`}
      writeApiPath={`/api/storage/cities/${encodeURIComponent(cityId)}/images`}
      replaceAction="replace_city_image"
      archiveAction="archive_city_image"
      hintKey="cityImageHint"
      testIdPrefix="city-image"
      onUpdated={onUpdated}
    />
  );
}
