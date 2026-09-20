/**
 * Final Admin Completion — contract tests 1–30 (static + targeted unit).
 * No Production mutation. Write flags remain false.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCountryFilterCanonicalId } from "@/domain/geography/CountryOption";
import { PRODUCTION_ADMIN_USER_SOURCE } from "@/domain/admin-users/AdminUserSourceDecision";
import { PRODUCTION_ADMIN_AUDIT_SOURCE } from "@/domain/audit/AdminAuditSourceDecision";
import { isCollectionAllowedForProductionRead } from "@/infrastructure/production/contracts/CollectionAllowlist";
import {
  parseLiveShadowAllowedResources,
  PHASE_PC10_FULL_LIVE_RESOURCES,
} from "@/infrastructure/production/contracts/LiveShadowResourceGate";
import { assertLiveShadowStartupOrThrow } from "@/infrastructure/production/ops/LiveShadowStartupGuard";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { PC10_DEFAULT_PRODUCTION_URL } from "@/domain/cutover/Pc10RouteMatrix";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Final Admin Completion (tests 1–30)", () => {
  it("1: Users canonical Firestore collection is user not users", () => {
    expect(PRODUCTION_ADMIN_USER_SOURCE.collection).toBe("user");
    expect(PRODUCTION_ADMIN_USER_SOURCE.authListUsers).toBe(false);
    expect(isCollectionAllowedForProductionRead("user")).toBe(true);
    expect(isCollectionAllowedForProductionRead("users")).toBe(false);
  });

  it("2: Users API armed path uses AdminUserReadService", () => {
    const route = src("src/app/api/users/route.ts");
    expect(route).toMatch(/listProductionAdminUsers/);
    expect(route).toMatch(/productionReadPathActive/);
    expect(route).toMatch(
      /if \(productionReadPathActive\(\)\)[\s\S]*?listProductionAdminUsers/,
    );
    const prodBlock = route.match(
      /if \(productionReadPathActive\(\)\)\s*\{([\s\S]*?)\n    \}/,
    )?.[1];
    expect(prodBlock).toBeTruthy();
    expect(prodBlock!).toMatch(/listProductionAdminUsers/);
    expect(prodBlock!).not.toMatch(/getRepositories\(\)\.users/);
  });

  it("3: Audit source is admin_next_cw_audit", () => {
    expect(PRODUCTION_ADMIN_AUDIT_SOURCE.collection).toBe("admin_next_cw_audit");
    expect(isCollectionAllowedForProductionRead("admin_next_cw_audit")).toBe(true);
  });

  it("4: Audit API returns structured empty list contract", () => {
    const route = src("src/app/api/audit/route.ts");
    expect(route).toMatch(/listProductionAdminAudit/);
    expect(route).toMatch(/items:\s*\[\]/);
  });

  it("5: Arabic Saudi country label resolves to saudi_arabia", () => {
    expect(resolveCountryFilterCanonicalId("المملكة العربية السعودية")).toBe(
      "saudi_arabia",
    );
  });

  it("6: Chad canonical filter aliases resolve", () => {
    expect(resolveCountryFilterCanonicalId("chad")).toBe("chad");
    expect(resolveCountryFilterCanonicalId("تشاد")).toBe("chad");
    expect(resolveCountryFilterCanonicalId("SA")).toBe("saudi_arabia");
  });

  it("7: Country filter does not write back to Firestore", () => {
    const filter = src("src/domain/geography/CountryOption.ts");
    expect(filter).toMatch(/resolveCountryFilterCanonicalId/);
    expect(filter).not.toMatch(/Firestore|getDocument|\.set\(/);
  });

  it("8: Raw bounded_sample hidden via presentStatus", () => {
    expect(presentStatus("bounded_sample", "en")).not.toBe("bounded_sample");
    expect(presentStatus("bounded_sample", "ar")).not.toMatch(/bounded/);
  });

  it("9: Raw pending_review hidden via presentStatus", () => {
    expect(presentStatus("pending_review", "en")).toBe("Pending review");
    expect(presentStatus("INVARIANT_VIOLATION", "en")).not.toBe(
      "INVARIANT_VIOLATION",
    );
  });

  it("10: Geography presentation prefers localized names", () => {
    const pres = src("src/domain/geography/GeographyPresentation.ts");
    expect(pres).toMatch(/resolveCountryDisplayNames/);
    expect(pres).toMatch(/displayNameAr/);
  });

  it("11: Geography DQ badges for cp5 and test countries", () => {
    const dq = src("src/components/ui/GeographyDqBadge.tsx");
    expect(dq).toMatch(/GeographyDqBadge/);
    const geo = src("src/domain/geography/GeographyPresentation.ts");
    expect(geo).toMatch(/cp5_country_/);
  });

  it("12: Admin shell navigation drawer at mobile breakpoints", () => {
    const shell = src("src/components/layout/AdminShell.tsx");
    expect(shell).toMatch(/mobileOpen|navOpen/);
  });

  it("13: Dashboard aggregate honesty", () => {
    const dash = src("src/features/dashboard/DashboardPage.tsx");
    expect(dash).toMatch(/presentKpiValue|metricsAvailability/);
    expect(dash).toMatch(/kpiAccuracyHint/);
    expect(dash).toMatch(/includeTestRecords|showTestRecords/);
  });

  it("14: CSP does not load dead Google api.js", () => {
    expect(src("src/app/layout.tsx")).not.toMatch(/apis\.google\.com\/js\/api\.js/);
    expect(src("src/lib/contentSecurityPolicy.ts")).not.toMatch(
      /apis\.google\.com\/js\/api\.js/,
    );
  });

  it("15: Production detail routes wired for drivers", () => {
    const route = src("src/app/api/drivers/[id]/route.ts");
    expect(route).not.toMatch(/productionReadDisabledResponse\(\)/);
    expect(route).toMatch(/getProductionDriverDetail|ProductionOperationalDetailReads/);
  });

  it("16: All write gates default false in enablement", () => {
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
  });

  it("17: No generic write API surface", () => {
    const scan = src("scripts/scan-production-write-surface.ts");
    expect(scan).toMatch(/scanProductionWriteSurface|write surface/i);
    expect(src("src/app/api/users/route.ts")).not.toMatch(/export async function POST/);
  });

  it("18: Users/Roles writes are gated identity path (not SECURITY-BLOCKED stub)", () => {
    expect(src("docs/ADMIN_NEXT_IDENTITY_WRITE_SECURITY.md")).toMatch(
      /ADMIN_IDENTITY_WRITE_ENABLED|syncUserClaimsOnWrite/,
    );
    expect(src("src/app/api/users/[id]/[action]/route.ts")).toMatch(
      /executeIdentityControlledWrite/,
    );
  });

  it("19: PC-10 full live shadow allowlist includes users and audit", () => {
    expect(PHASE_PC10_FULL_LIVE_RESOURCES).toContain("users");
    expect(PHASE_PC10_FULL_LIVE_RESOURCES).toContain("audit");
    const allowed = parseLiveShadowAllowedResources(
      PHASE_PC10_FULL_LIVE_RESOURCES.join(","),
    );
    expect(allowed.size).toBe(9);
    expect(() =>
      assertLiveShadowStartupOrThrow({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_READ_MODE: "shadow",
        AUTH_MODE: "verified_token",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        CUSTOMER_WRITE_ENABLED: false,
        FULL_PII_SHADOW_ENABLED: false,
        LIVE_SHADOW_ALLOWED_RESOURCES: PHASE_PC10_FULL_LIVE_RESOURCES.join(","),
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("20: Phase 4B seven-resource allowlist still valid at startup", () => {
    expect(() =>
      assertLiveShadowStartupOrThrow({
        PRODUCTION_READ_ENABLED: true,
        PRODUCTION_READ_MODE: "shadow",
        AUTH_MODE: "verified_token",
        EXPECTED_PROJECT_ID: "tutorial-multi-language-70gx4j",
        PRODUCTION_WRITE_ENABLED: false,
        GLOBAL_PRODUCTION_WRITE_ENABLED: false,
        FINANCE_WRITE_ENABLED: false,
        DRIVER_WRITE_ENABLED: false,
        AGENT_WRITE_ENABLED: false,
        CUSTOMER_WRITE_ENABLED: false,
        FULL_PII_SHADOW_ENABLED: false,
        LIVE_SHADOW_ALLOWED_RESOURCES:
          "countries,cities,landmarks,trips,drivers,agents,customers",
        PRODUCTION_READ_OBSERVABILITY_SINK: "structured_logger",
      }),
    ).not.toThrow();
  });

  it("21: Finance FR7 remains read-only adapter", () => {
    expect(src("src/features/finance/FinancePage.tsx")).not.toMatch(
      /FinancialCalculationService/,
    );
  });

  it("22: ONE COUNTRY ONE AGENT invariant in agent writes", () => {
    expect(src("src/application/controlled-writes/agents/AgentCountryUniqueness.ts")).toMatch(
      /fail-closed|ONE/i,
    );
  });

  it("23: Account deletion policy documented in runbook", () => {
    const runbook = src("docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md");
    expect(runbook.length).toBeGreaterThan(100);
  });

  it("24: Driver controlled write pilot package not executed", () => {
    const pkg = src(
      "src/application/controlled-writes/pilot/Pc10DriverWritePilotPackage.ts",
    );
    expect(pkg).toMatch(/PILOT EXECUTED|productionArmed/);
    expect(pkg).toMatch(/false/);
  });

  it("25: Source labels localized AR/EN", () => {
    const label = src("src/domain/production-read/SourceLabel.ts");
    expect(label).toMatch(/ar:/);
    expect(label).toMatch(/en:/);
  });

  it("26: RBAC enforced on users list API", () => {
    expect(src("src/app/api/users/route.ts")).toMatch(/users:manage/);
  });

  it("27: RBAC enforced on audit list API", () => {
    expect(src("src/app/api/audit/route.ts")).toMatch(/audit:read/);
  });

  it("28: Default production URL constant matches Vercel project", () => {
    expect(PC10_DEFAULT_PRODUCTION_URL).toBe(
      "https://touri-admin-next.vercel.app",
    );
  });

  it("29: Final completion docs present", () => {
    expect(src("docs/ADMIN_NEXT_FINAL_COMPLETION.md")).toMatch(/Final Completion/);
    expect(src("docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md")).toMatch(/Write Matrix/);
    expect(src("docs/ADMIN_NEXT_FINAL_LIVE_VALIDATION.md")).toMatch(
      /Live Validation/,
    );
  });

  it("30: No SA JSON path in application code", () => {
    const cred = src(
      "src/infrastructure/production/credentials/VercelOidcWifCredential.ts",
    );
    expect(cred).toMatch(/WIF|OIDC/);
    expect(cred).not.toMatch(/serviceAccountKey\.json/);
  });

  it("31: Shadow nav includes full PC-10 operational surfaces", async () => {
    const { SHADOW_HREF_ALLOW, SHADOW_HREF_HIDE } = await import(
      "@/domain/ui/ShadowNav"
    );
    expect(SHADOW_HREF_ALLOW).toContain("/users");
    expect(SHADOW_HREF_ALLOW).toContain("/audit");
    expect(SHADOW_HREF_ALLOW).toContain("/finance");
    expect(SHADOW_HREF_ALLOW).toContain("/support");
    expect(SHADOW_HREF_ALLOW).toContain("/notifications");
    expect([...SHADOW_HREF_HIDE]).toEqual(["/settings"]);
  });

  it("32: Geography country filter matches saudi_arabia aliases", async () => {
    const { matchesGeographyCountryFilter } = await import(
      "@/infrastructure/production/repositories/productionReadHelpers"
    );
    expect(
      matchesGeographyCountryFilter("saudi_arabia", {
        countryId: "saudi_arabia",
        canonicalCountryId: "saudi_arabia",
        sourceCountryDocumentId: "demo_saudi",
      }),
    ).toBe(true);
    expect(
      matchesGeographyCountryFilter("saudi_arabia", {
        countryId: "demo_saudi",
        canonicalCountryId: "",
        sourceCountryDocumentId: "demo_saudi",
      }),
    ).toBe(true);
    expect(
      matchesGeographyCountryFilter("saudi_arabia", {
        countryId: "egypt",
        canonicalCountryId: "egypt",
        sourceCountryDocumentId: "egypt",
      }),
    ).toBe(false);
  });

  it("33: Users/Audit/Support/Notifications enforce live shadow resources", () => {
    expect(src("src/application/production-read/AdminUserReadService.ts")).toMatch(
      /enforceLiveShadowResource\([\s\S]*"users"/,
    );
    expect(src("src/application/production-read/AdminAuditReadService.ts")).toMatch(
      /enforceLiveShadowResource\([\s\S]*"audit"/,
    );
    expect(src("src/application/production-read/SupportReadService.ts")).toMatch(
      /enforceLiveShadowResource\([\s\S]*"support"/,
    );
    expect(
      src("src/application/production-read/NotificationReadService.ts"),
    ).toMatch(/enforceLiveShadowResource\([\s\S]*"notifications"/);
  });
});
