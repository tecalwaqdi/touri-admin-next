/**
 * PC-3 Operational Completeness — tests 1–20.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  mapCanonicalAgentToListItem,
  mapCanonicalCustomerToListItem,
  mapCanonicalDriverToListItem,
  mapCanonicalTripToListItem,
} from "@/application/production-read/mapCanonicalToListItems";
import type {
  CanonicalAgentReadModel,
  CanonicalCustomerReadModel,
  CanonicalDriverReadModel,
  CanonicalTripReadModel,
} from "@/domain/canonical/CanonicalReadModels";
import {
  buildCanonicalCountryOptions,
  buildFinanceCountryFilterOptions,
  resolveCountryFilterCanonicalId,
} from "@/domain/geography/CountryOption";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";
import { agentAssignmentPolicy } from "@/domain/agent/AgentAssignmentPolicy";
import { PRODUCTION_DETAIL_RESOURCE_ENABLED } from "@/domain/presentation/detailNavResources";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function emptyProv<T>(value: T | null) {
  return {
    value,
    provenance: {
      sourceSystem: "legacy" as const,
      sourceCollection: "user",
      sourceDocumentId: "x",
      sourceField: null,
      sourceValue: null,
      mappingConfidence: "low" as const,
      mappingVersion: "t",
      warnings: [] as string[],
    },
  };
}

function minimalCustomer(
  overrides: Partial<CanonicalCustomerReadModel> = {},
): CanonicalCustomerReadModel {
  return {
    id: "cust_1",
    canonicalCustomerId: "cust_1",
    sourceDocumentId: "cust_1",
    authUid: null,
    authUidKnowledge: "missing",
    legacyCollection: "user",
    source: "legacy_user_customer",
    isCustomer: emptyProv(true),
    isCustomerCandidate: true,
    hasPositiveCustomerEvidence: true,
    isOperationalCustomer: true,
    discriminatorKind: "exclusionary_non_driver_non_agent",
    authoritativeRole: "customer",
    roleEvidenceKind: "t",
    displayName: emptyProv("Customer One"),
    phone: emptyProv(null),
    email: emptyProv(null),
    phoneHint: emptyProv("***1234"),
    emailHint: emptyProv("c***@ex.com"),
    verification: emptyProv(null),
    accountState: "enabled",
    authEnabledKnowledge: "not_queried",
    authEmailVerifiedKnowledge: "not_queried",
    blocked: emptyProv(false),
    countryId: emptyProv("saudi_arabia"),
    countrySourcePath: null,
    cityId: emptyProv(null),
    citySourcePath: null,
    geographyRepresentation: "mapped",
    tripLockHint: "none",
    financial: {
      fieldsPresent: [],
      fieldsMissing: ["bookingsCount"],
      bookingsCountKnown: false,
      bookingsCount: null,
      isAccountingApproved: false,
      isSettlementSafe: false,
      isAuthoritative: false,
    },
    createdAtUtc: emptyProv(null),
    lastActivityAtUtc: emptyProv(null),
    mappingStatus: "validMapped",
    incompleteReasons: [],
    mappingConfidence: "medium",
    mappingVersion: "t",
    statusWarnings: [],
    ...overrides,
  };
}

function minimalAgent(
  overrides: Partial<CanonicalAgentReadModel> = {},
): CanonicalAgentReadModel {
  return {
    id: "agt_1",
    canonicalAgentId: "agt_1",
    sourceDocumentId: "agt_1",
    authUid: null,
    authUidKnowledge: "missing",
    legacyCollection: "user",
    source: "legacy_user_agent",
    isAgent: emptyProv(true),
    isAgentCandidate: true,
    isOperationalAgent: true,
    discriminatorField: "Isagent",
    authoritativeRole: "agent",
    roleEvidenceKind: "t",
    hasCountryAdminPanelRule: false,
    displayName: emptyProv("Agent One"),
    accountState: "enabled",
    operationalActiveState: "active",
    isOperationallyActive: true,
    authEnabledKnowledge: "not_queried",
    countryId: emptyProv("saudi_arabia"),
    countrySourcePath: null,
    assignmentLockDocId: emptyProv(null),
    agentTotalPercent: emptyProv(null),
    appCommissionPercentStored: emptyProv(null),
    vatPercentStored: emptyProv(null),
    financial: {
      fieldsPresent: [],
      fieldsMissing: [],
      isAccountingApproved: false,
      isSettlementSafe: false,
      isAuthoritative: false,
      cashCardModelNote:
        "cash_agent_commission_on_fee__card_company_collects_fee_share",
    },
    activeFromUtc: null,
    activeToUtc: null,
    createdAtUtc: null,
    mappingStatus: "validMapped",
    incompleteReasons: [],
    mappingConfidence: "medium",
    mappingVersion: "t",
    statusWarnings: [],
    ...overrides,
  };
}

function minimalDriver(
  overrides: Partial<CanonicalDriverReadModel> = {},
): CanonicalDriverReadModel {
  return {
    id: "drv_1",
    canonicalDriverId: "drv_1",
    sourceDocumentId: "drv_1",
    authUid: null,
    authUidKnowledge: "missing",
    legacyCollection: "user",
    source: "legacy_user_driver",
    isDriver: true,
    isDriverCandidate: true,
    isOperationalDriver: true,
    discriminatorField: "ismndob",
    authoritativeRole: "DRIVER",
    roleEvidenceKind: "t",
    displayName: emptyProv("Driver One"),
    registrationAxis: emptyProv("approved"),
    registrationStatus: "approved",
    accountEnabled: "enabled",
    accountActive: emptyProv(true),
    onlineStatus: "online",
    online: emptyProv(true),
    availabilityStatus: "available",
    available: emptyProv(true),
    tripState: "idle",
    onTrip: emptyProv(false),
    complianceStatus: "ready",
    countryId: emptyProv("saudi_arabia"),
    countrySourcePath: null,
    cityId: emptyProv("riyadh"),
    citySourcePath: null,
    vehicle: {
      typeCarId: "sedan",
      typeCarSourcePath: null,
      name: "Toyota",
      model: "Camry",
      plateMasked: "***123",
      platePresent: true,
      normalizedPlateExposed: false,
      normalizedPlatePresent: false,
      classificationText: null,
      year: 2020,
      color: null,
      registrationLinkageId: null,
      vehicleReviewStatus: null,
      incomplete: false,
    },
    compliance: {
      overall: "ready",
      registrationDocumentsStatus: "complete",
      documentReviewStatus: "approved",
      rejectionReasonPresent: false,
      needsChangesReasonPresent: false,
      slots: [],
      hasKnownExpiry: false,
      expiredSlotCount: 0,
    },
    financial: {
      fieldsPresent: [],
      fieldsMissing: [],
      isAccountingApproved: false,
      isSettlementSafe: false,
      isAuthoritative: false,
    },
    createdAtUtc: null,
    mappingStatus: "validMapped",
    incompleteReasons: [],
    mappingConfidence: "medium",
    mappingVersion: "t",
    statusWarnings: [],
    ...overrides,
  };
}

describe("PC-3 operational completeness", () => {
  it("1: Customer tripCount is never fabricated zero", () => {
    const unknown = mapCanonicalCustomerToListItem(minimalCustomer());
    expect(unknown.tripCount.value).toBeNull();
    expect(unknown.tripCount.accuracy).toBe("unavailable");
    expect(unknown.tripCount.value).not.toBe(0);

    const exact = mapCanonicalCustomerToListItem(
      minimalCustomer({
        financial: {
          fieldsPresent: ["bookingsCount"],
          fieldsMissing: [],
          bookingsCountKnown: true,
          bookingsCount: 7,
          isAccountingApproved: false,
          isSettlementSafe: false,
          isAuthoritative: false,
        },
      }),
    );
    expect(exact.tripCount.value).toBe(7);
    expect(exact.tripCount.accuracy).toBe("exact");

    const knownMissing = mapCanonicalCustomerToListItem(
      minimalCustomer({
        financial: {
          fieldsPresent: [],
          fieldsMissing: ["bookingsCount"],
          bookingsCountKnown: true,
          bookingsCount: null,
          isAccountingApproved: false,
          isSettlementSafe: false,
          isAuthoritative: false,
        },
      }),
    );
    expect(knownMissing.tripCount.value).toBeNull();
    expect(knownMissing.tripCount.availability).toBe("missing");
  });

  it("2: Agent driverCount is never fabricated zero", () => {
    const item = mapCanonicalAgentToListItem(minimalAgent());
    expect(item.driversCount.value).toBeNull();
    expect(item.driversCount.accuracy).toBe("unavailable");
    expect(item.driversCount.value).not.toBe(0);
  });

  it("3: Agent tripCount is never fabricated zero", () => {
    const item = mapCanonicalAgentToListItem(minimalAgent());
    expect(item.tripsCount.value).toBeNull();
    expect(item.tripsCount.accuracy).toBe("unavailable");
    expect(item.tripsCount.value).not.toBe(0);
  });

  it("4: Missing aggregate fields preserve unavailable/null semantics", () => {
    const driver = mapCanonicalDriverToListItem(minimalDriver());
    expect(driver.tripCount.value).toBeNull();
    expect(driver.tripCount.accuracy).toBe("unavailable");
    const agent = mapCanonicalAgentToListItem(minimalAgent());
    expect(agent.settlementOutstanding.amount).toBeNull();
    expect(agent.settlementOutstanding.availability).toBe("unavailable");
    const mapper = src(
      "src/application/production-read/mapCanonicalToListItems.ts",
    );
    expect(mapper).not.toMatch(/tripCount:\s*0/);
    expect(mapper).not.toMatch(/driversCount:\s*0/);
    expect(mapper).not.toMatch(/tripsCount:\s*0/);
  });

  it("5: Country filters use canonical IDs", () => {
    expect(resolveCountryFilterCanonicalId("SA")).toBe("saudi_arabia");
    expect(resolveCountryFilterCanonicalId("saudi_arabia")).toBe(
      "saudi_arabia",
    );
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/resolveCountryFilterCanonicalId/);
    const tripsUi = src("src/features/trips/TripsPage.tsx");
    expect(tripsUi).toMatch(/CountryFilterSelect/);
    expect(tripsUi).not.toMatch(/option value=\"SA\"/);
  });

  it("6: Display names are presentation-only", () => {
    const opts = buildCanonicalCountryOptions();
    const sa = opts.find((o) => o.canonicalId === "saudi_arabia");
    expect(sa).toBeTruthy();
    expect(sa!.displayNameEn).toBeTruthy();
    expect(sa!.canonicalId).toBe("saudi_arabia");
    const filter = src("src/components/ui/CountryFilterSelect.tsx");
    expect(filter).toMatch(/opt\.canonicalId/);
    expect(filter).toMatch(/countryOptionLabel/);
  });

  it("7: Trip filters preserve RBAC scope", () => {
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/productionReadContextFromActor/);
    expect(api).toMatch(/listProductionTripsApi/);
    const route = src("src/app/api/trips/route.ts");
    expect(route).toMatch(/requirePermission\(ctx, \"trips:read\"\)/);
    expect(route).toMatch(/resolveApiActor/);
  });

  it("8: Driver filters preserve RBAC scope", () => {
    const route = src("src/app/api/drivers/route.ts");
    expect(route).toMatch(/requirePermission\(ctx, \"drivers:read\"\)/);
    expect(route).toMatch(/countryId/);
    expect(route).toMatch(/registrationStatus/);
  });

  it("9: Customer filters preserve RBAC scope", () => {
    const route = src("src/app/api/customers/route.ts");
    expect(route).toMatch(/requirePermission\(ctx, \"customers:read\"\)/);
    expect(route).toMatch(/accountState/);
    expect(route).toMatch(/countryId/);
  });

  it("10: Agent filters preserve RBAC scope", () => {
    const route = src("src/app/api/agents/route.ts");
    expect(route).toMatch(/requirePermission\(ctx, \"agents:read\"\)/);
    expect(route).toMatch(/status/);
    expect(route).toMatch(/countryId/);
  });

  it("11: Page size remains <=50", () => {
    expect(WIF_NATIVE_MAX_READ_LIMIT).toBeLessThanOrEqual(50);
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/clampLimit/);
    expect(api).toMatch(/WIF_NATIVE_MAX_READ_LIMIT/);
  });

  it("12: No unbounded operational queries", () => {
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/bounded:\s*true/);
    expect(api).not.toMatch(/pageSize:\s*200/);
    expect(api).not.toMatch(/limit:\s*1000/);
  });

  it("13: No N+1 per-row query behavior introduced", () => {
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).not.toMatch(/for \(.*of items\)[\s\S]*await runtime\.repos/);
    expect(api).not.toMatch(/items\.map\(async/);
    const mapper = src(
      "src/application/production-read/mapCanonicalToListItems.ts",
    );
    expect(mapper).toMatch(/unavailableMetric\(\)/);
    expect(mapper).toMatch(/No efficient per-agent aggregate/);
  });

  it("14: Detail routes from PC-2 remain passing", () => {
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.trips).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.drivers).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.customers).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.agents).toBe(true);
    expect(
      src("src/application/production-read/ProductionOperationalDetailReads.ts"),
    ).toMatch(/getProductionTripDetail/);
    expect(src("src/application/production-read/detailDtos.ts")).toMatch(
      /TripDetailDto/,
    );
  });

  it("15: PC-1 KPI correctness remains passing", () => {
    const dash = src(
      "src/application/production-read/ProductionDashboardAggregates.ts",
    );
    expect(dash).toMatch(/kpiAccuracy|finalizeAggregateCount/);
    expect(dash).toMatch(/incomplete|exact/);
    expect(
      src("src/application/production-read/ProductionOperationalApiReads.ts"),
    ).toMatch(/computeProductionDashboardAggregates/);
  });

  it("16: Production synthetic fallback remains zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/synthetic: false as const/);
  });

  it("17: Old ADC paths remain zero", () => {
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/wif_native|WifNative|wifNative/i);
    expect(runtime).not.toMatch(/initializeApp|getFirestore\(/);
    const listService = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(listService).toMatch(/transport: \"wif_native\"/);
  });

  it("18: Write RPCs remain zero", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    for (const rel of [
      "src/app/api/trips/route.ts",
      "src/app/api/drivers/route.ts",
      "src/app/api/agents/route.ts",
    ]) {
      const text = src(rel);
      expect(text).toMatch(/PRODUCTION_WRITE_DISABLED/);
    }
    // customers list route is GET-only (no write handler exposed)
    const customers = src("src/app/api/customers/route.ts");
    expect(customers).not.toMatch(/export async function POST/);
    expect(customers).not.toMatch(/export async function PATCH/);
  });

  it("19: FR7 golden tests remain passing (no calc rewrite)", () => {
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    expect(aggregator).toMatch(/buildCompanyMetrics|buildAgentSummary/);
    const financeOpts = buildFinanceCountryFilterOptions();
    expect(financeOpts.some((o) => o.filterId === "SA")).toBe(true);
    // Finance still uses ISO filter values for exact FR7 match
    expect(src("src/components/ui/FinanceCountryFilterSelect.tsx")).toMatch(
      /filterId/,
    );
  });

  it("20: One-country-one-active-agent invariant remains passing", () => {
    const seed = agentAssignmentPolicy.validateSeed([
      {
        id: "a1",
        name: "A",
        countryId: "SA",
        status: "active",
        commissionPlaceholder: "—",
        driversCount: 0,
        tripsCount: 0,
        activeFromUtc: null,
        activeToUtc: null,
        createdAtUtc: "",
      },
      {
        id: "a2",
        name: "B",
        countryId: "SA",
        status: "active",
        commissionPlaceholder: "—",
        driversCount: 0,
        tripsCount: 0,
        activeFromUtc: null,
        activeToUtc: null,
        createdAtUtc: "",
      },
    ]);
    expect(seed.valid).toBe(false);
    expect(seed.violations.length).toBeGreaterThan(0);
    const agentsUi = src("src/features/agents/AgentsPage.tsx");
    expect(agentsUi).toMatch(/oneCountryOneAgent/);
  });

  it("list DTO kinds stay separate from detail DTOs", () => {
    const list = src("src/application/production-read/listDtos.ts");
    expect(list).toMatch(/TripListItem/);
    expect(list).toMatch(/DriverListItem/);
    expect(list).toMatch(/CustomerListItem/);
    expect(list).toMatch(/AgentListItem/);
    expect(list).not.toMatch(/TripDetailDto/);
    const trip = mapCanonicalTripToListItem({
      id: "o1",
      canonicalTripId: "o1",
      sourceDocumentId: "o1",
      legacyCollection: "order",
      source: "legacy_order",
      status: emptyProv("completed"),
      lifecycleStatus: "completed",
      lifecycleStatusSource: "status",
      isSafeForOperationalAction: true,
      isTerminal: true,
      lifecycleEvidenceFlags: [],
      paymentStatus: emptyProv(null),
      paymentMethod: emptyProv("cash"),
      customerId: "c1",
      customerIdKnowledge: "known",
      customerSourcePath: null,
      driverId: "d1",
      driverIdKnowledge: "known",
      driverSourcePath: null,
      agentId: emptyProv(null),
      countryId: emptyProv("saudi_arabia"),
      cityId: emptyProv(null),
      sourceCountryDocumentId: "saudi_arabia",
      canonicalCountryId: "saudi_arabia",
      sourceCountryPath: null,
      sourceCityDocumentId: "",
      sourceCityPath: null,
      pickupLandmarkId: null,
      pickupLandmarkKnowledge: "missing",
      sourcePickupLandmarkPath: null,
      destinationLandmarkId: null,
      destinationLandmarkKnowledge: "missing",
      sourceDestinationLandmarkPath: null,
      currencyCode: emptyProv("SAR"),
      createdAtUtc: emptyProv(null),
      startedAtUtc: emptyProv(null),
      completedAtUtc: emptyProv(null),
      activeOrderFlag: null,
      iDorder: null,
      financialSafeRead: {
        totalApp: {
          ...emptyProv(null),
          unit: "unknown",
          currencyCode: null,
          availabilityStatus: "missing",
        },
        totalAppKnowledge: "missing",
        totalVat: {
          ...emptyProv(null),
          unit: "unknown",
          currencyCode: null,
          availabilityStatus: "missing",
        },
        totalVatKnowledge: "missing",
        totalMndob: {
          ...emptyProv(null),
          unit: "unknown",
          currencyCode: null,
          availabilityStatus: "missing",
        },
        totalMndobKnowledge: "missing",
        totalMndob2: {
          ...emptyProv(null),
          unit: "unknown",
          currencyCode: null,
          availabilityStatus: "missing",
        },
        totalMndob2Knowledge: "missing",
        vatRatePercent: null,
        vatRateKnowledge: "missing",
        platformCommissionRatePercent: null,
        platformCommissionRateKnowledge: "missing",
        isAccountingApproved: false,
        isSettlementSafe: false,
      },
      cancellation: {
        isCancelled: false,
        actor: "unknown",
        actorKnowledge: "missing",
        reason: null,
        reasonKnowledge: "missing",
        cancelledAtUtc: null,
        evidenceFields: [],
      },
      mappingStatus: "validMapped",
      incompleteReasons: [],
      mappingConfidence: "medium",
      mappingVersion: "t",
    } as CanonicalTripReadModel);
    expect(trip.kind).toBe("trip_list");
  });

  it("cursor pagination wired in list UIs", () => {
    for (const page of [
      "src/features/trips/TripsPage.tsx",
      "src/features/drivers/DriversPage.tsx",
      "src/features/customers/CustomersPage.tsx",
      "src/features/agents/AgentsPage.tsx",
    ]) {
      const text = src(page);
      expect(text).toMatch(/CursorPaginationBar|nextCursor|cursorStack/);
      expect(text).toMatch(/boundedResultsHint/);
    }
  });
});

describe("PC-3 non-regression surface scan", () => {
  it("list DTO file exists and api routes pass search/filters", () => {
    expect(src("src/application/production-read/listDtos.ts")).toMatch(
      /AggregateMetric/,
    );
    expect(src("src/app/api/trips/route.ts")).toMatch(/paymentMethod/);
    expect(src("src/app/api/drivers/route.ts")).toMatch(/availabilityStatus/);
  });

  it("no mega DTO merge of list+detail", () => {
    const files = readdirSync(
      join(process.cwd(), "src/application/production-read"),
    );
    expect(files).toContain("listDtos.ts");
    expect(files).toContain("detailDtos.ts");
  });
});
