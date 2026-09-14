import { describe, expect, it } from "vitest";
import {
  DefaultLegacyTripStatusMapper,
  assertCanonicalTripStatus,
  isCanonicalTripStatus,
} from "@/domain/trip/CanonicalTripStatus";
import { CANONICAL_TRIP_STATUSES } from "@/types/trip";

describe("canonical trip status", () => {
  const mapper = new DefaultLegacyTripStatusMapper();

  it("contains required canonical statuses", () => {
    expect(CANONICAL_TRIP_STATUSES).toContain("completed");
    expect(CANONICAL_TRIP_STATUSES).toContain("cancelled_by_customer");
    expect(CANONICAL_TRIP_STATUSES).toContain("under_dispute");
  });

  it("maps known legacy statuses without touching production", () => {
    expect(mapper.mapFromLegacy("done")).toBe("completed");
    expect(mapper.mapFromLegacy("en_route")).toBe("driver_en_route");
    expect(mapper.mapFromLegacy("unknown_xyz")).toBeNull();
  });

  it("validates canonical status helpers", () => {
    expect(isCanonicalTripStatus("started")).toBe(true);
    expect(isCanonicalTripStatus("bogus")).toBe(false);
    expect(assertCanonicalTripStatus("refunded")).toBe("refunded");
    expect(() => assertCanonicalTripStatus("nope")).toThrow();
  });
});
