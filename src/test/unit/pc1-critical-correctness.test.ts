/**
 * PC-1 Critical Correctness — tests 1–14.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNeverLabelsSampleAsExact,
  boundedSampleKpiMeta,
  kpiAccuracyHint,
  unavailableKpiMeta,
} from "@/domain/dashboard/KpiAccuracy";
import {
  assertNoProductionSyntheticFallback,
  looksLikePilotOrTestDocumentId,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import {
  classifyProductionRecord,
  isUnsafePrefixOnlyExclusion,
  sampleIncludesPilotOrTest,
} from "@/domain/production-read/RecordClassification";
import {
  presentStatus,
  statusPresentationPair,
} from "@/domain/presentation/statusPresentation";
import {
  buildGeographyCountryPresentation,
  diagnoseDuplicateActiveAgents,
  diagnoseSuspiciousActiveAgent,
  geographyCountryBucketKey,
  isMalformedOrLegacyCountryId,
} from "@/domain/geography/GeographyPresentation";
import { resolveCanonicalCountryId } from "@/domain/geography/CountryCanonicalization";
import { assertNoOtherActiveAgentSync } from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { formatReportMoney } from "@/features/finance/formatReportMoney";
import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";
import { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
import { FINANCE_WRITE_ENABLED_DEFAULT } from "@/domain/finance/v2/FinanceImplementationContracts";
import { WIF_NATIVE_MAX_READ_LIMIT } from "@/infrastructure/production/firestore/Fr7WifNativeFirestoreReadTransport";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PC-1 Critical Correctness (tests 1–14)", () => {
  it("1: Bounded sample is never labeled exact total", () => {
    const meta = boundedSampleKpiMeta({ sampleLimit: 50 });
    expect(meta.accuracy).toBe("bounded_sample");
    expect(() =>
      assertNeverLabelsSampleAsExact(meta, "Total trips"),
    ).toThrow(/KPI_LABEL_MISLEADING/);
    expect(() =>
      assertNeverLabelsSampleAsExact(meta, "Sample trips"),
    ).not.toThrow();
    const en = src("src/i18n/messages.ts");
    expect(en).toMatch(/totalTrips:\s*"Sample trips"/);
    expect(en).toMatch(/totalTrips:\s*"عينة رحلات معروضة"/);
    expect(en).not.toMatch(/totalTrips:\s*"Total trips"/);
    const dashUi = src("src/features/dashboard/DashboardPage.tsx");
    expect(dashUi).toMatch(/kpiAccuracyHint|boundedSampleHint/);
    expect(dashUi).toMatch(/hintFor\("totalTrips"\)/);
    expect(dashUi).toMatch(/hintFor\("customers"\)/);
  });

  it("2: Dashboard response exposes KPI accuracy metadata", () => {
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/kpiAccuracy/);
    expect(api).toMatch(/boundedSampleKpiMeta/);
    expect(api).toMatch(/metricsAvailability: "bounded_sample"/);
    expect(api).toMatch(/sampleIncludesPilotOrTest/);
    expect(WIF_NATIVE_MAX_READ_LIMIT).toBeLessThanOrEqual(50);
    expect(api).not.toMatch(/pageSize:\s*500/);
    const service = src("src/application/dashboard/DashboardService.ts");
    expect(service).toMatch(/WIF_NATIVE_MAX_READ_LIMIT/);
    expect(service).not.toMatch(/pageSize:\s*500/);
  });

  it("3: Missing financial value never becomes zero", () => {
    const missing: ReportMoney = {
      amountMinor: null,
      currency: "SAR",
      availability: "missing",
      incompleteReasons: ["missing_source"],
    };
    const unknown: ReportMoney = {
      amountMinor: null,
      currency: null,
      availability: "unknown",
      incompleteReasons: [],
    };
    expect(formatReportMoney(missing).label).toBe("Missing");
    expect(formatReportMoney(missing).label).not.toBe("0");
    expect(formatReportMoney(unknown).label).toBe("Unknown");
    expect(formatReportMoney(unknown).isUnknown).toBe(true);
    const dash = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(dash).toMatch(/cashCollected: null/);
    expect(dash).toMatch(/onlineCollected: null/);
    expect(dash).toMatch(/platformCommission: null/);
  });

  it("4: Production/pilot source label is truthful", () => {
    const pilot = resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: ["test_adminnext_finance_fr7_x"],
    });
    expect(pilot.label).toBe("production_pilot");
    expect(pilot.en).toMatch(/Production \/ pilot/);
    expect(pilot.synthetic).toBe(false);

    const pure = resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: ["order_abc"],
    });
    expect(pure.label).toBe("production");
    expect(pure.synthetic).toBe(false);

    const syn = resolveAdminDataSourceLabel({ syntheticSource: true });
    expect(syn.label).toBe("development_synthetic");
    expect(syn.synthetic).toBe(true);
  });

  it("5: Production synthetic fallback remains zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
    const dashRoute = src("src/app/api/dashboard/route.ts");
    const armed = dashRoute.split("if (productionReadPathActive())")[1] ?? "";
    expect(armed.split("const env = getEnv()")[0]).not.toMatch(
      /getDashboardService/,
    );
  });

  it("6: Pilot/test classification does not rely on unsafe prefix-only logic unless contractual", () => {
    expect(looksLikePilotOrTestDocumentId("test_adminnext_x")).toBe(true);
    const classified = classifyProductionRecord({
      id: "test_adminnext_finance_fr5_x",
    });
    expect(classified.usedContractualIdMarker).toBe(true);
    expect(["pilot", "test"]).toContain(classified.recordClass);

    const mapping = classifyProductionRecord({
      id: "user_real",
      mappingStatus: "testOrNoncanonical",
    });
    expect(mapping.evidence).toBe("mapping_status_testOrNoncanonical");
    expect(mapping.usedContractualIdMarker).toBe(false);

    expect(
      isUnsafePrefixOnlyExclusion({
        usedOnlyIdPrefix: true,
        hasDomainOrMappingEvidence: false,
      }),
    ).toBe(true);
    expect(
      sampleIncludesPilotOrTest([
        { id: "real_1" },
        { id: "test_adminnext_x" },
      ]),
    ).toBe(true);
    // KPI path must mark inclusion, not silently exclude
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/sampleIncludesPilotOrTest/);
    expect(api).not.toMatch(/\.filter\(.*looksLikePilot/);
  });

  it("7: Status presentation mapping does not alter domain enums", () => {
    const pair = statusPresentationPair("pending_review", "en");
    expect(pair.domainValue).toBe("pending_review");
    expect(pair.label).toBe("Pending review");
    expect(presentStatus("pending_review", "ar")).toBe("قيد المراجعة");
    expect(presentStatus("unknown", "en")).toBe("Unknown");
    expect(presentStatus("no_active_agent", "ar")).toBe("لا وكيل نشط");
    const badge = src("src/components/ui/StatusBadge.tsx");
    expect(badge).toMatch(/data-status-domain=\{value\}/);
    expect(badge).toMatch(/presentStatus/);
  });

  it("8: Geography canonicalization remains intact", () => {
    const sa = resolveCanonicalCountryId("SA");
    expect(sa.status).toBe("mapped");
    if (sa.status === "mapped") {
      expect(sa.canonicalCountryId).toBe("saudi_arabia");
    }
    expect(geographyCountryBucketKey("SA")).toBe(
      geographyCountryBucketKey("saudi_arabia"),
    );
    const presentation = buildGeographyCountryPresentation({
      countryId: "saudi_arabia",
      liveName: null,
    });
    expect(presentation.displayName).toBe("Saudi Arabia");
    expect(isMalformedOrLegacyCountryId("cp5_country_xyz")).toBe(true);
    const missing = buildGeographyCountryPresentation({
      countryId: "cp5_country_xyz",
    });
    expect(
      missing.warnings.some((w) => w.code === "malformed_legacy_country_id"),
    ).toBe(true);
    expect(
      missing.warnings.some((w) => w.code === "missing_country_display_name"),
    ).toBe(true);
  });

  it("9: One-country-one-active-agent invariant remains enforced", () => {
    expect(() =>
      assertNoOtherActiveAgentSync({
        countryId: "SA",
        agentId: "agt_new",
        activeAgentId: "agt_existing",
      }),
    ).toThrow(/saudi_arabia|ACTIVE_AGENT/);
    const dup = diagnoseDuplicateActiveAgents(2);
    expect(dup?.code).toBe("duplicate_active_agents");
    const suspicious = diagnoseSuspiciousActiveAgent({
      agentName: "Touri Super Admin",
      authoritativeRole: "super_admin",
    });
    expect(suspicious?.code).toBe("suspicious_active_agent_mapping");
  });

  it("10: Users/Audit have zero fixture fallback", () => {
    const users = src("src/app/api/users/route.ts");
    const audit = src("src/app/api/audit/route.ts");
    expect(users).toMatch(/PRODUCTION_USER_SOURCE_NOT_CONFIGURED/);
    expect(audit).toMatch(/PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED/);
    expect(users).toMatch(/synthetic:\s*false/);
    expect(audit).toMatch(/synthetic:\s*false/);
    const usersUi = src("src/features/users/UsersPage.tsx");
    const auditUi = src("src/features/audit/AuditPage.tsx");
    expect(usersUi).toMatch(/SourceNotConfiguredState/);
    expect(auditUi).toMatch(/SourceNotConfiguredState/);
    expect(auditUi).toMatch(/isDev \? "development" : ""/);
    // Unavailable/source-not-configured path must not offer retry
    expect(usersUi).toMatch(
      /unavailable \? \(\s*<SourceNotConfiguredState/,
    );
    expect(auditUi).toMatch(/unavailable \? \(\s*<SourceNotConfiguredState/);
    expect(auditUi).not.toMatch(
      /SourceNotConfiguredState[\s\S]{0,80}onRetry/,
    );
  });

  it("11: Production detail links do not falsely report not found", () => {
    expect(
      isProductionDetailDisabledResponse({
        status: 503,
        code: "PRODUCTION_READ_DISABLED",
      }),
    ).toBe(true);
    for (const page of [
      "src/features/trips/TripDetailPage.tsx",
      "src/features/drivers/DriverDetailPage.tsx",
      "src/features/customers/CustomerDetailPage.tsx",
      "src/features/agents/AgentDetailPage.tsx",
    ]) {
      const text = src(page);
      expect(text).toMatch(/isProductionDetailDisabledResponse/);
      expect(text).toMatch(/productionDetailNotEnabled/);
      expect(text).toMatch(/DetailNotEnabledState/);
    }
    const link = src("src/components/ui/DetailNavLink.tsx");
    expect(link).toMatch(/areProductionDetailRoutesEnabled/);
    expect(link).toMatch(/detail-link-disabled/);
  });

  it("12: WIF-native read paths remain active", () => {
    const runtime = src(
      "src/infrastructure/production/runtime/ProductionOperationalReadRuntime.ts",
    );
    expect(runtime).toMatch(/createWifNativeFirestoreRead/);
    expect(runtime).not.toMatch(/FirebaseAdminFirestoreReadClient/);
    const api = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(api).toMatch(/repos\.trips\.list/);
    expect(api).toMatch(/repos\.geography\.listCountries/);
  });

  it("13: Write RPC exposure remains zero", () => {
    expect(FINANCE_WRITE_ENABLED_DEFAULT).toBe(false);
    const envExample = src(".env.production.example");
    expect(envExample).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/DRIVER_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/AGENT_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/CUSTOMER_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/FINANCE_WRITE_ENABLED=false/);
  });

  it("14: FR7 golden surface unchanged (aggregator + no ADC in FR7 port)", () => {
    const port = src(
      "src/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort.ts",
    );
    expect(port).not.toMatch(/from ["']firebase-admin["']/);
    expect(port).not.toMatch(/applicationDefault\s*\(/);
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    expect(aggregator).toMatch(/buildDashboardSummary/);
    const hint = kpiAccuracyHint(unavailableKpiMeta(), "ar");
    expect(hint).toMatch(/غير متاح/);
  });
});
