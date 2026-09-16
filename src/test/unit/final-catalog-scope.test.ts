import { describe, expect, it, vi } from "vitest";
import { scopedCatalogReadClient } from "@/application/production-read/ScopedCatalogReadClient";
import type { FirestoreReadClient } from "@/infrastructure/production/firestore/FirestoreReadClient";
const docs = [
 { id: "sa", exists: true, data: { Rev_dolh: "countries/saudi_arabia", phone: "+966555123456", email: "private@example.test" } },
 { id: "kg", exists: true, data: { Rev_dolh: "countries/kyrgyzstan" } },
];
function raw(): FirestoreReadClient { return { query: vi.fn(async () => ({ docs, nextCursor: "kg" })), getDocument: vi.fn(async () => docs[1]) }; }
describe("catalog scope before DTOs", () => {
 it.each(["user", "mkan", "transport_company"])("limits %s to authorized country without dropping cursor", async collection => {
  const result = await scopedCatalogReadClient(raw(), { type: "country", countryIds: ["SA"] }).query({ collection, limit: 20 });
  expect(result.docs.map(d => d.id)).toEqual(["sa"]); expect(result.nextCursor).toBe("kg");
 });
 it("denies foreign details", async () => {
  await expect(scopedCatalogReadClient(raw(), { type: "country", countryIds: ["SA"] }).getDocument("transport_company", "kg")).rejects.toThrow("scope");
 });
 it("rejects empty scope without querying and does not infer agent ownership", async () => {
  const c = raw(); expect(() => scopedCatalogReadClient(c, { type: "country" })).toThrow(); expect(c.query).not.toHaveBeenCalled();
  expect((await scopedCatalogReadClient(c, { type: "agent", countryIds: ["SA"], agentIds: ["a"] }).query({ collection: "mkan", limit: 20 })).docs).toEqual([]);
 });
 it("masks fleet contact fields even for global read-only views", async () => {
  const r = await scopedCatalogReadClient(raw(), { type: "global" }).query({ collection: "transport_company", limit: 20 });
  expect(r.docs[0].data?.email).not.toBe("private@example.test"); expect(r.docs[0].data?.phone).not.toBe("+966555123456");
 });
});
