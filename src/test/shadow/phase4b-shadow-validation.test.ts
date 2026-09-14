/**
 * Phase 4B — offline shadow validation suite.
 * NO Production Firebase calls. FULL_PII_SHADOW_ENABLED=false. All write flags false.
 * Covers: cross-resource, not_represented, cross-domain, one-agent invariant,
 * PII, financial missing≠0, scope, pagination, allowlist, write traps, kill switch,
 * fingerprint, summary reconciliation.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { resetEnvCache, getEnv } from "@/config/env";
import { createProductionReadRepositories } from "@/infrastructure/production/repositories/createProductionReadRepositories";
import { FakeFirestoreReadClient } from "@/infrastructure/production/firestore/FakeFirestoreReadClient";
import {
  parseLiveShadowAllowedResources,
  PHASE_4B_LIVE_RESOURCES,
  LIVE_SHADOW_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import {
  runPhase4BShadowValidation,
  validateCrossResourceReferences,
  auditCrossDomainContamination,
  assertSerializedHasNoRawPii,
  assertCustomerDtoPiiSafe,
  assertDriverDtoPiiSafe,
  validateTripFinancialSafety,
  runPhase4BScopeValidation,
  validatePaginationConsistency,
  runPhase4BWriteTraps,
  phase4BClosingGatesPass,
  collectPhase4BClosingBlockers,
  isReadyForControlledWrites,
  isEligibleForControlledWritesPhase,
  isControlledWritesEnabled,
  isShadowValidationPassed,
  derivePhase4BWriteReadinessFlags,
  isPhase4BLiveShadowEnabled,
  PHASE_4B_EXPECTED_PROJECT_ID,
  PHASE_4B_PAGE_LIMITS,
  PHASE_4B_SAFE_ORDER_FIELDS,
  emptyPhase4BShadowSummary,
  isLegitimateGeographyAbsence,
} from "@/application/shadow-validation";
import { mapCanonicalCustomerFromLegacyDoc } from "@/domain/customer/mapCanonicalCustomerRead";
import { mapCanonicalDriverFromLegacyDoc } from "@/domain/driver/mapCanonicalDriverRead";
import { mapCanonicalAgentFromLegacyDoc } from "@/domain/agent/mapCanonicalAgentRead";
import { mapCanonicalTripFromLegacyDoc } from "@/domain/trip/mapCanonicalTripRead";
import { mapTripFinancialSafeRead } from "@/domain/trip/TripFinancialSafeRead";
import type { ProductionReadContext } from "@/infrastructure/production/contracts/ProductionReadRepositories";
import { ProductionReadDisabledError } from "@/infrastructure/production/ProductionReadGate";
import { isGenericCollectionReadPath } from "@/domain/read/ReadAuthorization";

function ctx(
  overrides?: Partial<ProductionReadContext>,
): ProductionReadContext {
  return {
    scope: { type: "global" },
    serverScopeFilter: {},
    actorUid: "auditor-4b",
    permissions: [
      "trips:read",
      "drivers:read",
      "agents:read",
      "customers:read",
      "audit:read",
    ],
    requestId: "req-4b",
    correlationId: "corr-4b",
    ...overrides,
  };
}

const ALL_RESOURCES =
  "countries,cities,landmarks,trips,drivers,agents,customers";

const livePhase4BStartupBase = {
  PRODUCTION_READ_ENABLED: true,
  PRODUCTION_READ_MODE: "shadow" as const,
  AUTH_MODE: "verified_token" as const,
  EXPECTED_PROJECT_ID: PHASE_4B_EXPECTED_PROJECT_ID,
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false,
  LIVE_SHADOW_ALLOWED_RESOURCES: ALL_RESOURCES,
  PRODUCTION_READ_OBSERVABILITY_SINK: "file_ndjson" as const,
};

const writeEnv = {
  PRODUCTION_WRITE_ENABLED: false,
  GLOBAL_PRODUCTION_WRITE_ENABLED: false,
  DRIVER_WRITE_ENABLED: false,
  AGENT_WRITE_ENABLED: false,
  CUSTOMER_WRITE_ENABLED: false,
  FINANCE_WRITE_ENABLED: false,
  FULL_PII_SHADOW_ENABLED: false as const,
  EXPECTED_PROJECT_ID: PHASE_4B_EXPECTED_PROJECT_ID,
};

function seedPhase4BFixture(client: FakeFirestoreReadClient): void {
  client.seed("countries", [
    { id: "saudi_arabia", data: { naim: "Saudi Arabia", currencyCode: "SAR" } },
  ]);
  client.seed("villages", [
    {
      id: "city_sa_riyadh",
      data: {
        naim: "الرياض",
        dolh: "countries/saudi_arabia",
        acctev: true,
      },
    },
  ]);
  client.seed("mkan", [
    {
      id: "lm_sa_riyadh_kingdom",
      data: {
        naim: "برج المملكة",
        Rev_dolh: "countries/saudi_arabia",
        id_vill: "villages/city_sa_riyadh",
        acctev: true,
        Location: { latitude: 24.7113, longitude: 46.6744 },
      },
    },
  ]);
  client.seed("order", [
    {
      id: "ord_sa_riyadh_001",
      data: {
        status_code: "completed",
        payment_status: "cash_collected",
        PaymentMethod: "Cash",
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        USER: { path: "user/cust_sa_1", id: "cust_sa_1" },
        mndob_user: { path: "user/drv_sa_riyadh_001", id: "drv_sa_riyadh_001" },
        data_order: "2026-09-10T08:00:00.000Z",
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
        total_mndob2: 50,
        ActiveOrder: false,
      },
    },
    {
      id: "ord_sa_no_city",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        // vill intentionally absent → city_not_represented
        data_order: "2026-09-09T08:00:00.000Z",
        total_app: 5,
        ActiveOrder: false,
      },
    },
  ]);
  client.seed("user", [
    {
      id: "drv_sa_riyadh_001",
      data: {
        uid: "drv_sa_riyadh_001",
        ismndob: true,
        actev_mndob: true,
        registration_status: "approved",
        display_name: "Driver SA",
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        mndob_vill: { path: "villages/city_sa_riyadh", id: "city_sa_riyadh" },
        phone_number: "+966501112233",
        email: "driver@example.com",
        created_time: "2026-09-01T10:00:00.000Z",
      },
    },
    {
      id: "agt_sa_001",
      data: {
        uid: "agt_sa_001",
        Isagent: true,
        isAdminRule: 2,
        actev_user: true,
        display_name: "Agent SA",
        Rev_dloh_agent: {
          path: "countries/saudi_arabia",
          id: "saudi_arabia",
        },
        Agent_total: 10,
        phone_number: "+966501112244",
        email: "agent@example.com",
        created_time: "2026-09-01T10:00:00.000Z",
      },
    },
    {
      id: "cust_sa_1",
      data: {
        uid: "cust_sa_1",
        actev_user: true,
        display_name: "Customer SA",
        Rev_dolh: { path: "countries/saudi_arabia", id: "saudi_arabia" },
        phone_number: "+966501112255",
        email: "oscar@example.com",
        Bookings_User: 2,
        created_time: "2026-09-01T10:00:00.000Z",
      },
    },
    {
      id: "cust_no_geo",
      data: {
        uid: "cust_no_geo",
        actev_user: true,
        display_name: "Customer No Geo",
        phone_number: "+966501112266",
        created_time: "2026-09-02T10:00:00.000Z",
      },
    },
    {
      id: "admin_super_1",
      data: {
        uid: "admin_super_1",
        IsAdmin: true,
        isAdminRule: 1,
        actev_user: true,
        display_name: "Super Admin",
        created_time: "2026-08-01T10:00:00.000Z",
      },
    },
    {
      id: "unknown_stub",
      data: {
        uid: "unknown_stub",
        // no positive customer evidence, not driver/agent
      },
    },
  ]);
}

describe("Phase 4B defaults + startup + resource isolation", () => {
  beforeEach(() => resetEnvCache());

  it("Production Read remains disabled by default", () => {
    const env = getEnv();
    expect(env.PRODUCTION_READ_ENABLED).toBe(false);
    expect(env.FULL_PII_SHADOW_ENABLED).toBe(false);
    expect(env.PRODUCTION_WRITE_ENABLED).toBe(false);
    expect(env.CUSTOMER_WRITE_ENABLED).toBe(false);
  });

  it("startup accepts full Phase 4B seven-resource allowlist", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow(livePhase4BStartupBase),
    ).not.toThrow();
    expect([...PHASE_4B_LIVE_RESOURCES]).toEqual([...LIVE_SHADOW_RESOURCES]);
  });

  it("startup still rejects partial multi-resource (agents+customers)", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...livePhase4BStartupBase,
        LIVE_SHADOW_ALLOWED_RESOURCES: "agents,customers",
      }),
    ).toThrow(/LIVE_SHADOW_ALLOWED_RESOURCES/);
  });

  it("startup rejects any write flag true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...livePhase4BStartupBase,
        DRIVER_WRITE_ENABLED: true,
      }),
    ).toThrow(/DRIVER_WRITE_ENABLED/);
  });

  it("startup rejects FULL_PII_SHADOW_ENABLED=true", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        ...livePhase4BStartupBase,
        FULL_PII_SHADOW_ENABLED: true,
      }),
    ).toThrow(/FULL_PII_SHADOW/);
  });

  it("isPhase4BLiveShadowEnabled only accepts exact 1", () => {
    expect(isPhase4BLiveShadowEnabled(undefined)).toBe(false);
    expect(isPhase4BLiveShadowEnabled("")).toBe(false);
    expect(isPhase4BLiveShadowEnabled("0")).toBe(false);
    expect(isPhase4BLiveShadowEnabled("true")).toBe(false);
    expect(isPhase4BLiveShadowEnabled("1")).toBe(true);
  });

  it("parses only known resource tokens — no genericQuery tokens", () => {
    const set = parseLiveShadowAllowedResources(ALL_RESOURCES);
    expect(set.size).toBe(7);
    expect(() =>
      parseLiveShadowAllowedResources("countries,genericQuery"),
    ).toThrow(/Unknown LIVE_SHADOW_ALLOWED_RESOURCES/);
    expect(isGenericCollectionReadPath("/api/read?collection=user")).toBe(
      true,
    );
    expect(isGenericCollectionReadPath("/api/trips")).toBe(false);
  });

  it("page limits match established 4A caps", () => {
    expect(PHASE_4B_PAGE_LIMITS.countries).toBe(20);
    expect(PHASE_4B_PAGE_LIMITS.cities).toBe(50);
    expect(PHASE_4B_SAFE_ORDER_FIELDS.agents).toBe("__name__");
    expect(PHASE_4B_SAFE_ORDER_FIELDS.customers).toBe("__name__");
  });
});

describe("Phase 4B cross-resource + not_represented", () => {
  it("validates city/landmark/trip/driver/agent/customer → country without inventing", () => {
    const countries = [{ id: "saudi_arabia", name: "SA", currencyCode: "SAR", mappingVersion: "v1" }];
    const cities = [
      {
        id: "city_sa_riyadh",
        sourceDocumentId: "city_sa_riyadh",
        canonicalCityId: "city_sa_riyadh",
        safeName: "Riyadh",
        countryId: "saudi_arabia",
        regionId: null,
        activeStatus: "active" as const,
        mappingStatus: "validMapped" as const,
        source: "legacy_villages" as const,
        warnings: [],
        name: "Riyadh",
        aliasResolved: false,
        mappingVersion: "v1",
      },
    ];
    const tripMapped = mapCanonicalTripFromLegacyDoc({
      documentId: "ord1",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        data_order: "2026-09-10T00:00:00.000Z",
      },
    });
    const tripNoCity = mapCanonicalTripFromLegacyDoc({
      documentId: "ord2",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        data_order: "2026-09-09T00:00:00.000Z",
      },
    });
    expect(
      tripNoCity.mappingWarnings.some((w) => w.code === "city_not_represented"),
    ).toBe(true);

    const result = validateCrossResourceReferences({
      countries,
      cities,
      landmarks: [],
      trips: [tripMapped.model, tripNoCity.model],
      drivers: [],
      agents: [],
      customers: [],
    });
    expect(result.brokenCountryReferences).toBe(0);
    expect(isLegitimateGeographyAbsence("geographyNotRepresented")).toBe(true);
    expect(isLegitimateGeographyAbsence("excludedUnknownIdentity")).toBe(true);
  });

  it("counts broken country only when validMapped id missing from catalog", () => {
    const cities = [
      {
        id: "city_x",
        sourceDocumentId: "city_x",
        canonicalCityId: "city_x",
        safeName: "X",
        countryId: "missing_country_zz",
        regionId: null,
        activeStatus: "active" as const,
        mappingStatus: "validMapped" as const,
        source: "legacy_villages" as const,
        warnings: [],
        name: "X",
        aliasResolved: false,
        mappingVersion: "v1",
      },
    ];
    const result = validateCrossResourceReferences({
      countries: [
        {
          id: "saudi_arabia",
          name: "SA",
          currencyCode: "SAR",
          mappingVersion: "v1",
        },
      ],
      cities,
      landmarks: [],
      trips: [],
      drivers: [],
      agents: [],
      customers: [],
    });
    expect(result.brokenCountryReferences).toBe(1);
  });
});

describe("Phase 4B cross-domain contamination + one active agent", () => {
  it("exclusions are correct; operational multi-domain is conflict", () => {
    const driver = mapCanonicalDriverFromLegacyDoc({
      documentId: "drv1",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        Rev_dolh: { path: "countries/saudi_arabia" },
      },
    }).model;
    const adminAsDriver = mapCanonicalDriverFromLegacyDoc({
      documentId: "admin1",
      data: {
        ismndob: true,
        IsAdmin: true,
        isAdminRule: 1,
        registration_status: "approved",
        Rev_dolh: { path: "countries/saudi_arabia" },
      },
    }).model;
    expect(adminAsDriver.mappingStatus).toBe("excludedNonDriver");

    const agent = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt1",
      data: {
        Isagent: true,
        isAdminRule: 2,
        actev_user: true,
        Agent_total: 5,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
      },
    }).model;
    const customer = mapCanonicalCustomerFromLegacyDoc({
      documentId: "cust1",
      data: {
        actev_user: true,
        display_name: "C",
        phone_number: "+966500000001",
        Rev_dolh: { path: "countries/saudi_arabia" },
      },
    }).model;
    const unknown = mapCanonicalCustomerFromLegacyDoc({
      documentId: "stub1",
      data: { uid: "stub1" },
    }).model;

    const ok = auditCrossDomainContamination({
      drivers: [driver, adminAsDriver],
      agents: [agent],
      customers: [customer, unknown],
      knownCountryIds: ["saudi_arabia"],
    });
    expect(ok.crossDomainConflicts).toBe(0);
    expect(ok.roleContaminationCorrectlyExcluded).toBeGreaterThan(0);
    expect(ok.unknownIdentityCount).toBeGreaterThanOrEqual(1);
    expect(ok.countriesWithMultipleActiveAgents).toBe(0);
    expect(ok.countriesWithOneActiveAgent).toBe(1);

    // Same doc id operational in driver+customer → conflict
    const conflict = auditCrossDomainContamination({
      drivers: [driver],
      agents: [],
      customers: [{ ...customer, sourceDocumentId: driver.sourceDocumentId }],
      knownCountryIds: ["saudi_arabia"],
    });
    expect(conflict.crossDomainConflicts).toBe(1);
  });

  it("multi active agents for one country is structural blocker", () => {
    const a1 = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_a",
      data: {
        Isagent: true,
        isAdminRule: 2,
        actev_user: true,
        Agent_total: 5,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
      },
    }).model;
    const a2 = mapCanonicalAgentFromLegacyDoc({
      documentId: "agt_b",
      data: {
        Isagent: true,
        isAdminRule: 2,
        actev_user: true,
        Agent_total: 5,
        Rev_dloh_agent: { path: "countries/saudi_arabia" },
      },
    }).model;
    const multi = auditCrossDomainContamination({
      drivers: [],
      agents: [a1, a2],
      customers: [],
      knownCountryIds: ["saudi_arabia"],
    });
    expect(multi.countriesWithMultipleActiveAgents).toBe(1);
    expect(
      phase4BClosingGatesPass({
        crossResource: {
          brokenCountryReferences: 0,
          brokenCityReferences: 0,
          crossDomainConflicts: 0,
          roleContaminationCorrectlyExcluded: 0,
          unknownIdentityCount: 0,
          countriesWithOneActiveAgent: 0,
          countriesWithNoAgent: 0,
          countriesWithMultipleActiveAgents: 1,
          piiViolations: 0,
          financialConflicts: 0,
          financialMissingAsZero: 0,
          unexpectedCollectionAccess: 0,
          scopeViolations: 0,
          paginationDuplicates: 0,
        },
        productionWrites: 0,
        killSwitchPass: true,
        scopeValidationPass: true,
        paginationValidationPass: true,
        projectFingerprint: PHASE_4B_EXPECTED_PROJECT_ID,
      }),
    ).toBe(false);
  });
});

describe("Phase 4B PII + financial + scope + pagination + writes", () => {
  it("customer DTO masks phone/email; raw leak detection works", () => {
    const mapped = mapCanonicalCustomerFromLegacyDoc({
      documentId: "c1",
      data: {
        actev_user: true,
        display_name: "C",
        phone_number: "+966501112233",
        email: "oscar@example.com",
      },
    });
    // Mapper stores hints — assert safe
    const safe = assertCustomerDtoPiiSafe(mapped.model);
    expect(safe.piiViolations).toBe(0);
    expect(assertSerializedHasNoRawPii('{"phone":"***1233"}').piiViolations).toBe(
      0,
    );
    expect(
      assertSerializedHasNoRawPii('{"x":"+966501112233"}').piiViolations,
    ).toBeGreaterThan(0);
  });

  it("driver DTO does not expose document URLs / normalized plate", () => {
    const mapped = mapCanonicalDriverFromLegacyDoc({
      documentId: "d1",
      data: {
        ismndob: true,
        registration_status: "approved",
        actev_mndob: true,
        Rev_dolh: { path: "countries/saudi_arabia" },
        number_lohh_car: "ABC 1234",
        img_id: "https://firebasestorage.googleapis.com/v0/b/x/o/y",
        ipanBank: "SA0380000000608010167519",
      },
    });
    expect(mapped.model.vehicle.normalizedPlateExposed).toBe(false);
    const safe = assertDriverDtoPiiSafe(mapped.model);
    expect(safe.piiViolations).toBe(0);
  });

  it("financial missing rates ≠ 0; settlement blocked", () => {
    const fin = mapTripFinancialSafeRead({
      documentId: "o1",
      data: { total_app: 7.5, total_vat: 0, total_mndob: 42.5 },
    });
    expect(fin.vatRatePercent).toBeNull();
    expect(fin.vatRateKnowledge).toBe("not_represented");
    expect(fin.isSettlementSafe).toBe(false);
    expect(fin.isAccountingApproved).toBe(false);

    const trip = mapCanonicalTripFromLegacyDoc({
      documentId: "o1",
      data: {
        status_code: "completed",
        Rev_dolh: "countries/saudi_arabia",
        vill: "villages/city_sa_riyadh",
        data_order: "2026-09-10T00:00:00.000Z",
        total_app: 7.5,
        total_vat: 0,
        total_mndob: 42.5,
      },
    });
    const safety = validateTripFinancialSafety([trip.model]);
    expect(safety.financialConflicts).toBe(0);
    expect(safety.financialMissingAsZero).toBe(0);
    expect(safety.settlementBlocked).toBe(true);
  });

  it("scope validation passes for super_admin / country_admin / agent / support / auditor", () => {
    const scope = runPhase4BScopeValidation();
    expect(scope.scopeValidationPass).toBe(true);
    expect(scope.scopeViolations).toBe(0);
    expect(scope.casesChecked).toBeGreaterThanOrEqual(7);
  });

  it("pagination rejects offset and detects duplicates", () => {
    const ok = validatePaginationConsistency({
      resource: "agents",
      pages: [
        { ids: ["a", "b"], nextCursor: "c", limit: 50 },
        { ids: ["c", "d"], nextCursor: null, limit: 50 },
      ],
    });
    expect(ok.paginationValidationPass).toBe(true);

    const dup = validatePaginationConsistency({
      resource: "agents",
      pages: [
        { ids: ["a", "b"], nextCursor: "c", limit: 50 },
        { ids: ["b", "c"], nextCursor: null, limit: 50 },
      ],
      assertOffsetForbidden: false,
    });
    expect(dup.paginationDuplicates).toBeGreaterThan(0);
  });

  it("write traps deny approve driver / activate agent / modify customer / trip / settlement", () => {
    const result = runPhase4BWriteTraps(writeEnv);
    expect(result.writeTrapsPass).toBe(true);
    expect(result.productionWrites).toBe(0);
    expect(result.deniedMethods.length).toBeGreaterThanOrEqual(5);
  });

  it("separates shadow PASS eligibility (A) from controlledWritesEnabled (B)", () => {
    const s = emptyPhase4BShadowSummary();
    s.overallStatus = "PASS";
    s.killSwitchPass = true;
    s.writeTrapsPass = true;
    s.productionWrites = 0;

    expect(isShadowValidationPassed(s)).toBe(true);
    expect(isEligibleForControlledWritesPhase(s)).toBe(true);
    expect(isReadyForControlledWrites(s)).toBe(true); // alias of A
    expect(isControlledWritesEnabled(s)).toBe(false); // B never auto-on

    const flags = derivePhase4BWriteReadinessFlags(s);
    expect(flags.shadowValidationPassed).toBe(true);
    expect(flags.eligibleForControlledWritesPhase).toBe(true);
    expect(flags.controlledWritesEnabled).toBe(false);
    expect(flags.readyForControlledWrites).toBe(true);
  });

  it("eligibility (A) stays false when closing traps fail", () => {
    const s = emptyPhase4BShadowSummary();
    s.overallStatus = "PASS";
    s.killSwitchPass = false;
    s.writeTrapsPass = true;
    expect(isEligibleForControlledWritesPhase(s)).toBe(false);
    expect(isControlledWritesEnabled(s)).toBe(false);
  });
});

describe("Phase 4B Fake orchestrator end-to-end", () => {
  it("runs bounded multi-resource validation with kill switch + closing gates", async () => {
    const client = new FakeFirestoreReadClient();
    seedPhase4BFixture(client);
    const allowed = parseLiveShadowAllowedResources(ALL_RESOURCES);

    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      fullPiiShadowEnabled: false,
      liveShadowAllowedResources: allowed,
    });

    const queriesBefore = client.queryLog.length;
    const summary = await runPhase4BShadowValidation({
      repos,
      ctx: ctx(),
      env: writeEnv,
      projectFingerprint: PHASE_4B_EXPECTED_PROJECT_ID,
      observedCollections: ["countries", "villages", "mkan", "order", "user"],
      createKilledRepos: () =>
        createProductionReadRepositories({
          client,
          productionReadEnabled: false,
          fullPiiShadowEnabled: false,
          liveShadowAllowedResources: allowed,
        }),
    });

    expect(summary.productionCalls).toBe(7);
    expect(summary.productionWrites).toBe(0);
    expect(client.queryLog.length).toBe(queriesBefore + 7);
    expect(summary.postKill).toBe("PRODUCTION_READ_DISABLED_NO_NEW_QUERY");
    expect(summary.killSwitchPass).toBe(true);
    expect(summary.writeTrapsPass).toBe(true);
    expect(summary.fullPiiShadowEnabled).toBe(false);
    expect(summary.crossResource.countriesWithMultipleActiveAgents).toBe(0);
    expect(summary.crossResource.piiViolations).toBe(0);
    expect(summary.crossResource.financialConflicts).toBe(0);
    expect(summary.scopeValidationPass).toBe(true);
    expect(summary.paginationValidationPass).toBe(true);
    expect(summary.shadowValidationPassed).toBe(true);
    expect(summary.eligibleForControlledWritesPhase).toBe(true);
    expect(summary.controlledWritesEnabled).toBe(false);
    expect(summary.readyForControlledWrites).toBe(true); // A, not B
    expect(summary.overallStatus).toBe("PASS");
    expect(summary.resources.countries.recordsRead).toBeGreaterThanOrEqual(1);
    expect(summary.resources.trips.recordsRead).toBeGreaterThanOrEqual(1);

    // Kill switch: further call denied, no new successful query
    const killed = createProductionReadRepositories({
      client,
      productionReadEnabled: false,
      liveShadowAllowedResources: allowed,
    });
    const qAfter = client.queryLog.length;
    await expect(
      killed.geography.listCountries(ctx(), {}, { limit: 20 }),
    ).rejects.toBeInstanceOf(ProductionReadDisabledError);
    expect(client.queryLog.length).toBe(qAfter);

    expect(
      assertSerializedHasNoRawPii(JSON.stringify(summary)).piiViolations,
    ).toBe(0);

    expect(
      collectPhase4BClosingBlockers({
        crossResource: summary.crossResource,
        productionWrites: summary.productionWrites,
        killSwitchPass: summary.killSwitchPass,
        scopeValidationPass: summary.scopeValidationPass,
        paginationValidationPass: summary.paginationValidationPass,
        projectFingerprint: summary.projectFingerprint,
      }),
    ).toEqual([]);
  });

  it("fingerprint mismatch → NO-GO", async () => {
    const client = new FakeFirestoreReadClient();
    seedPhase4BFixture(client);
    const allowed = parseLiveShadowAllowedResources(ALL_RESOURCES);
    const repos = createProductionReadRepositories({
      client,
      productionReadEnabled: true,
      fullPiiShadowEnabled: false,
      liveShadowAllowedResources: allowed,
    });
    const summary = await runPhase4BShadowValidation({
      repos,
      ctx: ctx(),
      env: writeEnv,
      projectFingerprint: "wrong-project",
      createKilledRepos: () =>
        createProductionReadRepositories({
          client,
          productionReadEnabled: false,
          liveShadowAllowedResources: allowed,
        }),
    });
    expect(summary.overallStatus).toBe("NO_GO");
    expect(summary.blockers).toContain("project_fingerprint_mismatch");
  });
});
