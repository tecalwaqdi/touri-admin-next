import { describe, expect, it } from "vitest";
import {
  requireCanonicalCountryId,
  tryCanonicalCountryId,
  countryIdsEqual,
  canonicalizeCountryIdList,
  InvalidCountryIdError,
} from "@/domain/geography/CanonicalCountryId";
import { FinanceReportingReadService } from "@/application/finance/reporting/FinanceReportingReadService";
import { buildFinanceFr7GoldenSourceBundle } from "@/application/finance/pilot/FinanceFr7PilotDocuments";
import { assertNoOtherActiveAgentSync } from "@/application/controlled-writes/agents/AgentCountryUniqueness";
import { permissionsForRole } from "@/permissions/rbac";

describe("canonical country ID aliases (SA ↔ saudi_arabia)", () => {
  it("maps SA and saudi_arabia to the same canonical ID", () => {
    expect(requireCanonicalCountryId("SA")).toBe("saudi_arabia");
    expect(requireCanonicalCountryId("sa")).toBe("saudi_arabia");
    expect(requireCanonicalCountryId("saudi_arabia")).toBe("saudi_arabia");
    expect(requireCanonicalCountryId("countries/saudi_arabia")).toBe(
      "saudi_arabia",
    );
    expect(countryIdsEqual("SA", "saudi_arabia")).toBe(true);
  });

  it("fail-closes invalid country IDs", () => {
    expect(() => requireCanonicalCountryId("not_a_country")).toThrow(
      InvalidCountryIdError,
    );
    expect(tryCanonicalCountryId("XX")).toBeNull();
  });

  it("collapses alias duplicates in scope lists", () => {
    expect(canonicalizeCountryIdList(["SA", "saudi_arabia", "sa"])).toEqual([
      "saudi_arabia",
    ]);
  });

  it("finance filter SA and saudi_arabia hit one bucket", () => {
    const svc = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle(),
    );
    const actor = {
      userId: "u",
      role: "accountant" as const,
      permissions: ["finance:read"],
      scope: { type: "global" as const },
    };
    const a = svc.dashboard(actor, { countryId: "SA" });
    const b = svc.dashboard(actor, { countryId: "saudi_arabia" });
    expect(a.company.platformCommission.amountMinor).toBe(
      b.company.platformCommission.amountMinor,
    );
    expect(a.settlementCount).toBe(b.settlementCount);
    expect(a.settlementCount).toBe(1);
  });

  it("RBAC country_admin scoped via SA alias sees saudi_arabia finance", () => {
    const svc = new FinanceReportingReadService(
      buildFinanceFr7GoldenSourceBundle(),
    );
    const actor = {
      userId: "ca",
      role: "country_admin" as const,
      permissions: permissionsForRole("country_admin"),
      scope: { type: "country" as const, countryIds: ["saudi_arabia"] },
    };
    const dash = svc.dashboard(actor, { countryId: "SA" });
    expect(dash.company.platformCommission.amountMinor).not.toBeNull();
    expect(() => svc.countrySummary(actor, "russia")).toThrow(
      /cross_country_denied/,
    );
  });

  it("support_agent has no finance:read", () => {
    expect(permissionsForRole("support_agent")).not.toContain("finance:read");
  });

  it("one-country-one-agent invariant uses canonical country", () => {
    expect(() =>
      assertNoOtherActiveAgentSync({
        countryId: "SA",
        agentId: "agt_new",
        activeAgentId: "agt_existing",
      }),
    ).toThrow(/saudi_arabia/);
  });
});
