/**
 * Dashboard period presets — shared scope for ops + finance KPIs.
 */

export type DashboardPeriodPreset =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "this_month"
  | "custom"
  | "all";

export type DashboardPeriodRange = {
  preset: DashboardPeriodPreset;
  fromUtc?: string;
  toUtc?: string;
};

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** Resolve preset → inclusive UTC ISO bounds (omit both for “all”). */
export function resolveDashboardPeriod(
  preset: DashboardPeriodPreset,
  custom?: { fromUtc?: string; toUtc?: string },
  now: Date = new Date(),
): DashboardPeriodRange {
  if (preset === "all") {
    return { preset: "all" };
  }
  if (preset === "custom") {
    return {
      preset: "custom",
      fromUtc: custom?.fromUtc,
      toUtc: custom?.toUtc,
    };
  }

  const end = endOfUtcDay(now);
  if (preset === "today") {
    return {
      preset,
      fromUtc: startOfUtcDay(now).toISOString(),
      toUtc: end.toISOString(),
    };
  }
  if (preset === "this_month") {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return {
      preset,
      fromUtc: from.toISOString(),
      toUtc: end.toISOString(),
    };
  }
  const days = preset === "last_7_days" ? 7 : 30;
  const from = startOfUtcDay(
    new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
  );
  return {
    preset,
    fromUtc: from.toISOString(),
    toUtc: end.toISOString(),
  };
}
