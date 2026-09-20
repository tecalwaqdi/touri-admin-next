/**
 * PC-7 — Full-app localization / RTL / LTR tests (presentation only).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { messages, t, type MessageKey } from "@/i18n/messages";
import { I18N_NAMESPACES } from "@/i18n/namespaces";
import { formatDateTime, formatDateTimeText } from "@/i18n/formatDateTime";
import { formatCount, formatIdentifier } from "@/i18n/formatCount";
import {
  presentStatus,
  presentPaymentMethod,
  statusPresentationPair,
} from "@/domain/presentation/statusPresentation";
import { presentRole, rolePresentationPair } from "@/domain/presentation/rolePresentation";
import {
  presentPermission,
  permissionPresentationPair,
} from "@/domain/presentation/permissionPresentation";
import {
  presentFinanceTerm,
  FORBIDDEN_RAW_FINANCE_UI_LABELS,
} from "@/domain/presentation/financeTerminology";
import {
  formatReportMoney,
  formatMinorUnitsDisplay,
} from "@/features/finance/formatReportMoney";
import { presentGeographyDqSeverity } from "@/domain/geography/GeographyDataQuality";
import {
  resolveAdminDataSourceLabel,
  assertNoProductionSyntheticFallback,
} from "@/domain/production-read/SourceLabel";
import { ROLES, PERMISSIONS } from "@/types/roles";
import { ROLE_PERMISSION_MATRIX } from "@/permissions/rbac";
import { resolveCountryDisplayName } from "@/domain/geography/GeographyPresentation";

const ROOT = join(__dirname, "../../..");

function src(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("PC-7 localization / RTL / LTR", () => {
  it("1: Arabic root renders RTL", () => {
    const provider = src("src/i18n/I18nProvider.tsx");
    expect(provider).toMatch(/dir:\s*"rtl"\s*\|\s*"ltr"/);
    expect(provider).toMatch(/locale === "ar" \? "rtl"/);
    expect(provider).toMatch(/document\.documentElement\.dir/);
    expect(src("src/components/layout/AdminShell.tsx")).toMatch(/dir=\{dir\}/);
  });

  it("2: English root renders LTR", () => {
    const provider = src("src/i18n/I18nProvider.tsx");
    expect(provider).toMatch(/: "ltr"/);
    expect(t("en", "dashboard")).toBe("Dashboard");
    expect(t("ar", "dashboard")).toBe("لوحة المؤشرات");
  });

  it("3: Locale switch does not alter canonical IDs", () => {
    const id = "saudi_arabia";
    expect(formatIdentifier(id)).toBe(id);
    expect(formatIdentifier(id)).not.toMatch(/,/);
    const name = resolveCountryDisplayName({
      countryId: "saudi_arabia",
      liveNameAr: "السعودية",
      liveNameEn: "Saudi Arabia",
      locale: "ar",
    });
    expect(name).toBe("السعودية");
    expect(id).toBe("saudi_arabia");
  });

  it("4: Locale switch does not alter API filter values", () => {
    const trips = src("src/features/trips/TripsPage.tsx");
    expect(trips).toMatch(/key=\{s\}/);
    expect(trips).toMatch(/value=\{s\}/);
    expect(trips).toMatch(/presentStatus\(s, locale\)/);
    expect(trips).toMatch(/option value="cash"/);
    expect(trips).toMatch(/presentPaymentMethod\("cash"/);
  });

  it("5: Role keys remain canonical while display labels localize", () => {
    for (const role of ROLES) {
      const pair = rolePresentationPair(role, "ar");
      expect(pair.domainValue).toBe(role);
      expect(pair.label).not.toBe(role);
      expect(presentRole(role, "en")).toBeTruthy();
      expect(presentRole(role, "ar")).toBeTruthy();
    }
    expect(presentRole("super_admin", "ar")).toBe("المسؤول العام");
  });

  it("6: Permission keys remain canonical while descriptions localize", () => {
    for (const p of PERMISSIONS) {
      const pair = permissionPresentationPair(p, "en");
      expect(pair.domainValue).toBe(p);
      expect(pair.label).not.toBe(p);
    }
    expect(presentPermission("finance:read", "ar")).toBe("عرض البيانات المالية");
    expect(presentPermission("settlements:approve", "en")).toBe(
      "Approve settlements",
    );
  });

  it("7: Status enums remain canonical while labels localize", () => {
    const pair = statusPresentationPair("pending_review", "ar");
    expect(pair.domainValue).toBe("pending_review");
    expect(pair.label).toBe("قيد المراجعة");
    expect(presentStatus("needs_changes", "en")).toBe("Needs changes");
    expect(presentStatus("totally_unknown_xyz", "en")).toBe("Unknown");
    expect(presentStatus("totally_unknown_xyz", "ar")).toBe("غير معروف");
  });

  it("8: Finance keys remain hidden from user-facing labels", () => {
    for (const key of FORBIDDEN_RAW_FINANCE_UI_LABELS) {
      expect(presentFinanceTerm(key, "en")).not.toBe(key);
    }
    const dash = src("src/features/dashboard/DashboardPage.tsx");
    expect(dash).not.toMatch(/label="Gross booking"/);
    expect(dash).toMatch(/presentFinanceTerm\("grossBookingValue"/);
  });

  it("9: Geography canonical IDs remain unchanged", () => {
    const presentation = src("src/domain/geography/GeographyPresentation.ts");
    expect(presentation).toMatch(/displayName/);
    expect(src("src/features/geography/GeographyPage.tsx")).toMatch(
      /canonicalCountryId|countryId/,
    );
  });

  it("10: Country names localize without changing identifiers", () => {
    const ar = resolveCountryDisplayName({
      countryId: "egypt",
      liveNameAr: "مصر",
      liveNameEn: "Egypt",
      locale: "ar",
    });
    const en = resolveCountryDisplayName({
      countryId: "egypt",
      liveNameAr: "مصر",
      liveNameEn: "Egypt",
      locale: "en",
    });
    expect(ar).toBe("مصر");
    expect(en).toBe("Egypt");
  });

  it("11: Email/IDs render safely LTR inside Arabic layout", () => {
    const ltr = src("src/components/i18n/LtrIsolate.tsx");
    expect(ltr).toMatch(/dir="ltr"/);
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/LtrIsolate/);
    expect(src("src/features/users/UsersPage.tsx")).toMatch(/LtrIsolate/);
    expect(src("src/features/audit/AuditPage.tsx")).toMatch(/LtrIsolate/);
  });

  it("12: Dates use centralized locale formatter", () => {
    const formatted = formatDateTime("2026-01-15T12:30:00.000Z", "en");
    expect(formatted.text).not.toMatch(/2026-01-15T12:30:00/);
    expect(formatted.iso).toBe("2026-01-15T12:30:00.000Z");
    expect(formatDateTimeText(null, "ar")).toMatch(/غير متاح/);
    expect(src("src/features/trips/TripDetailPage.tsx")).toMatch(
      /FormattedDateTime/,
    );
    expect(src("src/features/audit/AuditPage.tsx")).toMatch(/FormattedDateTime/);
  });

  it("13: Money still uses PC-5 formatter", () => {
    expect(formatMinorUnitsDisplay("1500", "SAR")).toBe("15.00 SAR");
    expect(src("src/features/finance/FinancePage.tsx")).toMatch(/MoneyCell|formatReportMoney|presentFinanceTerm/);
  });

  it("14: Missing money still never becomes zero", () => {
    const formatted = formatReportMoney(
      {
        amountMinor: null,
        currency: "SAR",
        availability: "missing",
        incompleteReasons: [],
      },
      "en",
    );
    expect(formatted.isUnknown).toBe(true);
    expect(formatted.label).not.toMatch(/^0/);
  });

  it("15: Dashboard totals use aggregate labels (not sample wording)", () => {
    expect(t("en", "boundedResultsHint")).toMatch(/≤50|Bounded/i);
    expect(t("ar", "boundedResultsHint")).toMatch(/≤50/);
    expect(t("en", "totalTrips")).toMatch(/Total trips/i);
    expect(t("ar", "totalTrips")).toMatch(/إجمالي/);
  });

  it("16: Source labels remain truthful", () => {
    const pilot = resolveAdminDataSourceLabel({
      productionFirestore: true,
      documentIds: ["test_adminnext_x"],
    });
    expect(pilot.label).toBe("production_pilot");
    expect(pilot.en).toMatch(/pilot/i);
    expect(pilot.ar).toMatch(/تجريب/);
    const unavailable = resolveAdminDataSourceLabel({ unavailable: true });
    expect(unavailable.label).toBe("unavailable");
    expect(unavailable.en).toMatch(/unavailable/i);
  });

  it("17: DQ severity labels localize correctly", () => {
    expect(presentGeographyDqSeverity("INFO", "ar")).toBe("معلومات");
    expect(presentGeographyDqSeverity("WARNING", "ar")).toBe("تنبيه");
    expect(presentGeographyDqSeverity("ERROR", "ar")).toBe("خطأ في البيانات");
    expect(presentGeographyDqSeverity("INVARIANT_VIOLATION", "ar")).toBe(
      "مخالفة قاعدة النظام",
    );
  });

  it("18: Production Users/Audit fixture fallback remains zero", () => {
    const users = src("src/app/api/users/route.ts");
    const audit = src("src/app/api/audit/route.ts");
    expect(users).toMatch(/PRODUCTION_USER_SOURCE_NOT_CONFIGURED|AdminUserReadService/);
    expect(audit).toMatch(/PRODUCTION_AUDIT_SOURCE_NOT_CONFIGURED|AdminAuditReadService/);
    expect(users + audit).not.toMatch(/getSyntheticUsers|mockAuditFixture/);
  });

  it("19: Detail routes remain functional", () => {
    for (const f of [
      "src/features/trips/TripDetailPage.tsx",
      "src/features/drivers/DriverDetailPage.tsx",
      "src/features/customers/CustomerDetailPage.tsx",
      "src/features/agents/AgentDetailPage.tsx",
    ]) {
      expect(src(f)).toMatch(/apiFetch\(`/);
    }
  });

  it("20: Pagination/filter behavior unchanged", () => {
    expect(src("src/components/ui/CursorPaginationBar.tsx")).toMatch(/nextCursor/);
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/CursorPaginationBar/);
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/searchLoadedPageHint|searchWithinLoaded/);
  });

  it("21: RBAC unchanged", () => {
    expect(ROLE_PERMISSION_MATRIX.super_admin).toContain("finance:read");
    expect(ROLE_PERMISSION_MATRIX.auditor).toContain("audit:read");
    expect(src("src/permissions/rbac.ts")).not.toMatch(/presentRole|presentPermission/);
  });

  it("22: IDOR protection unchanged", () => {
    const detail = src(
      "src/application/production-read/ProductionOperationalDetailReads.ts",
    );
    expect(detail).toMatch(/assertDetailResourceInScope/);
  });

  it("23: WIF-native reads unchanged", () => {
    expect(src("src/infrastructure/http/shadowApi.ts")).toMatch(/WIF|wif|PRODUCTION_READ/);
  });

  it("24: ADC active paths = zero", () => {
    const ops = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(ops).not.toMatch(/applicationDefault|GoogleAuth\(/);
  });

  it("25: Production synthetic fallback = zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
  });

  it("26: Write RPC exposure = zero", () => {
    expect(src("src/app/api/drivers/route.ts")).toMatch(/PRODUCTION_WRITE_DISABLED/);
    expect(src(".env.example")).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
  });

  it("27–32: PC-1..6 presentation modules still present", () => {
    expect(src("src/domain/dashboard/KpiAccuracy.ts")).toBeTruthy();
    expect(src("src/domain/presentation/detailRouteSemantics.ts")).toBeTruthy();
    expect(src("src/components/ui/CursorPaginationBar.tsx")).toBeTruthy();
    expect(src("src/application/production-read/AdminUserReadService.ts")).toBeTruthy();
    expect(src("src/domain/presentation/financeTerminology.ts")).toBeTruthy();
    expect(src("src/domain/geography/GeographyDataQuality.ts")).toBeTruthy();
  });

  it("33: FR7 regression none", () => {
    expect(src("src/features/finance/FinancePage.tsx")).toMatch(/finance\/dashboard|FinanceTermLabel|presentFinanceTerm/);
    expect(src("src/domain/presentation/financeTerminology.ts")).toMatch(
      /platformCommission/,
    );
  });

  it("Y: practical guard against untranslated user-facing literals on major pages", () => {
    const major = [
      "src/features/dashboard/DashboardPage.tsx",
      "src/features/trips/TripsPage.tsx",
      "src/features/drivers/DriversPage.tsx",
      "src/features/customers/CustomersPage.tsx",
      "src/features/agents/AgentsPage.tsx",
      "src/features/geography/GeographyPage.tsx",
      "src/features/users/UsersPage.tsx",
      "src/features/roles/RolesPage.tsx",
      "src/features/audit/AuditPage.tsx",
      "src/components/layout/Header.tsx",
      "src/components/layout/Sidebar.tsx",
      "src/features/auth/LoginPage.tsx",
    ];
    const forbiddenVisible = [
      "grossBookingValue",
      "eligibleRevenue",
      "amountMinor",
      "mappingStatus",
      "incompleteReasons",
      "registration_status",
    ];
    for (const file of major) {
      const text = src(file);
      for (const bad of forbiddenVisible) {
        // Allow mentions only in comments/imports/types — fail if used as JSX string label
        expect(text).not.toMatch(new RegExp(`>\\s*${bad}\\s*<`));
        expect(text).not.toMatch(new RegExp(`label=["']${bad}["']`));
        expect(text).not.toMatch(new RegExp(`label=\\{\\s*["']${bad}["']\\s*\\}`));
      }
      expect(text).not.toMatch(/label="Gross booking"/);
      expect(text).not.toMatch(/>Mapping Health</);
    }
  });

  it("X: no raw key scan for listed forbidden UI labels in feature JSX labels", () => {
    const featureFiles = walkTsx(join(ROOT, "src/features")).filter((p) =>
      p.endsWith(".tsx"),
    );
    const patterns = [
      /label=["']pending_review["']/,
      /label=["']needs_changes["']/,
      /label=["']production_pilot["']/,
      /label=["']no_active_agent["']/,
      /label=["']INVARIANT_VIOLATION["']/,
      /label=["']grossBookingValue["']/,
      /label=["']amountMinor["']/,
      /label=["']mappingStatus["']/,
    ];
    for (const file of featureFiles) {
      const text = readFileSync(file, "utf8");
      for (const re of patterns) {
        expect(text, `${file} ${re}`).not.toMatch(re);
      }
    }
  });

  it("catalog: AR/EN parity and namespaces exist", () => {
    expect(I18N_NAMESPACES.length).toBeGreaterThan(10);
    const enKeys = Object.keys(messages.en) as MessageKey[];
    const arKeys = Object.keys(messages.ar);
    expect(enKeys.sort()).toEqual(arKeys.sort());
    expect(t("ar", "drivers")).toBe("السائقون");
    expect(t("ar", "agents")).toBe("الوكلاء");
    expect(t("en", "reports")).toMatch(/Financial reports/i);
  });

  it("counts: locale-aware; identifiers not locale-formatted", () => {
    expect(formatCount(1234, "en")).toMatch(/1,?234/);
    expect(formatIdentifier("001234")).toBe("001234");
  });

  it("payment methods localize with canonical values preserved", () => {
    expect(presentPaymentMethod("cash", "ar")).toBe("نقدي");
    expect(presentPaymentMethod("online", "en")).toBe("Online");
  });
});
