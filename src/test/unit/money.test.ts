import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, Money } from "@/domain/finance/Money";

describe("Money", () => {
  it("adds and subtracts same currency", () => {
    const a = Money.of(1000, "SAR");
    const b = Money.of(250, "SAR");
    expect(a.add(b).amountMinor).toBe(BigInt(1250));
    expect(a.subtract(b).amountMinor).toBe(BigInt(750));
    expect(a.compare(b)).toBe(1);
    expect(a.format("en")).toContain("10");
  });

  it("rejects currency mismatch", () => {
    expect(() => Money.of(100, "SAR").add(Money.of(100, "KGS"))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => Money.of(100, "SAR").compare(Money.of(100, "AED"))).toThrow(
      CurrencyMismatchError,
    );
  });
});
