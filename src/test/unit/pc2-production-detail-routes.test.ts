/**
 * PC-2 Production Detail Routes — tests 1–20.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertDetailResourceInScope,
  countryIdAllowedByScope,
  PRODUCTION_DETAIL_RELATED_READ_LIMIT,
} from "@/application/production-read/detailScope";
import { ScopeDeniedError } from "@/infrastructure/production/repositories/productionReadHelpers";
import { mapCanonicalTripToDetail } from "@/application/production-read/mapCanonicalToDetailDtos";
import type { CanonicalTripReadModel } from "@/domain/canonical/CanonicalReadModels";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { PRODUCTION_DETAIL_RESOURCE_ENABLED } from "@/domain/presentation/detailNavResources";
import { assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function minimalTrip(overrides: Partial<CanonicalTripReadModel> = {}): CanonicalTripReadModel {
  const base: CanonicalTripReadModel = {
    id: "order_1",
    canonicalTripId: "order_1",
    sourceDocumentId: "order_1",
    legacyCollection: "order",
    source: "legacy_order",
    status: {
      value: "completed",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: "status",
        sourceValue: "completed",
        mappingConfidence: "high",
        mappingVersion: "t",
        warnings: [],
      },
    },
    lifecycleStatus: "completed",
    lifecycleStatusSource: "status",
    isSafeForOperationalAction: true,
    isTerminal: true,
    lifecycleEvidenceFlags: [],
    paymentStatus: {
      value: null,
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "low",
        mappingVersion: "t",
        warnings: [],
      },
    },
    paymentMethod: {
      value: "cash",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: "payment",
        sourceValue: "cash",
        mappingConfidence: "medium",
        mappingVersion: "t",
        warnings: [],
      },
    },
    customerId: "c1",
    customerIdKnowledge: "known",
    customerSourcePath: null,
    driverId: "d1",
    driverIdKnowledge: "known",
    driverSourcePath: null,
    agentId: {
      value: "a1",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "medium",
        mappingVersion: "t",
        warnings: [],
      },
    },
    countryId: {
      value: "saudi_arabia",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: "Rev_dolh",
        sourceValue: "saudi_arabia",
        mappingConfidence: "high",
        mappingVersion: "t",
        warnings: [],
      },
    },
    cityId: {
      value: null,
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "low",
        mappingVersion: "t",
        warnings: [],
      },
    },
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
    currencyCode: {
      value: "SAR",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "medium",
        mappingVersion: "t",
        warnings: [],
      },
    },
    createdAtUtc: {
      value: "2026-01-01T00:00:00.000Z",
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: "data_order",
        sourceValue: null,
        mappingConfidence: "high",
        mappingVersion: "t",
        warnings: [],
      },
    },
    startedAtUtc: {
      value: null,
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "low",
        mappingVersion: "t",
        warnings: [],
      },
    },
    completedAtUtc: {
      value: null,
      provenance: {
        sourceSystem: "legacy",
        sourceCollection: "order",
        sourceDocumentId: "order_1",
        sourceField: null,
        sourceValue: null,
        mappingConfidence: "low",
        mappingVersion: "t",
        warnings: [],
      },
    },
    activeOrderFlag: null,
    iDorder: null,
    financialSafeRead: {
      totalApp: {
        value: null,
        unit: "unknown",
        currencyCode: null,
        availabilityStatus: "missing",
        provenance: {
          sourceSystem: "legacy",
          sourceCollection: "order",
          sourceDocumentId: "order_1",
          sourceField: null,
          sourceValue: null,
          mappingConfidence: "low",
          mappingVersion: "t",
          warnings: [],
        },
      },
      totalAppKnowledge: "missing",
      totalVat: {
        value: null,
        unit: "unknown",
        currencyCode: null,
        availabilityStatus: "missing",
        provenance: {
          sourceSystem: "legacy",
          sourceCollection: "order",
          sourceDocumentId: "order_1",
          sourceField: null,
          sourceValue: null,
          mappingConfidence: "low",
          mappingVersion: "t",
          warnings: [],
        },
      },
      totalVatKnowledge: "missing",
      totalMndob: {
        value: null,
        unit: "unknown",
        currencyCode: null,
        availabilityStatus: "missing",
        provenance: {
          sourceSystem: "legacy",
          sourceCollection: "order",
          sourceDocumentId: "order_1",
          sourceField: null,
          sourceValue: null,
          mappingConfidence: "low",
          mappingVersion: "t",
          warnings: [],
        },
      },
      totalMndobKnowledge: "missing",
      totalMndob2: {
        value: null,
        unit: "unknown",
        currencyCode: null,
        availabilityStatus: "missing",
        provenance: {
          sourceSystem: "legacy",
          sourceCollection: "order",
          sourceDocumentId: "order_1",
          sourceField: null,
          sourceValue: null,
          mappingConfidence: "low",
          mappingVersion: "t",
          warnings: [],
        },
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
      actor: "",
      actorKnowledge: "missing",
      reason: null,
      reasonKnowledge: "missing",
      cancelledAtUtc: null,
      evidenceFields: [],
    },
    mappingStatus: "validMapped",
    incompleteReasons: [],
    mappingConfidence: "high",
    mappingVersion: "t",
  };
  return { ...base, ...overrides };
}

describe("PC-2 Production Detail Routes (tests 1–20)", () => {
  it("1: Trip Production detail GET uses WIF-native transport", () => {
    const route = src("src/app/api/trips/[id]/route.ts");
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(route).toMatch(/getProductionTripDetailApi/);
    expect(route).toMatch(/resolveApiActor/);
    expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
    expect(service).toMatch(/repos\.trips\.getById/);
    expect(service).toMatch(/getProductionOperationalReadRuntime/);
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/createWifNativeFirestoreRead/);
  });

  it("2: Driver Production detail GET uses WIF-native transport", () => {
    const route = src("src/app/api/drivers/[id]/route.ts");
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(route).toMatch(/getProductionDriverDetailApi/);
    expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
    expect(service).toMatch(/repos\.drivers\.getById/);
  });

  it("3: Customer Production detail GET uses WIF-native transport", () => {
    const route = src("src/app/api/customers/[id]/route.ts");
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(route).toMatch(/getProductionCustomerDetailApi/);
    expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
    expect(service).toMatch(/repos\.customers\.getSummaryById/);
  });

  it("4: Agent Production detail GET uses WIF-native transport", () => {
    const route = src("src/app/api/agents/[id]/route.ts");
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(route).toMatch(/getProductionAgentDetailApi/);
    expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
    expect(service).toMatch(/repos\.agents\.getById/);
  });

  it("5: No Firebase Admin ADC is used on detail paths", () => {
    for (const rel of [
      "src/app/api/trips/[id]/route.ts",
      "src/app/api/drivers/[id]/route.ts",
      "src/app/api/customers/[id]/route.ts",
      "src/app/api/agents/[id]/route.ts",
      "src/application/production-read/ProductionOperationalDetailReads.ts",
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/FirebaseAdminFirestoreReadClient/);
      expect(text).not.toMatch(/applicationDefault\s*\(/);
      expect(text).not.toMatch(/from ["']firebase-admin["']/);
    }
  });

  it("6: No synthetic fallback on Production detail branch", () => {
    for (const rel of [
      "src/app/api/trips/[id]/route.ts",
      "src/app/api/drivers/[id]/route.ts",
      "src/app/api/customers/[id]/route.ts",
      "src/app/api/agents/[id]/route.ts",
    ]) {
      const text = src(rel);
      const prod = text.split("if (productionReadPathActive())")[1] ?? "";
      const block = prod.split(/^\s*(?:try \{|\/\/ development)/m)[0] ?? prod;
      expect(block).not.toMatch(/getRepositories\(\)/);
      expect(block).not.toMatch(/synthetic:\s*true/);
    }
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow();
  });

  it("7: Missing record returns true 404", () => {
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/ProductionDetailNotFoundError/);
    for (const rel of [
      "src/app/api/trips/[id]/route.ts",
      "src/app/api/drivers/[id]/route.ts",
      "src/app/api/customers/[id]/route.ts",
      "src/app/api/agents/[id]/route.ts",
    ]) {
      const text = src(rel);
      expect(text).toMatch(/ProductionDetailNotFoundError/);
      expect(text).toMatch(/status: 404/);
      expect(text).toMatch(/NOT_FOUND/);
    }
  });

  it("8: Source unavailable is not mislabeled 404", () => {
    const mapErr = src("src/infrastructure/http/shadowApi.ts");
    expect(mapErr).toMatch(/status: 503/);
    expect(mapErr).toMatch(/PRODUCTION_DATA_UNAVAILABLE|PRODUCTION_READ_DISABLED/);
    for (const page of [
      "src/features/trips/TripDetailPage.tsx",
      "src/features/drivers/DriverDetailPage.tsx",
      "src/features/customers/CustomerDetailPage.tsx",
      "src/features/agents/AgentDetailPage.tsx",
    ]) {
      const text = src(page);
      expect(text).toMatch(/res\.status === 404/);
      expect(text).toMatch(/res\.status === 503/);
      expect(text).toMatch(/NotFoundState/);
      expect(text).toMatch(/UnavailableState/);
    }
  });

  it("9: IDOR is denied", () => {
    expect(() =>
      assertDetailResourceInScope(
        { type: "country", countryIds: ["saudi_arabia"] },
        { countryId: "united_arab_emirates" },
      ),
    ).toThrow(ScopeDeniedError);
    expect(() =>
      assertDetailResourceInScope(
        { type: "agent", agentIds: ["agt-a"], countryIds: ["SA"] },
        { agentId: "agt-b", countryId: "SA" },
      ),
    ).toThrow(ScopeDeniedError);
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/assertDetailResourceInScope/);
  });

  it("10: country_admin cannot read outside country", () => {
    expect(
      countryIdAllowedByScope(["SA"], "saudi_arabia"),
    ).toBe(true);
    expect(
      countryIdAllowedByScope(["SA"], "united_arab_emirates"),
    ).toBe(false);
    expect(() =>
      assertDetailResourceInScope(
        { type: "country", countryIds: ["SA"] },
        { countryId: "AE" },
      ),
    ).toThrow(ScopeDeniedError);
    expect(() =>
      assertDetailResourceInScope(
        { type: "country", countryIds: ["SA"] },
        { countryId: "saudi_arabia" },
      ),
    ).not.toThrow();
  });

  it("11: agent_user cannot read another country/agent detail", () => {
    expect(() =>
      assertDetailResourceInScope(
        { type: "agent", agentIds: ["mine"], countryIds: ["SA"] },
        { agentId: "other", countryId: "saudi_arabia" },
      ),
    ).toThrow(ScopeDeniedError);
    expect(() =>
      assertDetailResourceInScope(
        { type: "agent", agentIds: ["mine"], countryIds: ["SA"] },
        { agentId: "mine", countryId: "AE" },
      ),
    ).toThrow(ScopeDeniedError);
    expect(() =>
      assertDetailResourceInScope(
        { type: "agent", agentIds: ["mine"], countryIds: ["SA"] },
        { agentId: "mine", countryId: "saudi_arabia" },
      ),
    ).not.toThrow();
  });

  it("12: super_admin can read valid global detail", () => {
    expect(() =>
      assertDetailResourceInScope(
        { type: "global" },
        { countryId: "saudi_arabia", agentId: "any" },
      ),
    ).not.toThrow();
  });

  it("13: PII redaction contract remains enforced", () => {
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/piiRedacted/);
    const mapper = src(
      "src/application/production-read/mapCanonicalToDetailDtos.ts",
    );
    expect(mapper).toMatch(/emailHint\.value/);
    expect(mapper).toMatch(/phoneHint\.value/);
    expect(mapper).toMatch(/regionAvailability:\s*"not_represented"/);
    const driverRepo = src(
      "src/infrastructure/production/repositories/FirebaseProductionDriverReadRepository.ts",
    );
    expect(driverRepo).toMatch(/piiRedacted:\s*true/);
    expect(driverRepo).toMatch(/blockedFields/);
  });

  it("14: Missing financial values remain null/unavailable, never zero-filled", () => {
    const dto = mapCanonicalTripToDetail(minimalTrip());
    expect(dto.financial.grossFare.amount).toBeNull();
    expect(dto.financial.grossFare.availability).toBe("missing");
    expect(dto.financial.grossFare.amount).not.toBe(0);
    const agentDto = src("src/application/production-read/detailDtos.ts");
    expect(agentDto).toMatch(/collectedCash: ReportMoney \| null/);
    const agentService = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(agentService).toMatch(/availability: "unavailable"/);
    expect(agentService).not.toMatch(/collectedCash:\s*0/);
  });

  it("15: Agent one-country-one-active-agent invariant remains enforced", () => {
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/diagnoseDuplicateActiveAgents/);
    expect(service).toMatch(/fail_multiple_active/);
    expect(service).toMatch(/countryInvariant/);
    expect(PRODUCTION_DETAIL_RELATED_READ_LIMIT).toBeLessThanOrEqual(20);
  });

  it("16: Related reads stay bounded", () => {
    expect(PRODUCTION_DETAIL_RELATED_READ_LIMIT).toBe(20);
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/PRODUCTION_DETAIL_RELATED_READ_LIMIT/);
    expect(service).toMatch(/limit: PRODUCTION_DETAIL_RELATED_READ_LIMIT/);
    expect(service).toMatch(/slice\(0, PRODUCTION_DETAIL_RELATED_READ_LIMIT\)/);
  });

  it("17: Detail GET routes stay read-only; write chrome is separate action routes", () => {
    for (const rel of [
      "src/app/api/trips/[id]/route.ts",
      "src/app/api/drivers/[id]/route.ts",
      "src/app/api/customers/[id]/route.ts",
      "src/app/api/agents/[id]/route.ts",
    ]) {
      const text = src(rel);
      expect(text).not.toMatch(/export async function POST/);
      expect(text).not.toMatch(/export async function PATCH/);
      expect(text).not.toMatch(/export async function DELETE/);
      expect(text).not.toMatch(/export async function PUT/);
    }
    // Production DTO detail pages may render gated WriteActions chrome;
    // mutations still go through /api/{resource}/[id]/[action] (not detail GET).
    for (const page of [
      "src/features/customers/CustomerDetailPage.tsx",
      "src/features/agents/AgentDetailPage.tsx",
    ]) {
      const text = src(page);
      const prodBlock = text.split('state === "success" && data')[1] ?? "";
      const untilLegacy =
        prodBlock.split('state === "success" && legacy')[0] ?? prodBlock;
      expect(untilLegacy).toMatch(/WriteActions/);
    }
    for (const actions of [
      "src/features/drivers/DriverWriteActions.tsx",
      "src/features/customers/CustomerWriteActions.tsx",
      "src/features/agents/AgentWriteActions.tsx",
    ]) {
      expect(src(actions)).toMatch(/isControlledWriteChromeEnabled/);
    }
    expect(src("src/features/drivers/DriverDetailPage.tsx")).toMatch(
      /DriverWriteActions/,
    );
  });

  it("18: No Production write flags changed", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const envExample = src(".env.production.example");
    expect(envExample).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/DRIVER_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/AGENT_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/CUSTOMER_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/FINANCE_WRITE_ENABLED=false/);
  });

  it("19: FR7 golden surface still present (no calc rewrite)", () => {
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    expect(aggregator).toMatch(/buildAgentSummary/);
    const service = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(service).toMatch(/getFinanceReportingReadService/);
    expect(service).toMatch(/agentSummary/);
    expect(service).not.toMatch(/calculateFromTrip/);
  });

  it("20: PC-1 correctness + detail links re-enabled per resource", () => {
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.trips).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.drivers).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.customers).toBe(true);
    expect(PRODUCTION_DETAIL_RESOURCE_ENABLED.agents).toBe(true);
    const link = src("src/components/ui/DetailNavLink.tsx");
    expect(link).toMatch(/PRODUCTION_DETAIL_RESOURCE_ENABLED|isProductionDetailResourceEnabled/);
    expect(link).toMatch(/detail-link-disabled/);
    expect(link).toMatch(/isProductionDetailResourceEnabled/);
    const nav = src("src/domain/presentation/detailNavResources.ts");
    expect(nav).toMatch(/trips:\s*true/);
    expect(nav).toMatch(/drivers:\s*true/);
    expect(nav).toMatch(/customers:\s*true/);
    expect(nav).toMatch(/agents:\s*true/);
    const pc1 = src("src/test/unit/pc1-critical-correctness.test.ts");
    expect(pc1).toMatch(/PC-1 Critical Correctness/);
    // Dashboard honesty still present
    const dash = src(
      "src/application/production-read/ProductionDashboardAggregates.ts",
    );
    expect(dash).toMatch(/kpiAccuracy|finalizeAggregateCount/);
    expect(dash).toMatch(/incomplete|includeTestRecords/);
  });
});
