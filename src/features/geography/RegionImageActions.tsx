"use client";

import { GeographySingleImageActions } from "@/features/geography/GeographySingleImageActions";

/**
 * Region single-image replace / archive — Legacy cities.img (region docs).
 */
export function RegionImageActions({
  regionId,
  imagePresence,
  onUpdated,
}: {
  regionId: string;
  imagePresence: "present" | "missing" | "unavailable";
  onUpdated?: () => void;
}) {
  return (
    <GeographySingleImageActions
      ownerId={regionId}
      imagePresence={imagePresence}
      previewApiPath={`/api/storage/regions/${encodeURIComponent(regionId)}/0`}
      writeApiPath={`/api/storage/regions/${encodeURIComponent(regionId)}/images`}
      replaceAction="replace_region_image"
      archiveAction="archive_region_image"
      hintKey="regionImageHint"
      testIdPrefix="region-image"
      onUpdated={onUpdated}
    />
  );
}
