import { describe, expect, it, beforeEach } from "vitest";
import {
  getFinanceReportingReadService,
  getFinanceReportingReadServiceSyncForTests,
  resetFinanceReportingReadServiceForTests,
  toFinanceReportingActor,
  parseFinanceFilters,
  mapFinanceApiError,
} from "@/application/finance/reporting/getFinanceReportingReadService";
import { FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS } from "@/application/finance/pilot/FinanceFr7PilotConstants";
import type { ApiActorContext } from "@/infrastructure/http/apiAuth";
import { permissionsForRole } from "@/permissions/rbac";
import { requireCanonicalCountryId } from "@/domain/geography/CanonicalCountryId";
import { resolveFinanceReportingSourceMode } from "@/application/finance/reporting/FinanceReportingSourceMode";

function actor(role: "accountant" | "support_agent" | "country_admin"): ApiActorContext {
  return {
    user: {
      id: `user_${role}`,
      email: `${role}@touri.local`,
      displayName: role,
      role,
      permissions: permissionsForRole(role),
      scope:
        role === "country_admin"
          ? { type: "country", countryIds: ["SA"] }
          : { type: "global" },
      status: "active",
      locale: "en",
    },
    correlationId: "corr",
    requestId: "req",
    idempotencyKey: null,
  };
}

describe("FR7 finance API wiring", () => {
  beforeEach(() => {
    resetFinanceReportingReadServiceForTests();
    process.env.FINANCE_REPORTING_SOURCE_MODE = "synthetic";
  });

  it("serves golden dashboard totals via factory", async () => {
    const svc = await getFinanceReportingReadService();
    const dash = svc.dashboard(toFinanceReportingActor(actor("accountant")));
    expect(dash.company.platformCommission.amountMinor).toBe(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    );
    expect(dash.meta.synthetic).toBe(true);
    expect(dash.meta.piiMasked).toBe(true);
  });

  it("sync test helper also serves golden", () => {
    const svc = getFinanceReportingReadServiceSyncForTests();
    const dash = svc.dashboard(toFinanceReportingActor(actor("accountant")));
    expect(dash.company.platformCommission.amountMinor).toBe(
      FINANCE_FR7_GOLDEN_SYNTHETIC_TOTALS.companyCommissionMinor,
    );
  });

  it("fail-closes finance read without permission", async () => {
    const svc = await getFinanceReportingReadService();
    expect(() =>
      svc.dashboard(toFinanceReportingActor(actor("support_agent"))),
    ).toThrow(/rbac_denied/);
  });

  it("fail-closes cross-country scope with canonical IDs", async () => {
    const svc = await getFinanceReportingReadService();
    const mapped = mapFinanceApiError(
      (() => {
        try {
          // russia is valid but out of SA-scoped country_admin
          svc.countrySummary(
            toFinanceReportingActor(actor("country_admin")),
            "russia",
          );
          return new Error("expected throw");
        } catch (e) {
          return e;
        }
      })(),
    );
    expect(mapped.status).toBe(403);
    expect(mapped.body.code).toBe("SCOPE_DENIED");
  });

  it("canonicalizes SA filter to saudi_arabia at API boundary", () => {
    const f = parseFinanceFilters(
      new URLSearchParams("currency=SAR&countryId=SA"),
    );
    expect(f.currency).toBe("SAR");
    expect(f.countryId).toBe("saudi_arabia");
    expect(requireCanonicalCountryId("SA")).toBe("saudi_arabia");
  });

  it("canonicalizes actor scope countryIds", () => {
    const a = toFinanceReportingActor(actor("country_admin"));
    expect(a.scope.countryIds).toEqual(["saudi_arabia"]);
  });

  it("defaults reporting source mode to synthetic", () => {
    expect(
      resolveFinanceReportingSourceMode({
        FINANCE_REPORTING_SOURCE_MODE: undefined,
        PRODUCTION_READ_ENABLED: false,
        PRODUCTION_READ_MODE: "disabled",
      }),
    ).toBe("synthetic");
  });

  it("selects production_read_only via env", () => {
    expect(
      resolveFinanceReportingSourceMode({
        FINANCE_REPORTING_SOURCE_MODE: "production_read_only",
      }),
    ).toBe("production_read_only");
  });
});
