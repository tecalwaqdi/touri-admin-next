/**
 * Unit: Firestore REST decode must preserve DocumentReference resource names.
 * Regression: dropping referenceValue → Agent countryId missing / SCOPE_DENIED.
 */
import { describe, expect, it } from "vitest";
import { decodeFirestoreRestValue } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { extractLegacyDocRefId } from "@/domain/geography/CityRecordClassification";

describe("decodeFirestoreRestValue referenceValue", () => {
  it("decodes referenceValue to resource path string", () => {
    const decoded = decodeFirestoreRestValue({
      referenceValue:
        "projects/demo/databases/(default)/documents/countries/saudi_arabia",
    });
    expect(decoded).toBe(
      "projects/demo/databases/(default)/documents/countries/saudi_arabia",
    );
    expect(extractLegacyDocRefId(decoded)).toBe("saudi_arabia");
  });

  it("does not drop nested map fields that contain references", () => {
    const decoded = decodeFirestoreRestValue({
      mapValue: {
        fields: {
          Rev_dloh_agent: {
            referenceValue:
              "projects/demo/databases/(default)/documents/countries/egypt",
          },
        },
      },
    }) as Record<string, unknown>;
    expect(extractLegacyDocRefId(decoded.Rev_dloh_agent)).toBe("egypt");
  });

  it("extractLegacyDocRefId accepts undecoded referenceValue objects", () => {
    expect(
      extractLegacyDocRefId({
        referenceValue:
          "projects/demo/databases/(default)/documents/countries/jordan",
      }),
    ).toBe("jordan");
  });
});
