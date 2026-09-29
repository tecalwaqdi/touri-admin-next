import { describe, expect, it } from "vitest";
import { mapClaimsToIdentity } from "@/domain/auth/ProductionAuthDesign";
import { permissionsForRole } from "@/permissions/rbac";
import {
  executeDriverCreate,
  resolveAffiliatedTransportCompanyId,
} from "@/application/controlled-writes/drivers-create/DriverCreateService";
import { FakeProductionFirestoreWritePort } from "@/infrastructure/production/writes/ProductionFirestoreWritePort";
import {
  filterNavForTransportManager,
  isTransportManagerRole,
  TRANSPORT_MANAGER_HOME_HREF,
} from "@/domain/ui/transportManagerWorkspace";
import { homeHrefForRole } from "@/domain/ui/accountantWorkspace";
import { NAV_ITEMS } from "@/config/navigation";

describe("transport_manager auth + affiliated driver create", () => {
  it("maps transport_manager claim to scoped role", () => {
    const mapped = mapClaimsToIdentity({
      uid: "tm1",
      email: "fleet@touri.local",
      transport_manager: true,
      transport_company_id: "transport_company/co_sa_1",
      country_id: "countries/saudi_arabia",
    });
    expect("deny" in mapped).toBe(false);
    if ("deny" in mapped) return;
    expect(mapped.role).toBe("transport_manager");
    expect(mapped.scope.type).toBe("transport_company");
    expect(mapped.scope.transportCompanyIds).toEqual(["co_sa_1"]);
    expect(mapped.permissions).toEqual(
      permissionsForRole("transport_manager"),
    );
  });

  it("denies transport_manager without company id", () => {
    const mapped = mapClaimsToIdentity({
      uid: "tm2",
      transport_manager: true,
    });
    expect("deny" in mapped).toBe(true);
  });

  it("still denies partner claim", () => {
    const mapped = mapClaimsToIdentity({ uid: "p1", partner: true });
    expect("deny" in mapped).toBe(true);
    if ("deny" in mapped) {
      expect(mapped.reason).toMatch(/partner/);
    }
  });

  it("forces own company for transport_manager; blocks other company", () => {
    const forced = resolveAffiliatedTransportCompanyId({
      requestedCompanyId: null,
      actorRole: "transport_manager",
      actorTransportCompanyIds: ["co_a"],
    });
    expect(forced.ok).toBe(true);
    if (forced.ok) expect(forced.transportCompanyId).toBe("co_a");

    const denied = resolveAffiliatedTransportCompanyId({
      requestedCompanyId: "co_b",
      actorRole: "transport_manager",
      actorTransportCompanyIds: ["co_a"],
    });
    expect(denied.ok).toBe(false);
  });

  it("admin may set any transportCompanyId", () => {
    const ok = resolveAffiliatedTransportCompanyId({
      requestedCompanyId: "co_x",
      actorRole: "super_admin",
      actorTransportCompanyIds: [],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.transportCompanyId).toBe("co_x");
  });

  it("writes affiliated driver via Fake production port", async () => {
    const port = new FakeProductionFirestoreWritePort();
    const result = await executeDriverCreate(
      {
        actorUid: "tm1",
        displayName: "Fleet Driver",
        phoneE164: "+966500000099",
        countryId: "saudi_arabia",
        transportCompanyId: "co_a",
        idempotencyKey: "idem_fleet_1",
        correlationId: "corr_1",
      },
      {
        driverWriteEnabled: true,
        writePort: port,
        actorRole: "transport_manager",
        actorTransportCompanyIds: ["co_a"],
      },
    );
    expect(result.ok).toBe(true);
    expect(result.productionWriteExecuted).toBe(true);
    expect(result.transportCompanyId).toBe("co_a");
    const snap = await port.getDocument("user", result.driverId!);
    expect(snap.exists).toBe(true);
    expect(snap.data?.transport_company).toEqual({
      path: "transport_company/co_a",
    });
    expect(snap.data?.ismndob).toBe(true);
  });

  it("rejects cross-company create for transport_manager", async () => {
    const result = await executeDriverCreate(
      {
        actorUid: "tm1",
        displayName: "X",
        phoneE164: "+966500000098",
        countryId: "saudi_arabia",
        transportCompanyId: "other_co",
        idempotencyKey: "idem_x",
        correlationId: "c",
      },
      {
        driverWriteEnabled: true,
        writePort: new FakeProductionFirestoreWritePort(),
        actorRole: "transport_manager",
        actorTransportCompanyIds: ["co_a"],
      },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SCOPE_DENIED");
  });

  it("limits transport_manager nav and home", () => {
    expect(isTransportManagerRole("transport_manager")).toBe(true);
    expect(homeHrefForRole("transport_manager")).toBe(
      TRANSPORT_MANAGER_HOME_HREF,
    );
    const nav = filterNavForTransportManager(NAV_ITEMS);
    expect(nav.map((n) => n.href).sort()).toEqual([
      "/drivers",
      "/fleet",
      "/trips",
    ]);
  });
});
