export type CurrencyCode = string;

export class CurrencyMismatchError extends Error {
  readonly code = "CURRENCY_MISMATCH";

  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = "CurrencyMismatchError";
  }
}

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/**
 * Integer-safe money in minor units (e.g. halalas / fils / piastres).
 * Never mixes currencies; never uses floating point for arithmetic.
 */
export class Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;

  private constructor(amountMinor: bigint, currency: CurrencyCode) {
    if (!currency || !currency.trim()) {
      throw new Error("currency is required");
    }
    this.amountMinor = amountMinor;
    this.currency = currency.toUpperCase();
  }

  static of(amountMinor: bigint | number | string, currency: CurrencyCode): Money {
    const value =
      typeof amountMinor === "bigint"
        ? amountMinor
        : BigInt(typeof amountMinor === "number" ? Math.trunc(amountMinor) : amountMinor);
    return new Money(value, currency);
  }

  static zero(currency: CurrencyCode): Money {
    return Money.of(ZERO, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor - other.amountMinor, this.currency);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.amountMinor < other.amountMinor) return -1;
    if (this.amountMinor > other.amountMinor) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  isZero(): boolean {
    return this.amountMinor === ZERO;
  }

  isNegative(): boolean {
    return this.amountMinor < ZERO;
  }

  abs(): Money {
    return this.amountMinor < ZERO
      ? Money.of(-this.amountMinor, this.currency)
      : Money.of(this.amountMinor, this.currency);
  }

  negate(): Money {
    return Money.of(-this.amountMinor, this.currency);
  }

  /** Format major units with 2 decimal places (synthetic display helper). */
  format(locale = "en"): string {
    const negative = this.amountMinor < ZERO;
    const abs = negative ? -this.amountMinor : this.amountMinor;
    const major = abs / HUNDRED;
    const minor = abs % HUNDRED;
    const formatted = `${major.toString()}.${minor.toString().padStart(2, "0")}`;
    const signed = negative ? `-${formatted}` : formatted;
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: this.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(signed));
    } catch {
      return `${signed} ${this.currency}`;
    }
  }

  toJSON(): { amountMinor: string; currency: CurrencyCode } {
    return { amountMinor: this.amountMinor.toString(), currency: this.currency };
  }

  static fromJSON(json: { amountMinor: string | number | bigint; currency: CurrencyCode }): Money {
    return Money.of(json.amountMinor, json.currency);
  }
}
