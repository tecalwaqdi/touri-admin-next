"use client";

import { GeographySingleImageActions } from "@/features/geography/GeographySingleImageActions";

/**
 * Region single-image replace / archive — Legacy cities.img (region docs).
 */
export function RegionImageActions({
  regionId,
  imagePresence,
  imageStorageKind,
  onUpdated,
}: {
  regionId: string;
  imagePresence: "present" | "missing" | "unavailable";
  imageStorageKind?: string | null;
  onUpdated?: () => void;
}) {
  return (
    <GeographySingleImageActions
      ownerId={regionId}
      imagePresence={imagePresence}
      imageStorageKind={imageStorageKind}
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
