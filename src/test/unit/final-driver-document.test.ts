import { describe, expect, it, vi } from "vitest";
import { resolveDriverDocumentPath } from "@/domain/storage/DriverDocumentReference";
import { readDriverDocument } from "@/application/storage/ReadDriverDocument";
const bucket = "test.appspot.com";
describe("private driver document preview", () => {
 it("resolves canonical V2 and historical Firebase URL without sharing its token", () => {
  expect(resolveDriverDocumentPath({ doc_driver_license: { storagePath: "users/driver/documents/license.png" } }, "driver", "driver_license", bucket)).toBe("users/driver/documents/license.png");
  expect(resolveDriverDocumentPath({ img_id_rksh: "https://firebasestorage.googleapis.com/v0/b/test.appspot.com/o/users%2Fdriver%2Fuploads%2Fid.png?token=never-return-this" }, "driver", "national_id", bucket)).toBe("users/driver/uploads/id.png");
 });
 it.each(["users/other/id.png", "users/driver/../other/id.png", "https://attacker.test/id", "https://firebasestorage.googleapis.com/v0/b/other/o/users%2Fdriver%2Fid.png"]) ("rejects invalid persisted reference %s", storagePath => {
  expect(() => resolveDriverDocumentPath({ doc_national_id: { storagePath } }, "driver", "national_id", bucket)).toThrow("DOCUMENT_REFERENCE_INVALID");
 });
 it("rejects unrecognized slots and missing files", () => {
  expect(() => resolveDriverDocumentPath({}, "driver", "constructor", bucket)).toThrow("VALIDATION_FAILED");
  expect(() => resolveDriverDocumentPath({}, "driver", "national_id", bucket)).toThrow("NOT_FOUND");
 });
 it("checks persona and scope before touching Storage", async () => {
  const read = vi.fn(); const getDocument = vi.fn(async () => ({ id: "driver", exists: true, data: { ismndob: true, Rev_dolh: "countries/kyrgyzstan", doc_national_id: { storagePath: "users/driver/id.png" } } }));
  await expect(readDriverDocument({ driverId: "driver", slot: "national_id", bucket, scope: { type: "country", countryIds: ["SA"] } }, { client: { getDocument, query: vi.fn() }, documents: { read } })).rejects.toThrow("scope");
  expect(read).not.toHaveBeenCalled();
 });
 it("does not substitute fake URLs when the object store is unavailable", async () => {
  const read = vi.fn(async () => { throw new Error("STORAGE_UNAVAILABLE"); });
  await expect(readDriverDocument({ driverId: "driver", slot: "national_id", bucket, scope: { type: "global" } }, { client: { getDocument: vi.fn(async () => ({ id: "driver", exists: true, data: { ismndob: true, doc_national_id: { storagePath: "users/driver/id.png" } } })), query: vi.fn() }, documents: { read } })).rejects.toThrow("STORAGE_UNAVAILABLE");
 });
});
