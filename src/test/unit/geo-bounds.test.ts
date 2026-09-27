import { describe, expect, it } from "vitest";
import {
  boundsFromNominatimBoundingBox,
  extractCountryBoundsFromLegacyDoc,
  normalizeGeoBounds,
} from "@/domain/geography/GeoBounds";

describe("GeoBounds", () => {
  it("parses Nominatim boundingbox [south,north,west,east]", () => {
    expect(boundsFromNominatimBoundingBox(["16", "32.2", "34.5", "55.7"])).toEqual({
      sw: { lat: 16, lng: 34.5 },
      ne: { lat: 32.2, lng: 55.7 },
    });
  });

  it("normalizes inverted corners", () => {
    const box = normalizeGeoBounds({
      swLat: 43.3,
      swLng: 80.3,
      neLat: 39.1,
      neLng: 69.2,
    });
    expect(box?.sw).toEqual({ lat: 39.1, lng: 69.2 });
    expect(box?.ne).toEqual({ lat: 43.3, lng: 80.3 });
  });

  it("extracts country bounds from Legacy GeoPoint docs", () => {
    const box = extractCountryBoundsFromLegacyDoc({
      bounds_sw: { latitude: 16, longitude: 34.5 },
      bounds_ne: { latitude: 32.2, longitude: 55.7 },
      geo_center: { latitude: 24.7, longitude: 46.7 },
    });
    expect(box?.sw).toEqual({ lat: 16, lng: 34.5 });
    expect(box?.ne).toEqual({ lat: 32.2, lng: 55.7 });
    expect(box?.center).toEqual({ lat: 24.7, lng: 46.7 });
  });
});
