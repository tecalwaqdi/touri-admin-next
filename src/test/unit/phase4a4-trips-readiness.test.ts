/**
 * Phase 4A-4 — Trips / Orders Fake/unit readiness suite.
 * NO Production Firebase calls.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { loadEnv, resetEnvCache, getEnv } from "@/config/env";
import { createShadowReadContainer } from "@/infrastructure/production/container/createContainers";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  LiveResourceNotEnabledError,
  parseLiveShadowAllowedResources,
  PHASE_4A4_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { mapCanonicalTripFromLegacyDoc } from "@/domain/trip/mapCanonicalTripRead";
import { resolveTripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import { resolveTripPayment } from "@/domain/trip/TripPaymentModels";
import { resolveTripCancellation } from "@/domain/trip/TripCancellationModel";
import { mapTripFinancialSafeRead } from "@/domain/trip/TripFinancialSafeRead";
import {
  auditTripDuplicates,
  classifyEmptyTripWindow,
  EMPTY_TRIP_WINDOW_BLOCKER,
  tripMappingReadyForLiveClose,
} from "@/domain/trip/TripDuplicateIdentityAudit";
import {
  FirebaseProductionTripReadRepository,
  PHASE_4A4_TRIPS_MAX_PAGE,
  tripWindowBoundToFirestoreDate,
} from "@/infrastructure/production/repositories/FirebaseProductionTripReadRepository";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { InvalidQueryLimitError } from "@/infrastructure/production/firestore/FirestoreReadClient";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { SENSITIVE_FIELD_REGISTRY } from "@/domain/read/SensitiveFieldRegistry";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import { ProductionWriteDisabledError } from "@/infrastructure/production/DisabledWriteRepository";
import { shadowTrapForRequest } from "@/infrastructure/production/shadow/ShadowTraps";
import { createProductionReadObservability } from "@/infrastructure/production/ObservabilityEvents";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QuerySafetyError } from "@/infrastructure/production/contracts/QuerySafety";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4a4",
    permissions: ["trips:read"],
    requestId: "req-4a4",
    correlationId: "corr-4a4",
    ...overrides,
  };
}

const liveTripsStartupBase = {
  PRODUCTION_READ_ENABLED: true,
  PRODUCTION_READ_MODE: "shadow" as const,
  AUTH_MODE: "verified_token" as const,
  EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false,
  LIVE_SHADOW_ALLOWED_RESOURCES: "trips",
  PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger" as const,
};

const completedSaTrip = {
  id: "ord_sa_riyadh_001",
  data: {
    status_code: "completed",
    payment_status: "cash_collected",
    PaymentMethod: "Cash",
    Rev_dolh: "countries/saudi_arabia",
    vill: "villages/city_sa_riyadh",
    USER: { path: "user/cust_sa_1", id: "cust_sa_1" },
    mndob_user: { path: "user/drv_sa_1", id: "drv_sa_1" },
    agent_id: "agent_sa_1",
    data_order: "2026-09-10T08:00:00.000Z",
    START: "2026-09-10T08:15:00.000Z",
    DATEEND: "2026-09-10T09:00:00.000Z",
    ActiveOrder: false,
    IDorder: "BK-1001",
    total_app: 7.5,
    total_vat: 0,
    total_mndob: 42.5,
    total_mndob2: 50,
    listAmakn: [
      {
        naim: "Pickup",
        Revmkan: { path: "mkan/lm_sa_riyadh_kingdom", id: "lm_sa_riyadh_kingdom" },
      },
      {
        naim: "Destination",
        Revmkan: { path: "mkan/lm_sa_riyadh_airport", id: "lm_sa_riyadh_airport" },
      },
    ],
    phone_numper: 966501234567,
    naim_user_text: "Customer Name",
  },
};

describe("Phase 4A-4 defaults + startup", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.PRODUCTION_READ_MODE).toBe("disabled");
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("");
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts trips-only live window", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(liveTripsStartupBase),
    ).not.toThrow();
    expect(PHASE_4A4_LIVE_RESOURCES).toEqual(["trips"]);
  });

  it("startup rejects trips+landmarks widen", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveTripsStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "trips,landmarks",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("startup rejects any write flag with trips read", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveTripsStartupBase,
        PRODUCTION_WRITE_ENABLED: true,
      }),
    ).toThrow(/PRODUCTION_WRITE_ENABLED=true/);
  });

  it("startup rejects FULL_PII_SHADOW_ENABLED", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...liveTripsStartupBase,
        FULL_PII_SHADOW_ENABLED: true,
      }),
    ).toThrow(/FULL_PII_SHADOW_ENABLED/);
  });

  it("loadEnv accepts trips-only live config", () => {
    const env = loadEnv({
      NODE_ENV: "production",
      APP_ENV: "production",
      AUTH_MODE: "verified_token",
      PRODUCTION_READ_ENABLED: true,
      PRODUCTION_READ_MODE: "shadow",
      EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
      EXPECTED_ENVIRONMENT: "production",
      LIVE_SHADOW_ALLOWED_RESOURCES: "trips",
      PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson",
      FULL_PII_SHADOW_ENABLED: false,
      PRODUCTION_WRITE_ENABLED: false,
      GLOBAL_PRODUCTION_WRITE_ENABLED: false,
      FINANCE_WRITE_ENABLED: false,
      DRIVER_WRITE_ENABLED: false,
      AGENT_WRITE_ENABLED: false,
    });
    expect(env.LIVE_SHADOW_ALLOWED_RESOURCES).toBe("trips");
  });
});

describe("Phase 4A-4 lifecycle / payment / cancel", () => {
  it("prefers status_code over halh_text", () => {
    const r = resolveTripLifecycleStatus({
      status_code: "driver_arrived",
      halh_text: "بإنتظار قبول المندوب",
      ActiveOrder: true,
    });
    expect(r.status).toBe("driver_arrived");
    expect(r.source).toBe("status_code");
    expect(r.isSafeForOperationalAction).toBe(true);
  });

  it("does not infer lifecycle solely from ActiveOrder absence", () => {
    const r = resolveTripLifecycleStatus({ ActiveOrder: false });
    expect(r.status).toBe("unmapped");
    expect(r.isSafeForOperationalAction).toBe(false);
    expect(r.warnings.some((w) => /not inferred/i.test(w))).toBe(true);
  });

  it("maps payment method Cash and status cash_collected separately from lifecycle", () => {
    const p = resolveTripPayment({
      PaymentMethod: "Cash",
      payment_status: "cash_collected",
    });
    expect(p.method).toBe("cash");
    expect(p.status).toBe("cash_collected");
  });

  it("cancellation actor from cancelledBy with reason evidence", () => {
    const c = resolveTripCancellation({
      lifecycleStatus: "cancelled_by_driver",
      cancelledBy: "driver",
      cancelReason: "customer_no_show",
      cancelledAt: "2026-09-10T10:00:00.000Z",
    });
    expect(c.isCancelled).toBe(true);
    expect(c.actor).toBe("driver");
    expect(c.actorKnowledge).toBe("proven");
    expect(c.reason).toBe("customer_no_show");
  });

  it("expired → system actor inferred from status_code", () => {
    const c = resolveTripCancellation({
      lifecycleStatus: "expired",
    });
    expect(c.actor).toBe("system");
    expect(c.actorKnowledge).toBe("inferred_from_status_code");
  });
});

describe("Phase 4A-4 financial safe-read", () => {
  it("persists total_app/vat/mndob including known zero — missing ≠ 0", () => {
    const withZero = mapTripFinancialSafeRead({
      documentId: "o1",
      data: { total_app: 7.5, total_vat: 0, total_mndob: 42.5, total_mndob2: 50 },
    });
    expect(withZero.totalApp.value).toBe(7.5);
    expect(withZero.totalVatKnowledge).toBe("known_zero");
    expect(withZero.totalVat.value).toBe(0);
    expect(withZero.vatRatePercent).toBeNull();
    expect(withZero.vatRateKnowledge).toBe("not_represented");
    expect(withZero.isAccountingApproved).toBe(false);
    expect(withZero.isSettlementSafe).toBe(false);

    const missing = mapTripFinancialSafeRead({
      documentId: "o2",
      data: { status_code: "completed" },
    });
    expect(missing.totalApp.value).toBeNull();
    expect(missing.totalAppKnowledge).toBe("missing");
    expect(missing.totalApp.value).not.toBe(0);
  });

  it("never assumes 15% rates", () => {
    const f = mapTripFinancialSafeRead({
      documentId: "o3",
      data: { total_app: 15, total_mndob2: 100 },
    });
    expect(f.platformCommissionRatePercent).toBeNull();
    expect(
      f.warnings.some(
        (w) =>
          /never assume 15%/i.test(w) ||
          w === "vat_rate_not_snapshotted" ||
          w === "platform_commission_rate_not_snapshotted",
      ),
    ).toBe(true);
  });
});

describe("Phase 4A-4 mapCanonicalTripFromLegacyDoc", () => {
  it("maps valid completed SA trip with geography + landmarks + finance", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: completedSaTrip.id,
      data: completedSaTrip.data,
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.lifecycleStatus).toBe("completed");
    expect(mapped.model.countryId.value).toBe("saudi_arabia");
    expect(mapped.model.cityId.value).toBe("city_sa_riyadh");
    expect(mapped.model.customerId).toBe("cust_sa_1");
    expect(mapped.model.driverId).toBe("drv_sa_1");
    expect(mapped.model.pickupLandmarkId).toBe("lm_sa_riyadh_kingdom");
    expect(mapped.model.destinationLandmarkId).toBe("lm_sa_riyadh_airport");
    expect(mapped.model.financialSafeRead.totalApp.value).toBe(7.5);
    expect(mapped.model.paymentMethod.value).toBe("cash");
    expect(mapped.model.paymentStatus.value).toBe("cash_collected");
    // PII never on model
    expect(JSON.stringify(mapped.model)).not.toContain("Customer Name");
    expect(JSON.stringify(mapped.model)).not.toContain("966501234567");
  });

  it("unmappedCountry when Rev_dolh missing — never invents from coords/phone", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_orphan",
      data: {
        status_code: "pending_driver",
        phone_numper: 966500000000,
        originLatitude: 24.7,
        originLongitude: 46.6,
        vill: "villages/city_sa_riyadh",
        data_order: "2026-09-10T00:00:00.000Z",
      },
    });
    expect(mapped.mappingStatus).toBe("unmappedCountry");
    expect(mapped.model.countryId.value).toBeNull();
  });

  it("absent vill → validMapped + city_not_represented — never invents from landmark name", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_no_city",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        listAmakn: [{ naim: "Riyadh Airport", Revmkan: "mkan/x" }],
        data_order: "2026-09-10T00:00:00.000Z",
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.cityId.value).toBeNull();
    expect(
      mapped.mappingWarnings.some((w) => w.code === "city_not_represented"),
    ).toBe(true);
  });

  it("testOrNoncanonical for cp5 order ids", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "cp5_order_99",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        data_order: "2026-09-10T00:00:00.000Z",
      },
    });
    expect(mapped.mappingStatus).toBe("testOrNoncanonical");
  });

  it("pending_driver with null driverId is known-missing not invent", () => {
    const mapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord_pending",
      data: {
        status_code: "pending_driver",
        Rev_dolh: "countries/kyrgyzstan",
        vill: "villages/city_kg_bishkek",
        USER: "user/c1",
        data_order: "2026-09-10T00:00:00.000Z",
        PaymentMethod: "OnlinePayment",
        payment_status: "paid",
      },
    });
    expect(mapped.mappingStatus).toBe("validMapped");
    expect(mapped.model.driverId).toBeNull();
    expect(mapped.model.driverIdKnowledge).toBe("missing");
    expect(mapped.model.paymentMethod.value).toBe("online");
  });
});

describe("Phase 4A-4 TripReadRepository Fake path", () => {
  it("queries collection order by data_order with page ≤50", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [
      { id: completedSaTrip.id, data: completedSaTrip.data },
      {
        id: "ord_kg",
        data: {
          status_code: "driver_assigned",
          Rev_dolh: { path: "countries/kyrgyzstan", id: "kyrgyzstan" },
          vill: { path: "villages/city_kg_bishkek", id: "city_kg_bishkek" },
          USER: "user/c_kg",
          mndob_user: "user/d_kg",
          data_order: "2026-09-10T12:00:00.000Z",
          PaymentMethod: "Cash",
          payment_status: "pending_cash",
          ActiveOrder: true,
        },
      },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("trips"),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.collectionQueried).toBe("order");
    expect(PHASE_4A4_TRIPS_MAX_PAGE).toBe(50);
    expect(page.items.length).toBe(2);
    expect(page.auditMetrics.recordsRead).toBe(2);
    expect(client.queryLog.every((q) => q.collection === "order")).toBe(true);
    expect(
      client.queryLog.every((q) =>
        (q.orderBy ?? []).some((o) => o.field === "data_order"),
      ),
    ).toBe(true);

    await expect(repo.list(ctx(), {}, { limit: 51 })).rejects.toBeInstanceOf(
      InvalidQueryLimitError,
    );
  });

  it("resource gate denies trips when allowlist is landmarks", async () => {
    const client = new FakeFirestoreReadClient();
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("landmarks"),
    });
    await expect(repos.trips.list(ctx(), {}, { limit: 10 })).rejects.toBeInstanceOf(
      LiveResourceNotEnabledError,
    );
  });

  it("kill switch denies when Production Read disabled", async () => {
    const client = new FakeFirestoreReadClient();
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: false,
    });
    await expect(repo.list(ctx(), {}, { limit: 10 })).rejects.toBeInstanceOf(
      ProductionReadDisabledError,
    );
  });

  it("country scope post-filters after map", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [
      { id: completedSaTrip.id, data: completedSaTrip.data },
      {
        id: "ord_kg",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/kyrgyzstan",
          vill: "villages/city_kg_bishkek",
          data_order: "2026-09-10T12:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repo.list(
      ctx({
        scope: { type: "country", countryIds: ["saudi_arabia"] },
        serverScopeFilter: { countryIds: ["saudi_arabia"] },
      }),
      {},
      { limit: 50 },
    );
    expect(page.items.every((i) => i.data.countryId.value === "saudi_arabia")).toBe(
      true,
    );
    expect(page.items.some((i) => i.data.id === "ord_kg")).toBe(false);
  });

  it("collection allowlist includes order; deny settlements", () => {
    expect(isCollectionAllowedForProductionRead("order")).toBe(true);
    expect(isCollectionAllowedForProductionRead("settlements")).toBe(false);
  });

  it("write trap denies mutations", async () => {
    const c = createShadowReadContainer();
    await expect(
      c.writes.create({ resource: "trips", operation: "create" }),
    ).rejects.toBeInstanceOf(ProductionWriteDisabledError);
    const trap = shadowTrapForRequest({
      method: "POST",
      path: "/api/trips",
      productionReadMode: "shadow",
      allowSyntheticMutations: false,
    });
    expect(trap.action).toBe("deny");
  });

  it("no N+1 — single order query only (no user/mkan/villages)", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [{ id: completedSaTrip.id, data: completedSaTrip.data }]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    await repo.list(ctx(), {}, { limit: 10 });
    const collections = new Set(client.queryLog.map((q) => q.collection));
    expect([...collections]).toEqual(["order"]);
    expect(client.getLog?.length ?? 0).toBe(0);
  });
});

describe("Phase 4A-4 PII registry + duplicate audit", () => {
  it("registers trip PII / financial sensitive fields", () => {
    const tripFields = SENSITIVE_FIELD_REGISTRY.filter((r) => r.resource === "trip");
    expect(tripFields.some((r) => r.field === "phone_numper")).toBe(true);
    expect(tripFields.some((r) => r.field === "naim_user_text")).toBe(true);
    expect(tripFields.some((r) => r.field === "total_app")).toBe(true);
  });

  it("duplicate audit metrics from evidence not name alone", () => {
    const metrics = auditTripDuplicates([
      {
        sourceDocumentId: "a",
        canonicalTripId: "a",
        iDorder: "BK-1",
        customerId: "c1",
        createdAtUtc: "2026-09-10T00:00:00.000Z",
        mappingStatus: "validMapped",
        lifecycleStatus: "completed",
        activeOrderFlag: false,
      },
      {
        sourceDocumentId: "b",
        canonicalTripId: "b",
        iDorder: "BK-1",
        customerId: "c1",
        createdAtUtc: "2026-09-10T00:00:00.000Z",
        mappingStatus: "validMapped",
        lifecycleStatus: "completed",
        activeOrderFlag: false,
      },
      {
        sourceDocumentId: "cp5_order_1",
        canonicalTripId: "cp5_order_1",
        iDorder: null,
        customerId: null,
        createdAtUtc: null,
        mappingStatus: "testOrNoncanonical",
        lifecycleStatus: "completed",
        activeOrderFlag: null,
      },
    ]);
    expect(metrics.sameIdOrderAliasDuplicates).toBeGreaterThan(0);
    expect(metrics.semanticCustomerTimeDuplicates).toBeGreaterThan(0);
    expect(metrics.testOrNoncanonical).toBe(1);
    expect(tripMappingReadyForLiveClose(metrics)).toBe(true);
  });

  it("active operational duplicates block live close", () => {
    const metrics = auditTripDuplicates([
      {
        sourceDocumentId: "a",
        canonicalTripId: "a",
        iDorder: null,
        customerId: "c1",
        createdAtUtc: "2026-09-10T00:00:00.000Z",
        mappingStatus: "validMapped",
        lifecycleStatus: "driver_assigned",
        activeOrderFlag: true,
      },
      {
        sourceDocumentId: "b",
        canonicalTripId: "b",
        iDorder: null,
        customerId: "c1",
        createdAtUtc: "2026-09-10T01:00:00.000Z",
        mappingStatus: "validMapped",
        lifecycleStatus: "trip_in_progress",
        activeOrderFlag: true,
      },
    ]);
    expect(metrics.activeOperationalDuplicates).toBeGreaterThan(0);
    expect(tripMappingReadyForLiveClose(metrics)).toBe(false);
  });
});

describe("Phase 4A-4 zero-result live trips audit regressions", () => {
  it("recordsRead=0 → NO_GO / EMPTY_TRIP_WINDOW and not ready for close", () => {
    const gate = classifyEmptyTripWindow({ recordsRead: 0 });
    expect(gate).toEqual({
      overallStatus: "NO_GO",
      mappingReadyForLiveClose: false,
      blocker: EMPTY_TRIP_WINDOW_BLOCKER,
    });
    expect(
      tripMappingReadyForLiveClose({
        recordsRead: 0,
        validMapped: 0,
        unmappedCountry: 0,
        unmappedCity: 0,
        unmappedStatus: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        testOrNoncanonical: 0,
        unknownCustomerReference: 0,
        unknownDriverReference: 0,
        unknownLifecycleStatus: 0,
        conflictingLifecycleStatus: 0,
        financialUnknown: 0,
        financialConflicting: 0,
        financialPersistedComplete: 0,
        financialAmountUnknown: 0,
        financialRateUnknown: 0,
        financialNotRepresented: 0,
        financialDerived: 0,
        exactCanonicalDuplicates: 0,
        sameIdOrderAliasDuplicates: 0,
        semanticCustomerTimeDuplicates: 0,
        semanticDuplicates: 0,
        activeOperationalDuplicates: 0,
        hits: [],
      }),
    ).toBe(false);
  });

  it("recordsRead > 0 required for closure when other gates clean", () => {
    expect(
      tripMappingReadyForLiveClose({
        recordsRead: 1,
        validMapped: 1,
        unmappedCountry: 0,
        unmappedCity: 0,
        unmappedStatus: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        testOrNoncanonical: 0,
        unknownCustomerReference: 0,
        unknownDriverReference: 0,
        unknownLifecycleStatus: 0,
        conflictingLifecycleStatus: 0,
        financialUnknown: 2,
        financialConflicting: 0,
        financialPersistedComplete: 0,
        financialAmountUnknown: 2,
        financialRateUnknown: 0,
        financialNotRepresented: 0,
        financialDerived: 0,
        exactCanonicalDuplicates: 0,
        sameIdOrderAliasDuplicates: 0,
        semanticCustomerTimeDuplicates: 0,
        semanticDuplicates: 0,
        activeOperationalDuplicates: 0,
        hits: [],
      }),
    ).toBe(true);
  });

  it("financialConflicting blocks close; financialUnknown alone does not", () => {
    expect(
      tripMappingReadyForLiveClose({
        recordsRead: 1,
        validMapped: 1,
        unmappedCountry: 0,
        unmappedCity: 0,
        unmappedStatus: 0,
        ambiguousCountry: 0,
        ambiguousCity: 0,
        malformed: 0,
        testOrNoncanonical: 0,
        unknownCustomerReference: 0,
        unknownDriverReference: 0,
        unknownLifecycleStatus: 0,
        conflictingLifecycleStatus: 0,
        financialUnknown: 0,
        financialConflicting: 1,
        financialPersistedComplete: 0,
        financialAmountUnknown: 0,
        financialRateUnknown: 0,
        financialNotRepresented: 0,
        financialDerived: 0,
        exactCanonicalDuplicates: 0,
        sameIdOrderAliasDuplicates: 0,
        semanticCustomerTimeDuplicates: 0,
        semanticDuplicates: 0,
        activeOperationalDuplicates: 0,
        hits: [],
      }),
    ).toBe(false);
  });

  it("unknownLifecycleStatus blocks close; cityNotRepresented does not", () => {
    expect(
      tripMappingReadyForLiveClose(
        {
          recordsRead: 14,
          validMapped: 14,
          unmappedCountry: 0,
          unmappedCity: 0,
          unmappedStatus: 0,
          ambiguousCountry: 0,
          ambiguousCity: 0,
          malformed: 0,
          testOrNoncanonical: 0,
          unknownCustomerReference: 0,
          unknownDriverReference: 0,
          unknownLifecycleStatus: 1,
          conflictingLifecycleStatus: 0,
          financialUnknown: 0,
          financialConflicting: 0,
          financialPersistedComplete: 14,
          financialAmountUnknown: 0,
          financialRateUnknown: 0,
          financialNotRepresented: 14,
          financialDerived: 0,
          exactCanonicalDuplicates: 0,
          sameIdOrderAliasDuplicates: 0,
          semanticCustomerTimeDuplicates: 0,
          semanticDuplicates: 0,
          activeOperationalDuplicates: 0,
          hits: [],
        },
        { cityNotRepresented: 7, cityMissingUnresolved: 0 },
      ),
    ).toBe(false);
    expect(
      tripMappingReadyForLiveClose(
        {
          recordsRead: 14,
          validMapped: 14,
          unmappedCountry: 0,
          unmappedCity: 0,
          unmappedStatus: 0,
          ambiguousCountry: 0,
          ambiguousCity: 0,
          malformed: 0,
          testOrNoncanonical: 0,
          unknownCustomerReference: 0,
          unknownDriverReference: 0,
          unknownLifecycleStatus: 0,
          conflictingLifecycleStatus: 0,
          financialUnknown: 0,
          financialConflicting: 0,
          financialPersistedComplete: 14,
          financialAmountUnknown: 0,
          financialRateUnknown: 0,
          financialNotRepresented: 14,
          financialDerived: 0,
          exactCanonicalDuplicates: 0,
          sameIdOrderAliasDuplicates: 0,
          semanticCustomerTimeDuplicates: 0,
          semanticDuplicates: 0,
          activeOperationalDuplicates: 0,
          hits: [],
        },
        { cityNotRepresented: 7, cityMissingUnresolved: 0 },
      ),
    ).toBe(true);
  });

  it("window bounds are Date (not ISO string) for Firestore Timestamp match", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    // Seed Timestamp-like field (toDate) — mirrors Admin SDK Timestamp
    client.seed("order", [
      {
        id: "ord_ts",
        data: {
          ...completedSaTrip.data,
          data_order: {
            toDate: () => new Date("2026-09-10T08:00:00.000Z"),
          },
        },
      },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("trips"),
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.auditMetrics.recordsRead).toBe(1);
    expect(page.queryMeta.queryFilterBoundType).toBe("Date");
    const q = client.queryLog[0];
    expect(q.filters?.every((f) => f.value instanceof Date)).toBe(true);
    expect(typeof q.filters?.[0]?.value).not.toBe("string");
  });

  it("ISO string filter bounds against Timestamp docs yield zero (type mismatch proof)", async () => {
    const client = new FakeFirestoreReadClient();
    client.seed("order", [
      {
        id: "ord_ts",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/saudi_arabia",
          vill: "villages/city_sa_riyadh",
          data_order: {
            toDate: () => new Date("2026-09-10T08:00:00.000Z"),
          },
        },
      },
    ]);
    // Simulate pre-fix bug: ISO string bounds
    const result = await client.query({
      collection: "order",
      filters: [
        { field: "data_order", op: ">=", value: "2026-09-05T00:00:00.000Z" },
        { field: "data_order", op: "<=", value: "2026-09-12T00:00:00.000Z" },
      ],
      orderBy: [{ field: "data_order", direction: "desc" }],
      limit: 50,
    });
    expect(result.docs.length).toBe(0);
  });

  it("boundedLatestPage stays ≤50, one query, no date filters, no unbounded scan", async () => {
    const client = new FakeFirestoreReadClient();
    const docs = Array.from({ length: 60 }, (_, i) => ({
      id: `ord_${i}`,
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        data_order: new Date(Date.UTC(2026, 0, 1 + (i % 28))).toISOString(),
      },
    }));
    client.seed("order", docs);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      liveShadowAllowedResources: parseLiveShadowAllowedResources("trips"),
    });
    const page = await repo.list(
      ctx(),
      { boundedLatestPage: true },
      { limit: PHASE_4A4_TRIPS_MAX_PAGE },
    );
    expect(page.items.length).toBe(50);
    expect(page.auditMetrics.recordsRead).toBe(50);
    expect(page.queryMeta.queryMode).toBe("bounded_latest_page");
    expect(page.queryMeta.queryLimit).toBe(50);
    expect(page.queryMeta.queryWindowStart).toBeNull();
    expect(client.queryLog).toHaveLength(1);
    expect(client.queryLog[0]?.filters ?? []).toEqual([]);
    expect(client.queryLog[0]?.limit).toBe(50);
    await expect(
      repo.list(ctx(), { boundedLatestPage: true }, { limit: 51 }),
    ).rejects.toBeInstanceOf(InvalidQueryLimitError);
  });

  it("missing data_order is excluded by orderBy (Firestore field existence)", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    client.seed("order", [
      {
        id: "ord_missing_ts",
        data: {
          status_code: "completed",
          Rev_dolh: "countries/saudi_arabia",
          vill: "villages/city_sa_riyadh",
          // no data_order
        },
      },
      { id: completedSaTrip.id, data: completedSaTrip.data },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.items.every((i) => i.data.id !== "ord_missing_ts")).toBe(true);
    expect(page.auditMetrics.recordsRead).toBe(1);
  });

  it("invalid window ISO fails safely", () => {
    expect(() => tripWindowBoundToFirestoreDate("not-a-date")).toThrow(
      QuerySafetyError,
    );
  });

  it("kill-switch event emitted through real observability sink", () => {
    const dir = join(tmpdir(), `phase4a4-kill-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "obs.ndjson");
    writeFileSync(file, "", "utf8");
    const obs = createProductionReadObservability({
      sink: "file_ndjson",
      filePath: file,
    });
    obs.emit({ type: "production_read_request", resource: "trips" });
    obs.emit({
      type: "kill_switch_triggered",
      flag: "PRODUCTION_READ_ENABLED",
    });
    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(lines.some((l) => l.includes("production_read_request"))).toBe(true);
    expect(lines.some((l) => l.includes("kill_switch_triggered"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("zero-result page still produces full readiness metric zeros + query meta", async () => {
    const client = new FakeFirestoreReadClient();
    const now = new Date("2026-09-11T12:00:00.000Z");
    // Orders outside the 7d window
    client.seed("order", [
      {
        id: "ord_old",
        data: {
          ...completedSaTrip.data,
          data_order: "2025-01-01T00:00:00.000Z",
        },
      },
    ]);
    const repo = new FirebaseProductionTripReadRepository({
      client,
      productionReadEnabled: true,
      now: () => now,
    });
    const page = await repo.list(ctx(), {}, { limit: 50 });
    expect(page.auditMetrics.recordsRead).toBe(0);
    expect(page.auditMetrics.validMapped).toBe(0);
    expect(page.auditMetrics.testOrNoncanonical).toBe(0);
    expect(page.auditMetrics.unmappedCountry).toBe(0);
    expect(page.auditMetrics.unmappedCity).toBe(0);
    expect(page.auditMetrics.unknownCustomerReference).toBe(0);
    expect(page.auditMetrics.unknownDriverReference).toBe(0);
    expect(page.auditMetrics.unknownLifecycleStatus).toBe(0);
    expect(page.auditMetrics.conflictingLifecycleStatus).toBe(0);
    expect(page.auditMetrics.financialUnknown).toBe(0);
    expect(page.auditMetrics.financialConflicting).toBe(0);
    expect(page.auditMetrics.financialPersistedComplete).toBe(0);
    expect(page.auditMetrics.financialAmountUnknown).toBe(0);
    expect(page.auditMetrics.financialRateUnknown).toBe(0);
    expect(page.auditMetrics.financialNotRepresented).toBe(0);
    expect(page.auditMetrics.financialDerived).toBe(0);
    expect(page.tripGeographyDiagnostics).toEqual([]);
    expect(page.geographyCounters.directCityMapped).toBe(0);
    expect(page.auditMetrics.exactCanonicalDuplicates).toBe(0);
    expect(page.auditMetrics.semanticDuplicates).toBe(0);
    expect(page.auditMetrics.activeOperationalDuplicates).toBe(0);
    expect(page.queryMeta.queryTimestampField).toBe("data_order");
    expect(page.queryMeta.queryOrderDirection).toBe("desc");
    expect(page.queryMeta.queryLimit).toBe(50);
    expect(page.queryMeta.queryWindowStart).toBeTruthy();
    expect(page.queryMeta.queryWindowEnd).toBeTruthy();
    expect(classifyEmptyTripWindow(page.auditMetrics)?.blocker).toBe(
      EMPTY_TRIP_WINDOW_BLOCKER,
    );
  });
});
