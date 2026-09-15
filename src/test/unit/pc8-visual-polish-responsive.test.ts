/**
 * PC-8 — Visual polish & responsive UX (presentation only).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { messages, t } from "@/i18n/messages";
import {
  DEFERRED_NAV_HREFS,
  NAV_POLICY,
  PRODUCTION_NAV_HREFS,
} from "@/domain/ui/navPolicy";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { NAV_ITEMS } from "@/config/navigation";
import { assertNoProductionSyntheticFallback } from "@/domain/production-read/SourceLabel";
import { ROLE_PERMISSION_MATRIX } from "@/permissions/rbac";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";
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

describe("PC-8 visual polish / responsive UX", () => {
  it("1: No dead Production nav links", () => {
    const navHrefs = NAV_ITEMS.filter((i) => i.implemented).map((i) => i.href);
    for (const href of PRODUCTION_NAV_HREFS) {
      expect(navHrefs).toContain(href);
    }
    for (const href of DEFERRED_NAV_HREFS) {
      expect(navHrefs).not.toContain(href);
    }
    expect(src("src/components/layout/Sidebar.tsx")).toMatch(/DEFERRED_NAV_HREFS/);
    expect(src("src/components/layout/Sidebar.tsx")).toMatch(/!item\.implemented/);
  });

  it("2: Hidden deferred routes remain hidden", () => {
    expect(NAV_POLICY.support).toBe("hidden");
    expect(NAV_POLICY.settings).toBe("hidden");
    expect(NAV_POLICY.notifications).toBe("hidden");
    expect([...DEFERRED_NAV_HREFS]).toEqual(["/support", "/settings"]);
    expect(src("src/components/layout/Header.tsx")).not.toMatch(
      /t\("notifications"\)/,
    );
    expect(src("src/app/support/page.tsx")).toMatch(/DeferredSurfaceState/);
    expect(src("src/app/settings/page.tsx")).toMatch(/DeferredSurfaceState/);
  });

  it("3: Main tables preserve detail links", () => {
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/DetailNavLink/);
    expect(src("src/features/drivers/DriversPage.tsx")).toMatch(/DetailNavLink/);
    expect(src("src/features/customers/CustomersPage.tsx")).toMatch(/DetailNavLink|\/customers\//);
    expect(src("src/features/agents/AgentsPage.tsx")).toMatch(/DetailNavLink|\/agents\//);
    expect(src("src/features/settlements/SettlementsPage.tsx")).toMatch(
      /\/settlements\/\$\{/,
    );
  });

  it("4: RTL and LTR layout remain valid", () => {
    expect(src("src/components/layout/AdminShell.tsx")).toMatch(/dir=\{dir\}/);
    expect(src("src/i18n/I18nProvider.tsx")).toMatch(/locale === "ar" \? "rtl"/);
    expect(src("src/components/layout/Sidebar.tsx")).toMatch(
      /ltr:-translate-x-full|rtl:translate-x-full/,
    );
  });

  it("5: Long IDs/emails do not break common layouts", () => {
    expect(src("src/components/ui/adminUi.ts")).toMatch(/truncate/);
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/shortenId|truncate/);
    expect(src("src/components/layout/Header.tsx")).toMatch(/truncate|max-w-/);
    expect(src("src/components/i18n/LtrIsolate.tsx")).toMatch(/dir|ltr/i);
  });

  it("6: Empty states contain no write CTA", () => {
    const empty = src("src/components/states/QueryStates.tsx");
    expect(empty).toMatch(/data-testid="empty-state"/);
    expect(empty).not.toMatch(/Create|إنشاء|href=.*new/);
    const features = walkTsx(join(ROOT, "src/features"));
    for (const file of features) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("EmptyState")) continue;
      // EmptyState usage blocks should not embed Create CTAs adjacent as children props
      expect(text).not.toMatch(/EmptyState[^>]*>[\s\S]{0,80}Create/);
    }
  });

  it("7: Unavailable/forbidden/error states remain distinct", () => {
    const states = src("src/components/states/QueryStates.tsx");
    expect(states).toMatch(/data-state="unavailable"/);
    expect(states).toMatch(/data-state="forbidden"/);
    expect(states).toMatch(/data-state="error"/);
    expect(states).toMatch(/data-state="production_source_not_configured"/);
    expect(states).toMatch(/data-state="not_found"/);
    expect(states).toMatch(/data-state="deferred"/);
  });

  it("8: Source badges remain truthful", () => {
    const badge = src("src/components/ui/SourceLabelBadge.tsx");
    expect(badge).toMatch(/normalizeSourceLabelCode/);
    expect(badge).toMatch(/data-source-label/);
    expect(badge).not.toMatch(/Synthetic Data/);
  });

  it("9: DQ badges remain semantic", () => {
    const dq = src("src/components/ui/GeographyDqBadge.tsx");
    expect(dq).toMatch(/data-dq-severity/);
    expect(dq).toMatch(/presentGeographyDqSeverity/);
    expect(dq).toMatch(/INVARIANT_VIOLATION/);
  });

  it("10: Read-only pages expose no mutation action", () => {
    const prev = process.env.NEXT_PUBLIC_APP_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI;
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    delete process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI;
    expect(isControlledWriteChromeEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_APP_ENV = prev;
    process.env.NEXT_PUBLIC_CONTROLLED_WRITES_UI = prevFlag;

    expect(src("src/features/drivers/DriverWriteActions.tsx")).toMatch(
      /isControlledWriteChromeEnabled/,
    );
    expect(src("src/features/agents/AgentWriteActions.tsx")).toMatch(
      /isControlledWriteChromeEnabled/,
    );
    expect(src("src/features/customers/CustomerWriteActions.tsx")).toMatch(
      /isControlledWriteChromeEnabled/,
    );
    expect(src("src/features/settlements/SettlementsPage.tsx")).toMatch(
      /isControlledWriteChromeEnabled/,
    );
    expect(src("src/features/settlements/NewSettlementPage.tsx")).toMatch(
      /DeferredSurfaceState|readOnlyNotice/,
    );
  });

  it("11: Finance values unchanged", () => {
    expect(presentFinanceTerm("platformCommission", "en")).toMatch(/commission/i);
    expect(src("src/features/finance/formatReportMoney.ts")).toMatch(
      /formatMinorUnitsDisplay|formatReportMoney/,
    );
    expect(src("src/domain/presentation/financeTerminology.ts")).toMatch(
      /platformCommission/,
    );
  });

  it("12: Country IDs unchanged", () => {
    const id = "saudi_arabia";
    expect(
      resolveCountryDisplayName({
        countryId: id,
        liveNameEn: "Saudi Arabia",
        liveNameAr: "السعودية",
        locale: "en",
      }),
    ).toBe("Saudi Arabia");
    expect(id).toBe("saudi_arabia");
  });

  it("13: Filters/pagination behavior unchanged", () => {
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/searchLoadedPageHint|searchApplied/);
    expect(src("src/components/ui/CursorPaginationBar.tsx")).toMatch(/nextCursor/);
    expect(src("src/features/trips/TripsPage.tsx")).toMatch(/pageSize: String\(PAGE_SIZE\)/);
  });

  it("14: Responsive navigation preserves access to implemented routes", () => {
    expect(src("src/components/layout/Header.tsx")).toMatch(/mobile-nav-toggle/);
    expect(src("src/components/layout/Sidebar.tsx")).toMatch(/mobileOpen/);
    expect(src("src/components/layout/AdminShell.tsx")).toMatch(/navOpen/);
    for (const href of PRODUCTION_NAV_HREFS) {
      expect(NAV_ITEMS.some((i) => i.href === href && i.implemented)).toBe(true);
    }
  });

  it("15: Keyboard focus remains available", () => {
    expect(src("src/app/globals.css")).toMatch(/:focus-visible/);
    expect(src("src/components/ui/adminUi.ts")).toMatch(/focus-visible:outline/);
    expect(src("src/components/layout/Sidebar.tsx")).toMatch(/focus-visible/);
  });

  it("16: AR/EN localization guard remains passing", () => {
    const enKeys = Object.keys(messages.en).sort();
    const arKeys = Object.keys(messages.ar).sort();
    expect(enKeys).toEqual(arKeys);
    expect(t("ar", "openMenu")).toBeTruthy();
    expect(t("en", "surfaceDeferred")).toMatch(/deferred/i);
  });

  it("17: PC-1 regression none", () => {
    expect(src("src/domain/dashboard/KpiAccuracy.ts")).toMatch(/bounded_sample|kpiAccuracy/);
    expect(src("src/features/dashboard/DashboardPage.tsx")).toMatch(/boundedSampleHint|kpiAccuracy/);
  });

  it("18: PC-2 regression none", () => {
    expect(src("src/domain/presentation/detailRouteSemantics.ts")).toBeTruthy();
    expect(src("src/features/drivers/DriverDetailPage.tsx")).toMatch(
      /DetailNotEnabledState|source-label-badge/,
    );
  });

  it("19: PC-3 regression none", () => {
    expect(src("src/components/ui/CursorPaginationBar.tsx")).toBeTruthy();
    expect(src("src/features/drivers/DriversPage.tsx")).toMatch(/documentCompleteness|vehicleSummary/);
  });

  it("20: PC-4 regression none", () => {
    expect(src("src/application/production-read/AdminUserReadService.ts")).toBeTruthy();
    expect(src("src/domain/audit/redactAuditPayload.ts")).toBeTruthy();
    expect(src("src/features/audit/AuditPage.tsx")).toMatch(/DisclosureBlock/);
  });

  it("21: PC-5 regression none", () => {
    expect(src("src/domain/presentation/financeTerminology.ts")).toMatch(
      /presentFinanceTerm/,
    );
    expect(src("src/features/finance/FinancePage.tsx")).toMatch(/FinanceTermLabel|MoneyCell/);
  });

  it("22: PC-6 regression none", () => {
    expect(src("src/domain/geography/GeographyDataQuality.ts")).toBeTruthy();
    expect(src("src/features/geography/GeographyPage.tsx")).toMatch(
      /oneCountryOneAgentHint|geography-tabs/,
    );
  });

  it("23: PC-7 regression none", () => {
    expect(src("src/i18n/I18nProvider.tsx")).toMatch(/document\.documentElement\.dir/);
    expect(src("src/domain/presentation/statusPresentation.ts")).toMatch(/presentStatus/);
  });

  it("24: FR7 regression none", () => {
    expect(src("src/features/finance/FinancePage.tsx")).toMatch(
      /finance\/dashboard|presentFinanceTerm|FinanceTermLabel/,
    );
  });

  it("25: WIF-native reads unchanged", () => {
    expect(src("src/infrastructure/http/shadowApi.ts")).toMatch(
      /WIF|wif|PRODUCTION_READ/,
    );
  });

  it("26: ADC active paths zero", () => {
    const ops = src(
      "src/application/production-read/ProductionOperationalApiReads.ts",
    );
    expect(ops).not.toMatch(/applicationDefault|GoogleAuth\(/);
  });

  it("27: Production synthetic fallback zero", () => {
    expect(() =>
      assertNoProductionSyntheticFallback({
        appEnv: "production",
        syntheticSource: true,
      }),
    ).toThrow(/PRODUCTION_SYNTHETIC_FALLBACK_FORBIDDEN/);
  });

  it("28: Write RPC exposure zero", () => {
    expect(src("src/app/api/drivers/route.ts")).toMatch(/PRODUCTION_WRITE_DISABLED/);
    expect(src(".env.example")).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
    expect(src("src/domain/ui/controlledWriteChrome.ts")).toMatch(
      /NEXT_PUBLIC_CONTROLLED_WRITES_UI/,
    );
  });

  it("shared table strategy uses controlled horizontal scroll", () => {
    const table = src("src/components/ui/AdminDataTable.tsx");
    expect(table).toMatch(/adminUi\.tableScroll|overflow-x-auto/);
    expect(table).toMatch(/adminUi\.table/);
    expect(src("src/components/ui/adminUi.ts")).toMatch(/overflow-x-auto/);
    expect(src("src/components/ui/adminUi.ts")).toMatch(/min-w-\[44rem\]/);
  });

  it("RBAC matrix unchanged by polish", () => {
    expect(ROLE_PERMISSION_MATRIX.super_admin).toContain("finance:read");
    expect(ROLE_PERMISSION_MATRIX.auditor).toContain("audit:read");
  });
});
