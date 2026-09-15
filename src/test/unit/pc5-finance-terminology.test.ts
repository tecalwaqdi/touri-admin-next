/**
 * PC-5 — Finance terminology & reporting UX presentation tests.
 * Presentation only — must not alter FR1–FR7 calculation domain.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORBIDDEN_RAW_FINANCE_UI_LABELS,
  isForbiddenRawFinanceUiLabel,
  presentCorrectionKind,
  presentFinanceTerm,
  presentMoneyAvailability,
  presentReportExportHeaders,
  presentReportType,
  presentSettlementDirection,
} from "@/domain/presentation/financeTerminology";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import {
  formatMinorUnitsDisplay,
  formatReportMoney,
} from "@/features/finance/formatReportMoney";
import { buildFinanceReportDisplayModel } from "@/features/finance/reportDisplayModel";
import type {
  ReportExportSourceModel,
  ReportMoney,
} from "@/domain/finance/reporting/FinanceReportingTypes";
import { resolveAdminDataSourceLabel, assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";
import { SETTLEMENT_V2_STATUSES } from "@/domain/finance/v2/FinanceImplementationContracts";

const ROOT = join(__dirname, "../../..");

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function money(
  partial: Partial<ReportMoney> & Pick<ReportMoney, "availability">,
): ReportMoney {
  return {
    amountMinor: null,
    currency: null,
    incompleteReasons: [],
    ...partial,
  };
}

describe("PC-5 finance terminology & reporting UX", () => {
  it("1: Internal finance keys are not exposed as UI labels", () => {
    for (const key of FORBIDDEN_RAW_FINANCE_UI_LABELS) {
      expect(presentFinanceTerm(key, "en")).not.toBe(key);
      expect(presentFinanceTerm(key, "ar")).not.toBe(key);
      expect(isForbiddenRawFinanceUiLabel(key)).toBe(true);
    }
    const financePage = src("src/features/finance/FinancePage.tsx");
    // Labels go through FinanceTermLabel / presentFinanceTerm — not raw key as MetricCard label string
    expect(financePage).toMatch(/FinanceTermLabel/);
    expect(financePage).not.toMatch(/label=\{key\}/);
    expect(financePage).not.toMatch(/label="grossBookingValue"/);
  });

  it("2: Missing money never renders as zero", () => {
    const formatted = formatReportMoney(
      money({ availability: "missing", amountMinor: null, currency: "SAR" }),
      "en",
    );
    expect(formatted.label).toBe("Incomplete");
    expect(formatted.label).not.toMatch(/0/);
    expect(formatted.isUnknown).toBe(true);
  });

  it("3: Unknown money never renders as zero", () => {
    const formatted = formatReportMoney(
      money({ availability: "unknown", amountMinor: null, currency: "SAR" }),
      "en",
    );
    expect(formatted.label).toBe("Unknown");
    expect(formatted.label.toLowerCase()).not.toBe("0.00 sar");
    expect(formatReportMoney(money({ availability: "unknown" }), "ar").label).toBe(
      "غير معروف",
    );
  });

  it("4: Multi-currency values are not summed together", () => {
    const financePage = src("src/features/finance/FinancePage.tsx");
    expect(financePage).toMatch(/byCurrency|finance-currency-groups/);
    expect(financePage).not.toMatch(/reduce\([^)]*amountMinor/);
    expect(financePage).not.toMatch(/parseFloat|Number\(.*amount/);
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    // Domain still groups by currency — PC-5 must not add FX / cross-sum in UI
    expect(financePage).not.toMatch(/FX|exchangeRate|convertCurrency/);
    expect(aggregator).toMatch(/byCurrency/);
  });

  it("5: Minor-unit formatting is centralized", () => {
    expect(formatMinorUnitsDisplay("1500", "SAR")).toBe("15.00 SAR");
    const moneyCell = src("src/components/ui/MoneyCell.tsx");
    expect(moneyCell).toMatch(/formatReportMoney/);
    const settlements = src("src/features/settlements/SettlementsPage.tsx");
    expect(settlements).toMatch(/formatMinorUnitsDisplay/);
    expect(settlements).not.toMatch(/\/\s*100(?!\d)/);
  });

  it("6: Direction labels map correctly AR/EN", () => {
    expect(presentSettlementDirection("DRIVER_PAYS_COMPANY", "en")).toBe(
      "Driver Pays Company",
    );
    expect(presentSettlementDirection("DRIVER_PAYS_COMPANY", "ar")).toBe(
      "السائق مدين للشركة",
    );
    expect(presentSettlementDirection("COMPANY_PAYS_DRIVER", "en")).toBe(
      "Company Pays Driver",
    );
    expect(presentSettlementDirection("COMPANY_PAYS_DRIVER", "ar")).toBe(
      "الشركة تدفع للسائق",
    );
  });

  it("7: Settlement status labels map correctly without changing enums", () => {
    expect(SETTLEMENT_V2_STATUSES).toContain("locked");
    expect(SETTLEMENT_V2_STATUSES).not.toContain("approved");
    expect(presentStatus("locked", "en")).toBe("Approved");
    expect(presentStatus("locked", "ar")).toBe("معتمد");
    expect(presentStatus("draft", "en")).toBe("Draft");
    expect(presentStatus("settled", "ar")).toBe("مُسوّى");
    // Domain enum string unchanged in contracts
    const contracts = src(
      "src/domain/finance/v2/FinanceImplementationContracts.ts",
    );
    expect(contracts).toMatch(/"locked"/);
  });

  it("8: Neutral memo shows no monetary effect", () => {
    expect(
      presentCorrectionKind("adjustment", "en", {
        directionOrKind: "neutral_memo",
        monetaryEffect: false,
      }),
    ).toMatch(/Neutral memo/);
    expect(
      presentCorrectionKind("neutral_memo", "ar"),
    ).toMatch(/مذكرة محايدة/);
    const financePage = src("src/features/finance/FinancePage.tsx");
    expect(financePage).toMatch(/neutralMemo/);
    expect(financePage).toMatch(/monetaryEffect/);
  });

  it("9: Adjustments/refunds/chargebacks remain distinct", () => {
    expect(presentCorrectionKind("adjustment", "en")).toBe("Adjustment");
    expect(presentCorrectionKind("refund", "en")).toBe("Refund");
    expect(presentCorrectionKind("chargeback", "en")).toBe("Chargeback");
    expect(presentCorrectionKind("adjustment", "en")).not.toBe(
      presentCorrectionKind("refund", "en"),
    );
    expect(presentFinanceTerm("adjustmentsMonetary", "en")).not.toBe(
      presentFinanceTerm("refunds", "en"),
    );
    expect(presentFinanceTerm("refunds", "en")).not.toBe(
      presentFinanceTerm("chargebacks", "en"),
    );
  });

  it("10: Reports do not expose amountMinor as a normal user-facing label", () => {
    const model: ReportExportSourceModel = {
      meta: {
        currency: "SAR",
        periodFromUtc: null,
        periodToUtc: null,
        scope: "global",
        scopeCountryIds: [],
        scopeAgentIds: [],
        sourceCompleteness: "complete",
        incompleteReasons: [],
        policyBlockers: [],
        reconciliationStatus: "PASS",
        lastAuthoritativeUpdateUtc: null,
        productionApproved: false,
        synthetic: true,
        piiMasked: true,
      },
      reportType: "finance_dashboard",
      headers: [
        "metric",
        "amountMinor",
        "currency",
        "availability",
        "incompleteReasons",
      ],
      rows: [
        [
          "grossBookingValue",
          "10000",
          "SAR",
          "available",
          "",
        ],
      ],
      totalAmountMinor: "10000",
      currencyCode: "SAR",
      requiresReportsExport: true,
    };
    const display = buildFinanceReportDisplayModel(model, "en");
    expect(display.headers.join("|")).not.toMatch(/amountMinor/);
    expect(display.rows[0]!.metricLabel).toBe("Gross Booking Value");
    expect(display.rows[0]!.amountLabel).toBe("100.00 SAR");
    const reportsPage = src("src/features/reports/ReportsPage.tsx");
    expect(reportsPage).toMatch(/buildFinanceReportDisplayModel/);
    expect(reportsPage).not.toMatch(/>amountMinor</);
  });

  it("11: AR report headers are localized", () => {
    const headers = presentReportExportHeaders(
      ["metric", "amountMinor", "currency", "availability", "incompleteReasons"],
      "ar",
    );
    expect(headers[0]).toBe("المؤشر");
    expect(headers[1]).toBe("المبلغ (وحدات صغرى)");
    expect(headers).not.toContain("amountMinor");
    expect(presentReportType("finance_dashboard", "ar")).toBe("الملخص المالي");
  });

  it("12: EN report headers are localized", () => {
    const headers = presentReportExportHeaders(
      ["metric", "amountMinor", "currency", "availability", "incompleteReasons"],
      "en",
    );
    expect(headers[0]).toBe("Metric");
    expect(headers[1]).toBe("Amount (minor units)");
    expect(headers).not.toContain("amountMinor");
    expect(presentReportType("settlement_summary", "en")).toBe(
      "Settlements Report",
    );
  });

  it("13: CSV values remain numerically/currency correct", () => {
    // Presentation maps headers only — values stay machine-safe minor strings
    const rawHeaders = [
      "metric",
      "amountMinor",
      "currency",
      "availability",
      "incompleteReasons",
    ];
    const rows = [["platformCommission", "1500", "SAR", "available", ""]];
    const localized = presentReportExportHeaders(rawHeaders, "en");
    expect(rows[0]![1]).toBe("1500");
    expect(rows[0]![2]).toBe("SAR");
    expect(localized[1]).not.toBe("1500");
    expect(formatMinorUnitsDisplay("1500", "SAR")).toBe("15.00 SAR");
  });

  it("14: Source/pilot labeling remains truthful", () => {
    const pilot = resolveAdminDataSourceLabel({
      syntheticSource: false,
      productionFirestore: true,
      documentIds: ["test_adminnext_finance_fr2_settlement_v2_001"],
    });
    expect(pilot.synthetic).toBe(false);
    expect(["production", "production_pilot"]).toContain(pilot.code);
    const pure = resolveAdminDataSourceLabel({
      syntheticSource: false,
      productionFirestore: true,
      documentIds: ["settlement_real_001"],
    });
    expect(pure.synthetic).toBe(false);
    expect(pure.code).not.toBe("development_synthetic");
  });

  it("15: Filters preserve RBAC/scope", () => {
    const scope = src(
      "src/application/finance/reporting/FinanceReportingScope.ts",
    );
    expect(scope).toMatch(/assertFinanceReadPermission|assertCountryInScope/);
    const financePage = src("src/features/finance/FinancePage.tsx");
    expect(financePage).toMatch(/PermissionGuard permission="finance:read"/);
    const exportRoute = src("src/app/api/finance/export/route.ts");
    expect(exportRoute).toMatch(/reports:export/);
  });

  it("16: No client-side authoritative finance calculation introduced", () => {
    const uiFiles = [
      "src/features/finance/FinancePage.tsx",
      "src/features/settlements/SettlementsPage.tsx",
      "src/features/settlements/SettlementDetailPage.tsx",
      "src/features/reports/ReportsPage.tsx",
      "src/features/finance/formatReportMoney.ts",
      "src/features/finance/reportDisplayModel.ts",
    ];
    for (const f of uiFiles) {
      const text = src(f);
      expect(text).not.toMatch(/commissionRate\s*\*|total_app\s*\+|recompute/i);
      expect(text).not.toMatch(/FinancialCalculationService/);
      expect(text).not.toMatch(/buildDashboardSummary\(/);
    }
  });

  it("17: FR7 golden export internals unchanged (service still uses raw headers)", () => {
    const service = src(
      "src/application/finance/reporting/FinanceReportingReadService.ts",
    );
    expect(service).toMatch(/"amountMinor"/);
    expect(service).toMatch(/"metric"/);
    // Localization happens at API presentation boundary, not in aggregator
    const aggregator = src(
      "src/domain/finance/reporting/FinanceReportingAggregator.ts",
    );
    expect(aggregator).not.toMatch(/presentFinanceTerm|presentReportExportHeaders/);
  });

  it("18-21: PC-1..4 presentation modules still present", () => {
    expect(src("src/domain/presentation/statusPresentation.ts")).toMatch(
      /presentStatus/,
    );
    expect(
      src("src/domain/production-read/SourceLabel.ts"),
    ).toMatch(/resolveAdminDataSourceLabel/);
    expect(
      src("src/application/production-read/ProductionOperationalDetailReads.ts")
        .length,
    ).toBeGreaterThan(100);
    expect(src("src/application/production-read/AdminUserReadService.ts").length).toBeGreaterThan(
      50,
    );
  });

  it("22: Production synthetic fallback remains zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
  });

  it("23: ADC active paths remain zero", () => {
    const fr7Port = src(
      "src/adapters/finance/reporting/ProductionFinanceReportingRoFirestorePort.ts",
    );
    expect(fr7Port).toMatch(/WifNative|wif_native|Fr7WifNative/);
    expect(fr7Port).not.toMatch(/credential\.applicationDefault\(/);
    const operational = src(
      "src/infrastructure/production/firestore/createWifNativeFirestoreReadTransport.ts",
    );
    expect(operational).toMatch(/WifNative|wif/i);
    expect(operational).not.toMatch(/credential\.applicationDefault\(/);
  });

  it("24: Write RPCs remain zero / write flags false", () => {
    const envExample = src(".env.example");
    expect(envExample).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
    expect(envExample).toMatch(/FINANCE_WRITE_ENABLED=false/);
    const detail = src(
      "src/features/settlements/SettlementDetailPage.tsx",
    );
    expect(detail).not.toMatch(/approveSettlement|executeSettlement|onClick=\{.*mutate/);
    expect(detail).not.toMatch(/<button[^>]*approve/i);
  });

  it("money availability AR/EN semantic states", () => {
    expect(presentMoneyAvailability("not_represented", "en")).toBe(
      "Not applicable",
    );
    expect(presentMoneyAvailability("not_represented", "ar")).toBe("غير منطبق");
    expect(presentMoneyAvailability("policy_blocked", "ar")).toBe("غير متاح");
    expect(presentMoneyAvailability("incomplete", "ar")).toBe(
      "بيانات غير مكتملة",
    );
  });

  it("platformCommission business label is Company Commission (domain total_app)", () => {
    expect(presentFinanceTerm("platformCommission", "en")).toBe(
      "Company Commission",
    );
    expect(presentFinanceTerm("platformCommission", "ar")).toBe("عمولة الشركة");
    expect(presentFinanceTerm("gatewayFees", "en")).not.toBe(
      presentFinanceTerm("platformCommission", "en"),
    );
  });
});
