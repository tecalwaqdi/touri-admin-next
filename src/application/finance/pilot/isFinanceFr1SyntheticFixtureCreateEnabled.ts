/**
 * FR1 synthetic fixture create arm flags — default SKIP. Never auto-enable.
 */

export function isFinanceFr1SyntheticFixtureDryRunEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}

export function isFinanceFr1SyntheticFixtureCreateEnabled(
  value?: string | undefined,
): boolean {
  return value === "1";
}
