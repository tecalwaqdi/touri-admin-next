/**
 * Shared date presets for accountant filters — presentation helpers only.
 */

export type AccountantDatePreset =
  | "today"
  | "last7"
  | "this_month"
  | "prev_month"
  | "custom";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveAccountantDatePreset(
  preset: AccountantDatePreset,
  now = new Date(),
): { from: string; to: string } | null {
  if (preset === "custom") return null;
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  if (preset === "today") {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (preset === "last7") {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    return { from: isoDate(start), to: isoDate(end) };
  }
  if (preset === "this_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: isoDate(start), to: isoDate(end) };
  }
  // prev_month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { from: isoDate(start), to: isoDate(last) };
}
