/**
 * Unit: ProductionCustomerWriteLoadPort maps Firestore user docs for customer write gates.
 */
import { describe, expect, it } from "vitest";
import {
  ProductionCustomerWriteLoadPort,
  operationalStateFromCustomerDoc,
} from "@/application/controlled-writes/customers/ProductionCustomerWriteLoadPort";
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

describe("ProductionCustomerWriteLoadPort", () => {
  it("returns null when missing", async () => {
    const port = new ProductionCustomerWriteLoadPort(fakePort(null));
    expect(await port.loadForWrite("missing")).toBeNull();
  });

  it("returns null for driver persona", async () => {
    const port = new ProductionCustomerWriteLoadPort(
      fakePort({
        exists: true,
        data: { ismndob: true, actev_user: true },
        updateTime: "ut0",
      }),
    );
    expect(await port.loadForWrite("drv1")).toBeNull();
  });

  it("maps enabled operational customer with country", async () => {
    const port = new ProductionCustomerWriteLoadPort(
      fakePort({
        exists: true,
        data: {
          actev_user: true,
          email: "qa@touri-taxi-test.invalid",
          display_name: "QA Customer",
          Rev_dolh: { path: "countries/saudi_arabia" },
          is_test: true,
          qa_fixture: true,
        },
        updateTime: "ut1",
      }),
    );
    const snap = await port.loadForWrite("test_adminnext_customer_a");
    expect(snap).toMatchObject({
      customerId: "test_adminnext_customer_a",
      exists: true,
      isOperationalCustomer: true,
      operationalState: "enabled",
      countryId: "saudi_arabia",
      preconditionToken: "fs_ut_ut1",
    });
  });

  it("prefers account_status blocked over actev_user", () => {
    expect(
      operationalStateFromCustomerDoc({
        account_status: "blocked",
        actev_user: true,
      }),
    ).toBe("blocked");
  });
});

describe("customer production pilot harness", () => {
  it("runner exists and writes 03-customer.json artifact", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const path = join(process.cwd(), "scripts/run-customer-production-pilot.mjs");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/03-customer\.json/);
    expect(src).toMatch(/CUSTOMER_WRITE_ENABLED/);
    expect(src).toMatch(/DRIVER_WRITE_ENABLED/);
    expect(src).toMatch(/AGENT_WRITE_ENABLED/);
    expect(src).toMatch(/PRESERVE_PASS_DOMAINS|preservePassDomains|PASS_DOMAIN/);
  });
});
