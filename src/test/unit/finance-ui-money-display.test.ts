import { describe, expect, it } from "vitest";
import {
  formatMinorUnitsDisplay,
  formatReportMoney,
} from "@/features/finance/formatReportMoney";
import type { ReportMoney } from "@/domain/finance/reporting/FinanceReportingTypes";

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

describe("formatReportMoney (presentation only)", () => {
  it("never renders missing/unknown/incomplete/policy_blocked as 0", () => {
    for (const availability of [
      "missing",
      "unknown",
      "incomplete",
      "policy_blocked",
      "not_represented",
    ] as const) {
      const formatted = formatReportMoney(
        money({ availability, amountMinor: null, currency: "SAR" }),
      );
      expect(formatted.isUnknown).toBe(true);
      expect(formatted.label).not.toMatch(/^0/);
      expect(formatted.label.toLowerCase()).not.toBe("0.00 sar");
    }
  });

  it("formats available minor units with currency grouping only", () => {
    expect(formatMinorUnitsDisplay("1500", "SAR")).toBe("15.00 SAR");
    expect(formatMinorUnitsDisplay("10000", "SAR")).toBe("100.00 SAR");
    expect(formatMinorUnitsDisplay("1234567", "SAR")).toBe("12,345.67 SAR");
  });

  it("does not invent zero when amountMinor null even if availability says available", () => {
    const formatted = formatReportMoney(
      money({ availability: "available", amountMinor: null, currency: "SAR" }),
    );
    expect(formatted.isUnknown).toBe(true);
  });
});
