/**
 * Format minor units for display only (no arithmetic / FX).
 * Canonical trust path for UI minor→major presentation.
 * Example: 1500 + SAR → "15.00 SAR"
 */
export function formatMinorUnitsDisplay(
  amountMinor: string | null,
  currency: string | null,
): string {
  if (amountMinor == null || amountMinor === "") {
    return "—";
  }
  const cur = currency ?? "";
  // Display grouping only — no FX or commission math.
  const negative = amountMinor.startsWith("-");
  const raw = negative ? amountMinor.slice(1) : amountMinor;
  if (!/^\d+$/.test(raw)) {
    return "—";
  }
  const padded = raw.padStart(3, "0");
  const whole = padded.slice(0, -2) || "0";
  const frac = padded.slice(-2);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const signed = `${negative ? "-" : ""}${grouped}.${frac}`;
  return cur ? `${signed} ${cur}` : signed;
}

