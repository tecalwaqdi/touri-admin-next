/**
 * Unit: ProductionDriverWriteLoadPort maps Firestore user docs for write gates.
 */

import { describe, expect, it } from "vitest";
import { ProductionDriverWriteLoadPort } from "@/application/controlled-writes/drivers/ProductionDriverWriteLoadPort";
import type {
  ProductionFirestoreWritePort,
  ProductionWriteDocSnap,
} from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function fakePort(doc: ProductionWriteDocSnap | null): ProductionFirestoreWritePort {
  return {
    kind: "fake_production_firestore_write",
    async getDocument() {
      return (
        doc ?? {
          exists: false,
          id: "x",
          data: null,
          updateTime: null,
        }
      );
    },
    async createDocument() {
      throw new Error("unused");
    },
    async updateDocument() {
      throw new Error("unused");
    },
    async queryEqual() {
      return [];
    },
  };
}

describe("ProductionDriverWriteLoadPort", () => {
  it("returns null for missing docs", async () => {
    const port = new ProductionDriverWriteLoadPort(fakePort(null));
    expect(await port.loadForWrite("missing")).toBeNull();
  });

  it("returns null for non-driver user docs", async () => {
    const port = new ProductionDriverWriteLoadPort(
      fakePort({
        exists: true,
        id: "u1",
        updateTime: "2026-01-01T00:00:00.000Z",
        data: { ismndob: false, registration_status: "pending_review" },
      }),
    );
    expect(await port.loadForWrite("u1")).toBeNull();
  });

  it("maps operational driver pending_review with fs_ut token", async () => {
    const port = new ProductionDriverWriteLoadPort(
      fakePort({
        exists: true,
        id: "tOh9xu7MNVNuDEjp37CNFgj4Ywi2",
        updateTime: "2026-09-17T04:43:29.944Z",
        data: {
          ismndob: true,
          registration_status: "pending_review",
          actev_mndob: false,
          on_trip: false,
          Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        },
      }),
    );
    const snap = await port.loadForWrite("tOh9xu7MNVNuDEjp37CNFgj4Ywi2");
    expect(snap).toMatchObject({
      exists: true,
      isOperationalDriver: true,
      registrationStatus: "pending_review",
      countryId: "saudi_arabia",
      countryScopeKind: "mapped",
      preconditionToken: "fs_ut_2026-09-17T04:43:29.944Z",
    });
  });
});
