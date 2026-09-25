import { describe, expect, it } from "vitest";
import {
  ACCOUNTANT_HOME_HREF,
  ACCOUNTANT_NAV_HREFS,
  filterNavForAccountant,
  homeHrefForRole,
  isAccountantRole,
  isAccountantWorkspacePath,
} from "@/domain/ui/accountantWorkspace";
import { NAV_ITEMS } from "@/config/navigation";
import { presentFinanceTerm } from "@/domain/presentation/financeTerminology";
import {
  NO_CERTIFIED_FINANCE_DATA_AR,
  NO_CERTIFIED_SETTLEMENTS_AR,
} from "@/domain/finance/reporting/SettlementCommercialCutover";
import {
  settlementsInLane,
  settlementStatusForLane,
} from "@/domain/finance/reporting/AccountantSettlementLanes";
import type { SettlementListItem } from "@/domain/finance/reporting/FinanceReportingTypes";

describe("accountant finance workspace UI", () => {
  it("lands accountants on finance home", () => {
    expect(homeHrefForRole("accountant")).toBe(ACCOUNTANT_HOME_HREF);
    expect(homeHrefForRole("super_admin")).toBe("/dashboard");
    expect(isAccountantRole("accountant")).toBe(true);
    expect(isAccountantRole("super_admin")).toBe(false);
  });

  it("limits accountant nav to finance surfaces only", () => {
    const hrefs = filterNavForAccountant(NAV_ITEMS).map((i) => i.href);
    expect(hrefs).toEqual([...ACCOUNTANT_NAV_HREFS]);
    expect(hrefs).toContain("/finance/cash");
    expect(hrefs).toContain("/finance/agents");
    expect(hrefs).toContain("/finance/ledger");
    expect(hrefs).toContain("/finance/reconciliation");
    expect(hrefs).toContain("/finance/exceptions");
    expect(hrefs).not.toContain("/dashboard");
    expect(hrefs).not.toContain("/trips");
    expect(hrefs).not.toContain("/users");
    expect(hrefs).not.toContain("/audit");
    expect(hrefs).not.toContain("/drivers");
    expect(hrefs).not.toContain("/agents");
  });

  it("recognizes finance workspace paths", () => {
    expect(isAccountantWorkspacePath("/finance")).toBe(true);
    expect(isAccountantWorkspacePath("/finance/driver-wallets")).toBe(true);
    expect(isAccountantWorkspacePath("/finance/cash")).toBe(true);
    expect(isAccountantWorkspacePath("/finance/exceptions")).toBe(true);
    expect(isAccountantWorkspacePath("/settlements/new")).toBe(true);
    expect(isAccountantWorkspacePath("/reports")).toBe(true);
    expect(isAccountantWorkspacePath("/dashboard")).toBe(false);
    expect(isAccountantWorkspacePath("/users")).toBe(false);
  });

  it("maps settlement workflow lanes without inventing statuses", () => {
    expect(settlementStatusForLane("awaiting_payment")).toBe("locked");
    expect(settlementStatusForLane("needs_prepare")).toBe("draft");
    const samples = [
      { id: "1", status: "draft", outstandingMinor: "100" },
      { id: "2", status: "settled", outstandingMinor: "0" },
    ] as SettlementListItem[];
    expect(settlementsInLane(samples, "needs_prepare")).toHaveLength(1);
    expect(settlementsInLane(samples, "reconciled")).toHaveLength(1);
  });

  it("uses certified empty-state Arabic copy", () => {
    expect(presentFinanceTerm("noCertifiedSnapshots", "ar")).toBe(
      NO_CERTIFIED_FINANCE_DATA_AR,
    );
    expect(presentFinanceTerm("noCertifiedSettlements", "ar")).toBe(
      NO_CERTIFIED_SETTLEMENTS_AR,
    );
  });

  it("labels Touri commission without raw enums", () => {
    expect(presentFinanceTerm("platformCommission", "en")).toBe(
      "Touri Commission",
    );
    expect(presentFinanceTerm("platformCommission", "ar")).toBe("عمولة توري");
    expect(presentFinanceTerm("grossBookingValue", "en")).toBe(
      "Certified Gross",
    );
  });

  it("uses Arabic accountant workspace terminology", () => {
    expect(presentFinanceTerm("cashCollections", "ar")).toBe(
      "التحصيلات النقدية",
    );
    expect(presentFinanceTerm("financialLedger", "ar")).toBe(
      "دفتر الحركات المالية",
    );
    expect(presentFinanceTerm("actionQueue", "ar")).toBe("مهام تحتاج إجراء");
  });
});
