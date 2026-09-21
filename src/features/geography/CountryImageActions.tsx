"use client";

import { GeographySingleImageActions } from "@/features/geography/GeographySingleImageActions";

/**
 * Country single-image replace / archive — Legacy countries.img.
 */
export function CountryImageActions({
  countryId,
  imagePresence,
  onUpdated,
}: {
  countryId: string;
  imagePresence: "present" | "missing" | "unavailable";
  onUpdated?: () => void;
}) {
  return (
    <GeographySingleImageActions
      ownerId={countryId}
      imagePresence={imagePresence}
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
