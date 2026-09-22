"use client";

import { GeographySingleImageActions } from "@/features/geography/GeographySingleImageActions";

/**
 * Country single-image replace / archive — Legacy countries.img.
 */
export function CountryImageActions({
  countryId,
  imagePresence,
  imageStorageKind,
  onUpdated,
}: {
  countryId: string;
  imagePresence: "present" | "missing" | "unavailable";
  imageStorageKind?: string | null;
  onUpdated?: () => void;
}) {
  return (
    <GeographySingleImageActions
      ownerId={countryId}
      imagePresence={imagePresence}
      imageStorageKind={imageStorageKind}
      previewApiPath={`/api/storage/countries/${encodeURIComponent(countryId)}/0`}
      writeApiPath={`/api/storage/countries/${encodeURIComponent(countryId)}/images`}
      replaceAction="replace_country_image"
      archiveAction="archive_country_image"
      hintKey="countryImageHint"
      testIdPrefix="country-image"
      onUpdated={onUpdated}
    />
  );
}
