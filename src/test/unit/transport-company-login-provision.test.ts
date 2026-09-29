import { describe, expect, it } from "vitest";
import {
  FakeTransportCompanyAuthCreatePort,
  provisionTransportCompanyLogin,
  validateTransportCompanyLoginFields,
} from "@/application/controlled-writes/fleet/TransportCompanyLoginProvision";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import { permissionsForRole } from "@/permissions/rbac";
import { filterNavForTransportManager } from "@/domain/ui/transportManagerWorkspace";
import { NAV_ITEMS } from "@/config/navigation";

describe("transport company create + login provision", () => {
  it("requires email, password, and display name", () => {
    expect(
      validateTransportCompanyLoginFields({
        email: "",
        password: "secret1",
        displayName: "Co",
      }).ok,
    ).toBe(false);
    expect(
      validateTransportCompanyLoginFields({
        email: "fleet@touri.local",
        password: "123",
        displayName: "Co",
      }).ok,
    ).toBe(false);
    const ok = validateTransportCompanyLoginFields({
      email: "Fleet@Touri.Local",
      password: "secret1",
      displayName: "Co",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.email).toBe("fleet@touri.local");
  });

  it("provisions Auth + user doc + owner link without storing password", async () => {
    const auth = new FakeTransportCompanyAuthCreatePort();
    const fs = new FakeProductionFirestoreWritePort();
    fs.seed("transport_company", "co_new", {
      naim: "Co",
      license_number: "L1",
      actev: true,
    });

    const result = await provisionTransportCompanyLogin(
      {
        transportCompanyId: "co_new",
        displayName: "Co New",
        email: "co@touri.local",
        password: "secret99",
        phone: "+966500000001",
        countryId: "saudi_arabia",
        correlationId: "c1",
      },
      { auth, writePort: fs },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authProvisioned).toBe(true);
    expect(result.userDocWritten).toBe(true);
    expect(result.companyOwnerLinked).toBe(true);
    expect(auth.created[0]?.email).toBe("co@touri.local");

    const user = await fs.getDocument("user", result.uid);
    expect(user.exists).toBe(true);
    expect(user.data?.isAdminRule).toBe(4);
    expect(user.data?.transport_company).toEqual({
      path: "transport_company/co_new",
    });
    expect(user.data?.password).toBeUndefined();
    expect(JSON.stringify(user.data)).not.toContain("secret99");

    const company = await fs.getDocument("transport_company", "co_new");
    expect(company.data?.owner_user).toEqual({ path: `user/${result.uid}` });
    expect(company.data?.email).toBe("co@touri.local");
  });

  it("grants transport_manager driver manage + trip follow permissions", () => {
    const perms = permissionsForRole("transport_manager");
    expect(perms).toContain("drivers:read");
    expect(perms).toContain("drivers:approve");
    expect(perms).toContain("trips:read");
    expect(perms).not.toContain("finance:read");
    expect(perms).not.toContain("users:manage");
  });

  it("shows fleet, drivers, and trips in transport_manager nav", () => {
    const hrefs = filterNavForTransportManager(NAV_ITEMS).map((i) => i.href);
    expect(hrefs.sort()).toEqual(["/drivers", "/fleet", "/trips"]);
  });
});
