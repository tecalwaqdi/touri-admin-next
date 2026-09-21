import { describe, expect, it } from "vitest";
import {
  parseGoogleMapsUrl,
  parseLatLngPair,
  parseLocationPaste,
} from "@/domain/geography/parseLocationPaste";
import {
  summarizeCityImage,
  extractCityImagePreviewUrl,
} from "@/domain/geography/CityImageSummary";
import {
  buildCanonicalStoragePath,
  executeStorageControlledAction,
} from "@/domain/storage/StorageControlledWorkflows";
import { extractCityLegacyBusinessFields } from "@/domain/geography/LegacyGeographyBusinessFields";

describe("parseLocationPaste", () => {
  it("parses lat,lng pairs", () => {
    expect(parseLatLngPair("24.7136, 46.6753")).toEqual({
      lat: 24.7136,
      lng: 46.6753,
      source: "coords",
    });
    expect(parseLatLngPair("24.7136;46.6753")?.source).toBe("coords");
    expect(parseLatLngPair("0,0")).toBeNull();
    expect(parseLatLngPair("not coords")).toBeNull();
  });

  it("parses Google Maps URL shapes", () => {
    const at = parseGoogleMapsUrl(
      "https://www.google.com/maps/place/Riyadh/@24.7136,46.6753,12z",
    );
    expect(at).toEqual({
      lat: 24.7136,
      lng: 46.6753,
      source: "google_maps_url",
    });
    const q = parseGoogleMapsUrl(
      "https://maps.google.com/?q=24.7136,46.6753",
    );
    expect(q?.lat).toBe(24.7136);
    expect(q?.lng).toBe(46.6753);
    const bang = parseLocationPaste(
      "https://www.google.com/maps/dir/?api=1&destination=x!3d21.4225!4d39.8262",
    );
    expect(bang?.lat).toBeCloseTo(21.4225);
    expect(bang?.lng).toBeCloseTo(39.8262);
  });
});

describe("city image summary + storage gate", () => {
  it("summarizes villages.img without exposing URLs", () => {
    const summary = summarizeCityImage({
      img: "https://firebasestorage.googleapis.com/v0/b/x/o/y",
    });
    expect(summary.hasImage).toBe(true);
    expect(summary.imageCount).toBe(1);
    expect(summary.storageKind).toBe("firebase_storage");
    expect(extractCityImagePreviewUrl({ img: "https://cdn.example.com/c.jpg" })).toBe(
      "https://cdn.example.com/c.jpg",
    );
    expect(
      extractCityImagePreviewUrl({
        img: "https://firebasestorage.googleapis.com/v0/b/x/o/y",
      }),
    ).toBeNull();
  });

  it("extracts imagePresence on city legacy business fields", () => {
    const biz = extractCityLegacyBusinessFields({
      osf: "desc",
      img: "https://cdn.example.com/c.jpg",
      lat_ling: { latitude: 24.7, longitude: 46.7 },
    });
    expect(biz.imagePresence).toBe("present");
    expect(biz.imageStorageKind).toBe("http_url");
    expect(biz.coordinates?.latitude).toBe(24.7);
  });

  it("builds city image canonical path and respects production hard-false gate", () => {
    expect(
      buildCanonicalStoragePath({
        kind: "city_image",
        ownerId: "city1",
        slotOrIndex: "0",
      }),
    ).toBe("cities/city1/images/0");

    const denied = executeStorageControlledAction({
      actorUid: "a",
      action: "replace_city_image",
      kind: "city_image",
      ownerId: "city1",
      slotOrIndex: "0",
      mimeType: "image/png",
      sizeBytes: 100,
      idempotencyKey: "c1",
      correlationId: "c",
    });
    expect(denied.ok).toBe(false);
    expect(denied.code).toBe("PRODUCTION_WRITE_DISABLED");
    expect(denied.realUploadPerformed).toBe(false);
  });
});
