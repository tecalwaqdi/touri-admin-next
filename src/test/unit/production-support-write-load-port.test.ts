import { describe, expect, it } from "vitest";
import { createProductionSupportWriteLoadPort } from "@/application/controlled-writes/support/ProductionSupportWriteLoadPort";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function fakePort(
  doc: {
    exists: boolean;
    data: Record<string, unknown> | null;
    updateTime: string | null;
  } | null,
): ProductionFirestoreWritePort {
  return {
    kind: "fake_production_firestore_write",
    async getDocument(_collection: string, id: string) {
      if (!doc) return { id, exists: false, data: null, updateTime: null };
      return { id, ...doc };
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
  } as unknown as ProductionFirestoreWritePort;
}

describe("ProductionSupportWriteLoadPort", () => {
  it("returns null when ticket missing", async () => {
    const port = createProductionSupportWriteLoadPort(fakePort(null));
    expect(await port.load("missing")).toBeNull();
  });

  it("maps QA support ticket with precondition token", async () => {
    const port = createProductionSupportWriteLoadPort(
      fakePort({
        exists: true,
        data: {
          naim: "QA",
          halh: "open",
          qa_fixture: true,
          is_test: true,
        },
        updateTime: "ut-support-1",
      }),
    );
    const snap = await port.load("test_adminnext_support_pilot_a");
    expect(snap).toMatchObject({
      exists: true,
      ticketId: "test_adminnext_support_pilot_a",
      displayStatus: "open",
      preconditionToken: "fs_ut_ut-support-1",
    });
  });
});
