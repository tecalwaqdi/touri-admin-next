/**
 * PC-10 Production cutover / staged write pilot preparation tests.
 * No Production mutation. Write flags must remain false.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  COMMERCIAL_KPI_POLICY,
  commercialSampleRequiresPilotNotice,
  decideCommercialKpiRow,
} from "@/domain/dashboard/CommercialKpiPolicy";
import {
  PC10_API_LIVE_CONTRACT_GET_ROUTES,
  PC10_API_WRITE_PROBE_ROUTES,
  PC10_CUSTOM_PRODUCTION_URL,
  PC10_DEFAULT_PRODUCTION_URL,
  PC10_LEGACY_ADMIN_FALLBACK_URL,
  PC10_PRODUCTION_DETAIL_ROUTE_PATTERNS,
  PC10_PRODUCTION_PAGE_ROUTES,
  PC10_VERCEL_PROJECT,
} from "@/domain/cutover/Pc10RouteMatrix";
import {
  assertPc10PilotNotExecuted,
  buildPc10DriverWritePilotPackage,
  PC10_INITIAL_CUTOVER_MODE,
  PC10_WRITE_PILOT_EXECUTED,
} from "@/application/controlled-writes/pilot/Pc10DriverWritePilotPackage";
import { CONTROLLED_WRITES_ENABLEMENT } from "@/application/controlled-writes/ControlledWriteEnablement";
import { buildContentSecurityPolicy } from "@/lib/contentSecurityPolicy";
import { scanProductionWriteSurface } from "../../../scripts/scan-production-write-surface";
import {
  FR7_PREFERRED_SHADOW_READER_SA,
  GCP_SERVICE_ACCOUNT_EMAIL_ENV,
  GCP_WORKLOAD_IDENTITY_PROVIDER_ENV,
} from "@/infrastructure/production/credentials/VercelOidcWifCredential";
import { isUnsafePrefixOnlyExclusion } from "@/domain/production-read/RecordClassification";

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("PC-10 Production cutover preparation", () => {
  it("cutover mode remains READ_ONLY and pilot not executed", () => {
    expect(PC10_INITIAL_CUTOVER_MODE).toBe("READ_ONLY");
    expect(PC10_WRITE_PILOT_EXECUTED).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.productionWritesEnabled).toBe(false);
    expect(CONTROLLED_WRITES_ENABLEMENT.controlledWritesEnabled).toBe(false);
    assertPc10PilotNotExecuted();
  });

  it("env examples keep all write gates false including geography + UI chrome", () => {
    for (const file of [
      ".env.production.example",
      ".env.example",
      ".env.staging.example",
      ".env.development.example",
    ]) {
      const body = src(file);
      expect(body).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
      expect(body).toMatch(/PRODUCTION_WRITE_ENABLED=false/);
      expect(body).toMatch(/DRIVER_WRITE_ENABLED=false/);
      expect(body).toMatch(/AGENT_WRITE_ENABLED=false/);
      expect(body).toMatch(/CUSTOMER_WRITE_ENABLED=false/);
      expect(body).toMatch(/CUSTOMER_AUTH_WRITE_ENABLED=false/);
      expect(body).toMatch(/FINANCE_WRITE_ENABLED=false/);
      expect(body).toMatch(/GEOGRAPHY_WRITE_ENABLED=false/);
      expect(body).toMatch(/NEXT_PUBLIC_CONTROLLED_WRITES_UI=false/);
      expect(body).not.toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=true/);
      expect(body).not.toMatch(/DRIVER_WRITE_ENABLED=true/);
    }
  });

  it("commercial KPI policy forbids prefix-only silent exclusion", () => {
    expect(COMMERCIAL_KPI_POLICY.allowPrefixOnlySilentExclusion).toBe(false);
    expect(COMMERCIAL_KPI_POLICY.productionDeletionAllowed).toBe(false);
    expect(COMMERCIAL_KPI_POLICY.uncertainBehavior).toBe(
      "keep_with_dq_or_pilot_notice",
    );

    const prefixOnly = decideCommercialKpiRow({
      id: "test_adminnext_finance_demo_001",
    });
    expect(prefixOnly.decision).toBe("include_with_pilot_notice");
    expect(prefixOnly.requiresOperatorNotice).toBe(true);

    const reliable = decideCommercialKpiRow({
      id: "any_id",
      mappingStatus: "testOrNoncanonical",
    });
    expect(reliable.decision).toBe("exclude_with_reliable_evidence");
    expect(reliable.requiresOperatorNotice).toBe(true);

    const uncertain = decideCommercialKpiRow({ id: "commercial_unknown_1" });
    // Without mapping/domain evidence and without contractual id → operational or unknown
    expect(["include_operational", "include_uncertain_with_dq_notice"]).toContain(
      uncertain.decision,
    );

    expect(
      isUnsafePrefixOnlyExclusion({
        usedOnlyIdPrefix: true,
        hasDomainOrMappingEvidence: false,
      }),
    ).toBe(true);

    expect(
      commercialSampleRequiresPilotNotice([
        { id: "pilot_fr1_settlement_x" },
        { id: "ops_trip_1", mappingStatus: "mapped" },
      ]),
    ).toBe(true);

    const dash = src("src/features/dashboard/DashboardPage.tsx");
    expect(dash).toMatch(/sampleIncludesPilotOrTest/);
    expect(dash).toMatch(/pilotIncludedNotice/);
  });

  it("route matrix covers required Production pages + detail patterns", () => {
    expect(PC10_PRODUCTION_PAGE_ROUTES).toContain("/dashboard");
    expect(PC10_PRODUCTION_PAGE_ROUTES).toContain("/drivers");
    expect(PC10_PRODUCTION_PAGE_ROUTES).toContain("/finance");
    expect(PC10_PRODUCTION_DETAIL_ROUTE_PATTERNS).toContain("/drivers/[id]");
    expect(PC10_API_LIVE_CONTRACT_GET_ROUTES.length).toBeGreaterThan(10);
    expect(PC10_API_WRITE_PROBE_ROUTES.some((r) => r.includes("/drivers/"))).toBe(
      true,
    );
    expect(PC10_DEFAULT_PRODUCTION_URL).toBe(
      "https://touri-admin-next.vercel.app",
    );
    expect(PC10_CUSTOM_PRODUCTION_URL).toBe(
      "https://admin-next.touri-taxi.com",
    );
    expect(PC10_VERCEL_PROJECT).toBe("touri-admin-next");
    expect(PC10_LEGACY_ADMIN_FALLBACK_URL).toMatch(/web\.app\/admin/);
  });

  it("production write surface scan remains clean", () => {
    const scan = scanProductionWriteSurface();
    expect(scan.ok).toBe(true);
    expect(scan.violations).toEqual([]);
    expect(scan.credentialPathHits).toEqual([]);
  });

  it("WIF credential path prefers shadow-reader SA and forbids SA JSON", () => {
    expect(FR7_PREFERRED_SHADOW_READER_SA).toMatch(
      /^touri-admin-next-shadow-reader@/,
    );
    expect(GCP_WORKLOAD_IDENTITY_PROVIDER_ENV).toBe(
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
    );
    expect(GCP_SERVICE_ACCOUNT_EMAIL_ENV).toBe("GCP_SERVICE_ACCOUNT_EMAIL");
    const wif = src(
      "src/infrastructure/production/credentials/VercelOidcWifCredential.ts",
    );
    expect(wif).toMatch(/getVercelOidcToken/);
    expect(wif).not.toMatch(/BEGIN PRIVATE KEY/);
    expect(wif).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
    const prodExample = src(".env.production.example");
    expect(prodExample).toMatch(/GOOGLE_APPLICATION_CREDENTIALS must remain UNSET/);
    expect(prodExample).toMatch(/touri-admin-next-shadow-reader@/);
  });

  it("CSP does not load unused api.js and stays scoped", () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toMatch(/script-src [^;]*'self'/);
    expect(csp).not.toMatch(/apis\.google\.com\/js\/api\.js/);
    expect(csp).not.toMatch(/maps\.googleapis\.com/);
    const layout = src("src/app/layout.tsx");
    expect(layout).not.toMatch(/api\.js/);
    expect(layout).not.toMatch(/googleapis\.com\/js/);
    // No dead api.js script tags in app tree
    const providers = src("src/app/providers.tsx");
    expect(providers).not.toMatch(/api\.js/);
  });

  it("driver write pilot package is ready for operator approval but unarmed", () => {
    const pkg = buildPc10DriverWritePilotPackage();
    expect(pkg.writePilotReadyForOperatorApproval).toBe(true);
    expect(pkg.executed).toBe(false);
    expect(pkg.productionArmed).toBe(false);
    expect(pkg.writeFlagsRemainFalse).toBe(true);
    expect(pkg.resource).toBe("driver");
    expect(pkg.action).toBe("needs_changes");
    expect(pkg.liveTargetId).toBe("PENDING_OPERATOR_SAFE_SYNTHETIC_ONLY");
    expect(pkg.forbiddenTargets).toContain("any_commercial_driver");
    expect(pkg.stillOffAfterPilotPrep).toContain("FINANCE_WRITE_ENABLED");
    expect(pkg.killSwitches.every((k) => k.includes("=false"))).toBe(true);
  });

  it("PC-10 cutover + runbook docs exist without secrets", () => {
    expect(existsSync("docs/ADMIN_NEXT_PC10_CUTOVER.md")).toBe(true);
    expect(existsSync("docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md")).toBe(true);
    const cutover = src("docs/ADMIN_NEXT_PC10_CUTOVER.md");
    const runbook = src("docs/ADMIN_NEXT_PRODUCTION_RUNBOOK.md");
    for (const body of [cutover, runbook]) {
      expect(body).not.toMatch(/BEGIN PRIVATE KEY/);
      expect(body).not.toMatch(/"private_key"/);
      expect(body).toMatch(/GLOBAL_PRODUCTION_WRITE_ENABLED=false/);
      expect(body).toMatch(/WRITE_PILOT_READY_FOR_OPERATOR_APPROVAL/);
      expect(body).toMatch(/PILOT EXECUTED:\s*NO/);
      expect(body).toMatch(/touri-admin-next\.vercel\.app/);
      expect(body).toMatch(/admin-next\.touri-taxi\.com/);
      expect(body).toMatch(/Legacy/);
    }
    expect(cutover).toMatch(/76\.76\.21\.21/);
    expect(runbook).toMatch(/kill-switch|Kill switch/i);
  });

  it("finance/agent/customer/geography/users writes stay gated OFF in matrix", () => {
    const matrix = src("docs/ADMIN_NEXT_FINAL_WRITE_MATRIX.md");
    expect(matrix).toMatch(/GEOGRAPHY_WRITE_ENABLED/);
    expect(matrix).toMatch(/FINANCE_WRITE_ENABLED/);
    expect(matrix).toMatch(/ADMIN_IDENTITY_WRITE_ENABLED/);
    expect(matrix).toMatch(/false/);
    expect(matrix).toMatch(/EXECUTED:\s*NO|Production armed.*NO/i);
  });
});
