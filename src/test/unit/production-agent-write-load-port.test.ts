/**
 * Unit: ProductionAgentWriteLoadPort maps Firestore user docs for agent write gates.
 */
import { describe, expect, it } from "vitest";
import { ProductionAgentWriteLoadPort } from "@/application/controlled-writes/agents/ProductionAgentWriteLoadPort";
import type { ProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";

function fakePort(
  doc: { exists: boolean; data: Record<string, unknown> | null; updateTime: string | null } | null,
  queryRows: Array<{ id: string; data: Record<string, unknown> }> = [],
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
      return queryRows.map((r) => ({
        id: r.id,
        exists: true,
        data: r.data,
        updateTime: "utq",
      }));
    },
  } as unknown as ProductionFirestoreWritePort;
}

describe("ProductionAgentWriteLoadPort", () => {
  it("returns null when missing", async () => {
    const port = new ProductionAgentWriteLoadPort(fakePort(null));
    expect(await port.loadForWrite("missing")).toBeNull();
  });

  it("returns null for non-agent user", async () => {
    const port = new ProductionAgentWriteLoadPort(
      fakePort({
        exists: true,
        data: { ismndob: true, registration_status: "approved" },
        updateTime: "ut0",
      }),
    );
    expect(await port.loadForWrite("drv1")).toBeNull();
  });

  it("maps inactive operational agent with country", async () => {
    const port = new ProductionAgentWriteLoadPort(
      fakePort({
        exists: true,
        data: {
          Isagent: true,
          isAdminRule: 2,
          operational_status: "inactive",
          actev_user: false,
          Rev_dloh_agent: { path: "countries/saudi_arabia" },
          Rev_dolh: { path: "countries/saudi_arabia" },
        },
        updateTime: "ut1",
      }),
    );
    const snap = await port.loadForWrite("agt1");
    expect(snap).toMatchObject({
      agentId: "agt1",
      exists: true,
      isOperationalAgent: true,
      operationalState: "inactive",
      countryId: "saudi_arabia",
      preconditionToken: "fs_ut_ut1",
    });
  });

  it("extracts countryId from Firestore REST referenceValue object", async () => {
    const port = new ProductionAgentWriteLoadPort(
      fakePort({
        exists: true,
        data: {
          Isagent: true,
          isAdminRule: 2,
          operational_status: "inactive",
          Rev_dloh_agent: {
            referenceValue:
              "projects/demo/databases/(default)/documents/countries/saudi_arabia",
          },
        },
        updateTime: "ut-ref",
      }),
    );
    const snap = await port.loadForWrite("agt-ref");
    expect(snap?.countryId).toBe("saudi_arabia");
  });

  it("extracts countryId from decoded REST reference resource string", async () => {
    const port = new ProductionAgentWriteLoadPort(
      fakePort({
        exists: true,
        data: {
          Isagent: true,
          isAdminRule: 2,
          operational_status: "active",
          actev_user: true,
          Rev_dloh_agent:
            "projects/demo/databases/(default)/documents/countries/egypt",
        },
        updateTime: "ut-str",
      }),
    );
    const snap = await port.loadForWrite("agt-str");
    expect(snap?.countryId).toBe("egypt");
  });

  it("findActiveAgentIdForCountry returns only active peer", async () => {
    const port = new ProductionAgentWriteLoadPort(
      fakePort(
        {
          exists: true,
          data: { Isagent: true, isAdminRule: 2, operational_status: "inactive" },
          updateTime: "ut",
        },
        [
          {
            id: "A1",
            data: {
              Isagent: true,
              operational_status: "inactive",
              Rev_dolh: { path: "countries/saudi_arabia" },
            },
          },
          {
            id: "A2",
            data: {
              Isagent: true,
              operational_status: "active",
              actev_user: true,
              Rev_dolh: { path: "countries/saudi_arabia" },
            },
          },
        ],
      ),
    );
    expect(await port.findActiveAgentIdForCountry("saudi_arabia")).toBe("A2");
    expect(await port.findActiveAgentIdForCountry("egypt")).toBeNull();
  });
});
