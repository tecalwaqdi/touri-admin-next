import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapLegacyFinancialSnapshotToCanonical,
  observedLegacyQuoteMajors,
  LEGACY_FINANCIAL_SOURCE_PRIORITY,
  type LegacyFinancialSnapshotFixture,
} from "@/domain/canonical/mapLegacyFinancialSnapshot";
import { isProductionReadableClass } from "@/domain/canonical/FieldProvenance";
import { mapLegacyTripStatusContract } from "@/domain/canonical/legacyStatusContract";
import {
  FakeIdTokenVerifier,
  mapClaimsToIdentity,
  resolveActorFromIdToken,
  AUTH_CLAIM_MAPPING_TABLE,
} from "@/domain/auth/ProductionAuthDesign";
import { isHeaderUserIdAuthAllowed } from "@/infrastructure/http/apiAuth";
import { getEnv } from "@/config/env";

type FixtureFile = {
  fixtures: Array<
    LegacyFinancialSnapshotFixture & {
      id: string;
      expectedMajors?: Record<string, number>;
      omitExpectedMajors?: boolean;
      total?: number | null;
      total_mndob2?: number | null;
      total_app?: number | null;
      total_vat?: number | null;
      total_mndob?: number | null;
    }
  >;
};

function loadFixtures(): FixtureFile {
  const path = join(
    process.cwd(),
    "docs/legacy-mapping/legacy-financial-fixtures.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as FixtureFile;
}

describe("Phase 3.5 canonical financial mapping", () => {
  it("loads synthetic fixtures (not production data)", () => {
    const file = loadFixtures();
    expect(file.fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it("maps persisted majors with provenance and isLedger=false", () => {
    const file = loadFixtures();
    const f = file.fixtures[0];
    const majors = observedLegacyQuoteMajors({
      baseFareHalalas: f.observed!.baseFareHalalas!,
      platformFeePercent: f.observed!.platformFeePercentHardcoded,
      vatPercent: f.observed!.vatPercent,
      applyVat: f.observed!.isvat,
      discountHalalas: f.observed!.discountHalalas,
    });
    const canonical = mapLegacyFinancialSnapshotToCanonical({
      ...f,
      ...majors,
    });
    expect(canonical.isLedger).toBe(false);
    expect(canonical.baseFare.value).toBe(50);
    expect(canonical.platformCommissionAmount.value).toBe(7.5);
    expect(canonical.driverNet.value).toBe(42.5);
    expect(canonical.baseFare.provenance.sourceField).toBe("total_mndob2");
    // Phase 3.6: historical rate is unknown (not invented); amount remains Class A.
    expect(canonical.platformCommissionRatePercent.value).toBeNull();
    expect(canonical.conceptClasses.platformCommissionRatePercent).toBe(
      "E_unknown",
    );
    expect(canonical.conceptClasses.platformCommissionAmount).toBe(
      "A_authoritative_persisted",
    );
  });

  it("does not coerce missing driver net to 0", () => {
    const incomplete = mapLegacyFinancialSnapshotToCanonical({
      orderId: "x",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: null,
      PaymentMethod: "cash",
      payment_status: "cash_collected",
    });
    expect(incomplete.driverNet.value).toBeNull();
    expect(incomplete.incompleteReasons).toContain("driver_net_missing");
    expect(incomplete.driverNet.provenance.warnings[0]).toMatch(/missing/);
  });

  it("maps unknown payment channel to unmapped", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "y",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
    });
    expect(m.paymentChannel.value).toBe("unmapped");
  });

  it("classifies gateway fee as missing (null not 0)", () => {
    const m = mapLegacyFinancialSnapshotToCanonical({
      orderId: "z",
      currency: "SAR",
      total: 50,
      total_mndob2: 50,
      total_app: 7.5,
      total_vat: 0,
      total_mndob: 42.5,
      PaymentMethod: "online",
      ALLNOW: true,
      payment_status: "paid",
    });
    expect(m.gatewayFee.value).toBeNull();
    expect(m.conceptClasses.gatewayFee).toBe("D_missing");
    expect(isProductionReadableClass("D_missing")).toBe(false);
    expect(isProductionReadableClass("C_conflicting")).toBe(false);
    expect(isProductionReadableClass("A_authoritative_persisted")).toBe(true);
  });

  it("exposes evidence-based source priority policy", () => {
    expect(LEGACY_FINANCIAL_SOURCE_PRIORITY[0].priority).toBe(1);
    expect(LEGACY_FINANCIAL_SOURCE_PRIORITY.some((p) => p.class === "C_conflicting")).toBe(
      true,
    );
  });
});

describe("Phase 3.5 differential: Observed Legacy formula vs Canonical mapping", () => {
  it("FIN-FIX-001..003 majors match observedLegacyQuoteMajors then canonical values", () => {
    const file = loadFixtures();
    for (const f of file.fixtures) {
      if (f.omitExpectedMajors || !f.expectedMajors || !f.observed) continue;
      const computed = observedLegacyQuoteMajors({
        baseFareHalalas: f.observed.baseFareHalalas!,
        platformFeePercent: f.observed.platformFeePercentHardcoded,
        vatPercent: f.observed.vatPercent,
        applyVat: f.observed.isvat,
        discountHalalas: f.observed.discountHalalas,
      });
      expect(computed.total_mndob2).toBe(f.expectedMajors.total_mndob2);
      expect(computed.total_app).toBe(f.expectedMajors.total_app);
      expect(computed.total_vat).toBe(f.expectedMajors.total_vat);
      expect(computed.total).toBe(f.expectedMajors.total);
      expect(computed.total_mndob).toBe(f.expectedMajors.total_mndob);

      const canonical = mapLegacyFinancialSnapshotToCanonical({
        ...f,
        ...computed,
      });
      expect(canonical.baseFare.value).toBe(f.expectedMajors.total_mndob2);
      expect(canonical.platformCommissionAmount.value).toBe(
        f.expectedMajors.total_app,
      );
      expect(canonical.vatAmount.value).toBe(f.expectedMajors.total_vat);
      expect(canonical.finalCustomerPrice.value).toBe(f.expectedMajors.total);
      expect(canonical.driverNet.value).toBe(f.expectedMajors.total_mndob);
    }
  });

  it("discount does not reduce observed driver net (FC-02 Observed)", () => {
    const withDisc = observedLegacyQuoteMajors({
      baseFareHalalas: 5000,
      platformFeePercent: 15,
      applyVat: false,
      discountHalalas: 500,
    });
    const noDisc = observedLegacyQuoteMajors({
      baseFareHalalas: 5000,
      platformFeePercent: 15,
      applyVat: false,
      discountHalalas: 0,
    });
    expect(withDisc.total).toBe(45);
    expect(withDisc.total_mndob).toBe(noDisc.total_mndob);
  });

  it("agent amount = round(platformMinor * rate / 100)", () => {
    const platformMinor = 1500;
    const rate = 20;
    expect(Math.round((platformMinor * rate) / 100)).toBe(300);
  });
});

describe("Phase 3.5 legacy status → unmapped", () => {
  it("maps proven status_code values with high confidence", () => {
    expect(mapLegacyTripStatusContract("pending_driver").canonical).toBe(
      "waiting_driver",
    );
    expect(mapLegacyTripStatusContract("completed").canonical).toBe("completed");
    expect(mapLegacyTripStatusContract("completed").confidence).toBe("high");
  });

  it("never guesses nearest for unknown status", () => {
    const r = mapLegacyTripStatusContract("weird_status_xyz");
    expect(r.canonical).toBe("unmapped");
    expect(r.confidence).toBe("unknown");
  });

  it("empty status → unmapped", () => {
    expect(mapLegacyTripStatusContract(null).canonical).toBe("unmapped");
    expect(mapLegacyTripStatusContract("").canonical).toBe("unmapped");
  });
});

describe("Phase 3.5 auth fail-closed (Fake verifier — no Firebase)", () => {
  it("rejects missing token", async () => {
    const v = new FakeIdTokenVerifier({});
    const r = await resolveActorFromIdToken(v, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing_token");
  });

  it("rejects invalid token", async () => {
    const v = new FakeIdTokenVerifier({});
    const r = await resolveActorFromIdToken(v, "nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_token");
  });

  it("rejects expired token", async () => {
    const v = new FakeIdTokenVerifier({
      expired: {
        error: {
          ok: false,
          reason: "expired_token",
          message: "expired",
        },
      },
    });
    const r = await resolveActorFromIdToken(v, "expired");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired_token");
  });

  it("rejects unknown claim role (partner)", async () => {
    const v = new FakeIdTokenVerifier({
      partner: { uid: "u1", partner: true, email: "p@x.com" },
    });
    const r = await resolveActorFromIdToken(v, "partner");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unknown_claim_role|unsupported_legacy_role/);
  });

  it("rejects country_admin missing scope", () => {
    const mapped = mapClaimsToIdentity({
      uid: "u2",
      country_admin: true,
    });
    expect("deny" in mapped).toBe(true);
    if ("deny" in mapped) expect(mapped.reason).toMatch(/missing_scope/);
  });

  it("rejects agent missing country scope", () => {
    const mapped = mapClaimsToIdentity({ uid: "a1", agent: true });
    expect("deny" in mapped).toBe(true);
  });

  it("accepts super_admin claim", async () => {
    const v = new FakeIdTokenVerifier({
      sa: { uid: "sa1", email: "sa@x.com", super_admin: true },
    });
    const r = await resolveActorFromIdToken(v, "sa");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.identity.role).toBe("super_admin");
      expect(r.identity.scope.type).toBe("global");
    }
  });

  it("documents claim mapping table", () => {
    expect(AUTH_CLAIM_MAPPING_TABLE.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps production x-user-id rejection (dev-only trust)", () => {
    expect(isHeaderUserIdAuthAllowed("development")).toBe(true);
    expect(isHeaderUserIdAuthAllowed("production")).toBe(false);
    expect(isHeaderUserIdAuthAllowed("staging")).toBe(false);
  });

  it("keeps PRODUCTION_* flags false", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.GLOBAL_PRODUCTION_WRITE_ENABLED).toBe(false);
  });
});
