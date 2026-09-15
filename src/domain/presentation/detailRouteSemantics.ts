/**
 * Detect Production detail-route disabled responses without claiming “not found”.
 * Pure helper — safe for unit tests and client pages.
 */

export function isProductionDetailDisabledResponse(input: {
  status: number;
  code?: string | null;
  bodyText?: string | null;
}): boolean {
  if (input.code === "PRODUCTION_READ_DISABLED") return true;
  if (input.status === 503) {
    const text = `${input.code ?? ""} ${input.bodyText ?? ""}`;
    return /PRODUCTION_READ_DISABLED|detail.*not.*enabled/i.test(text);
  }
  return false;
}
