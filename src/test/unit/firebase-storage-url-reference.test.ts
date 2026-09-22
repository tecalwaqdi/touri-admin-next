import { describe, expect, it } from "vitest";
import {
  firebaseStorageBucketsEquivalent,
  resolveFirebaseStorageObjectPath,
} from "@/domain/storage/FirebaseStorageUrlReference";

const configured = "tutorial-multi-language-70gx4j.firebasestorage.app";

describe("FirebaseStorageUrlReference", () => {
  it("treats appspot and firebasestorage.app as equivalent project buckets", () => {
    expect(
      firebaseStorageBucketsEquivalent(
        "tutorial-multi-language-70gx4j.appspot.com",
        configured,
      ),
    ).toBe(true);
  });

  it("parses googleapis download URLs with bucket alias", () => {
    const path = resolveFirebaseStorageObjectPath(
      "https://firebasestorage.googleapis.com/v0/b/tutorial-multi-language-70gx4j.appspot.com/o/landmarks%2Flm1%2Fimg1.jpg?alt=media",
      configured,
    );
    expect(path).toBe("landmarks/lm1/img1.jpg");
  });

  it("parses firebasestorage.app host URLs", () => {
    const path = resolveFirebaseStorageObjectPath(
      "https://tutorial-multi-language-70gx4j.firebasestorage.app/o/cities%2Fc1%2Fcover.png?alt=media",
      configured,
    );
    expect(path).toBe("cities/c1/cover.png");
  });

  it("parses gs:// with appspot bucket name", () => {
    const path = resolveFirebaseStorageObjectPath(
      "gs://tutorial-multi-language-70gx4j.appspot.com/mkan/lm/img.png",
      configured,
    );
    expect(path).toBe("mkan/lm/img.png");
  });
});
