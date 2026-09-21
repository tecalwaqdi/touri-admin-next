import { describe, expect, it } from "vitest";
import {
  areStorageProductionWritesEnabled,
  assertGeographyImageMimeAndSize,
  buildCanonicalStoragePath,
  DEFAULT_STORAGE_WRITE_FLAGS_FALSE,
  executeStorageControlledAction,
  STORAGE_WRITE_PRODUCTION_HARD_FALSE,
} from "@/domain/storage/StorageControlledWorkflows";
import {
  buildGeographyImageGsUrl,
  geographyImageFieldPatch,
} from "@/domain/storage/GeographyImageFields";
import { executeGeographyImageProductionWrite } from "@/application/storage/ExecuteGeographyImageWrite";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import type { GeographyImageObjectStore } from "@/infrastructure/production/storage/WifGeographyImageObjectStore";

describe("storage geography image gates", () => {
  it("HARD_FALSE remains false for inventory; enablement uses env flags", () => {
    expect(STORAGE_WRITE_PRODUCTION_HARD_FALSE).toBe(false);
    expect(
      areStorageProductionWritesEnabled(DEFAULT_STORAGE_WRITE_FLAGS_FALSE, "city_image"),
    ).toBe(false);
    expect(
      areStorageProductionWritesEnabled(
        {
          GLOBAL_PRODUCTION_WRITE_ENABLED: true,
          PRODUCTION_WRITE_ENABLED: true,
          GEOGRAPHY_WRITE_ENABLED: true,
          REGION_WRITE_ENABLED: true,
          PARTNER_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
        },
        "landmark_image",
      ),
    ).toBe(true);
    expect(
      areStorageProductionWritesEnabled(
        {
          GLOBAL_PRODUCTION_WRITE_ENABLED: true,
          PRODUCTION_WRITE_ENABLED: true,
          GEOGRAPHY_WRITE_ENABLED: true,
          REGION_WRITE_ENABLED: false,
          PARTNER_WRITE_ENABLED: false,
          DRIVER_WRITE_ENABLED: false,
        },
        "region_image",
      ),
    ).toBe(false);
  });

  it("default-off Fake path still returns PRODUCTION_WRITE_DISABLED", () => {
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

  it("maps landmark/city fields and builds gs urls", () => {
    expect(geographyImageFieldPatch("landmark_image", "0", "gs://b/p")).toEqual({
      img1: "gs://b/p",
      img: "gs://b/p",
    });
    expect(geographyImageFieldPatch("landmark_image", "1", null)).toEqual({
      img2: "",
    });
    expect(geographyImageFieldPatch("city_image", "0", "gs://b/c")).toEqual({
      img: "gs://b/c",
    });
    expect(buildGeographyImageGsUrl("bucket", "cities/x/images/0")).toBe(
      "gs://bucket/cities/x/images/0",
    );
    expect(
      buildCanonicalStoragePath({
        kind: "country_image",
        ownerId: "sa",
        slotOrIndex: "0",
      }),
    ).toBe("countries/sa/images/0");
  });

  it("rejects PDF for geography images", () => {
    expect(() =>
      assertGeographyImageMimeAndSize({
        mimeType: "application/pdf",
        sizeBytes: 100,
      }),
    ).toThrow();
  });
});

describe("executeGeographyImageProductionWrite", () => {
  it("uploads bytes, patches Firestore, and archives", async () => {
    const firestore = new FakeProductionFirestoreWritePort();
    firestore.seed("villages", "city_qa_1", { name: "QA City" });
    const uploads: string[] = [];
    const deletes: string[] = [];
    const objects: GeographyImageObjectStore = {
      async upload({ path }) {
        uploads.push(path);
      },
      async delete(path) {
        deletes.push(path);
      },
    };
    const flags = {
      GLOBAL_PRODUCTION_WRITE_ENABLED: true,
      PRODUCTION_WRITE_ENABLED: true,
      GEOGRAPHY_WRITE_ENABLED: true,
      REGION_WRITE_ENABLED: true,
      PARTNER_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const replaced = await executeGeographyImageProductionWrite(
      {
        actorUid: "admin",
        action: "replace_city_image",
        kind: "city_image",
        ownerId: "city_qa_1",
        slotOrIndex: "0",
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        bytes: png,
        idempotencyKey: "k1",
        correlationId: "c1",
      },
      {
        flags,
        bucket: "tutorial-multi-language-70gx4j.firebasestorage.app",
        firestore,
        objects,
      },
    );
    expect(replaced.ok).toBe(true);
    expect(replaced.realUploadPerformed).toBe(true);
    expect(replaced.productionWriteExecuted).toBe(true);
    expect(uploads).toEqual(["cities/city_qa_1/images/0"]);
    const after = await firestore.getDocument("villages", "city_qa_1");
    expect(after.data?.img).toBe(
      "gs://tutorial-multi-language-70gx4j.firebasestorage.app/cities/city_qa_1/images/0",
    );

    const archived = await executeGeographyImageProductionWrite(
      {
        actorUid: "admin",
        action: "archive_city_image",
        kind: "city_image",
        ownerId: "city_qa_1",
        slotOrIndex: "0",
        idempotencyKey: "k2",
        correlationId: "c2",
      },
      {
        flags,
        bucket: "tutorial-multi-language-70gx4j.firebasestorage.app",
        firestore,
        objects,
      },
    );
    expect(archived.ok).toBe(true);
    expect(deletes).toEqual(["cities/city_qa_1/images/0"]);
    const cleared = await firestore.getDocument("villages", "city_qa_1");
    expect(cleared.data?.img).toBe("");
  });

  it("denies when geography gate is off", async () => {
    const firestore = new FakeProductionFirestoreWritePort();
    firestore.seed("mkan", "lm1", { name: "L" });
    const out = await executeGeographyImageProductionWrite(
      {
        actorUid: "a",
        action: "replace_landmark_image",
        kind: "landmark_image",
        ownerId: "lm1",
        slotOrIndex: "0",
        mimeType: "image/jpeg",
        sizeBytes: 4,
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        idempotencyKey: "k",
        correlationId: "c",
      },
      {
        flags: DEFAULT_STORAGE_WRITE_FLAGS_FALSE,
        bucket: "b",
        firestore,
        objects: {
          async upload() {},
          async delete() {},
        },
      },
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("PRODUCTION_WRITE_DISABLED");
  });
});
