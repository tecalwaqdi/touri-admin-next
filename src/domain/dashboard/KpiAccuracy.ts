/**
 * Dashboard KPI accuracy metadata — never treat a bounded sample as an exact total.
 * incomplete = scan budget exhausted (do not show a partial number as total).
 */

export type KpiAccuracy =
  | "exact"
  | "bounded_sample"
  | "incomplete"
  | "unavailable";

export type DashboardOpsKpiKey =
  | "totalTrips"
  | "completedTrips"
  | "cancelledTrips"
  | "activeTrips"
  | "activeDrivers"
  | "customers"
  | "pendingDrivers"
  | "activeAgents"
  | "supportOpen"
  | "partners"
  | "guides"
  | "fleet"
  | "landmarks";

export type DashboardKpiMeta = {
  accuracy: KpiAccuracy;
  /** Present when accuracy is bounded_sample / incomplete. */
  sampleLimit?: number;
  truncated?: boolean;
  /** Sample window may include pilot/test records (not silently excluded). */
  includesPilotOrTest?: boolean;
};

export type DashboardKpiAccuracyMap = Record<DashboardOpsKpiKey, DashboardKpiMeta>;

export function boundedSampleKpiMeta(input: {
  sampleLimit: number;
  truncated?: boolean;
  includesPilotOrTest?: boolean;
}): DashboardKpiMeta {
  return {
    accuracy: "bounded_sample",
    sampleLimit: input.sampleLimit,
    truncated: input.truncated === true,
    includesPilotOrTest: input.includesPilotOrTest === true,
  };
}

export function incompleteKpiMeta(input?: {
  sampleLimit?: number;
}): DashboardKpiMeta {
  return {
    accuracy: "incomplete",
    sampleLimit: input?.sampleLimit,
    truncated: true,
  };
}

export function unavailableKpiMeta(): DashboardKpiMeta {
  return { accuracy: "unavailable" };
}

export function exactKpiMeta(): DashboardKpiMeta {
  return { accuracy: "exact" };
}

/** Operator-facing label for a KPI — never “Total” when sample. */
export function kpiAccuracyHint(
  meta: DashboardKpiMeta | undefined,
  locale: "en" | "ar",
): string | undefined {
  if (!meta) return undefined;
  if (meta.accuracy === "unavailable") {
    return locale === "ar" ? "غير متاح" : "Unavailable";
  }
  if (meta.accuracy === "incomplete") {
    return locale === "ar" ? "بيانات غير مكتملة" : "Incomplete data";
  }
  if (meta.accuracy === "bounded_sample") {
    const lim = meta.sampleLimit ?? 50;
    const base =
      locale === "ar" ? `عينة معروضة (≤${lim})` : `Displayed sample (≤${lim})`;
    if (meta.truncated) {
      return locale === "ar" ? `${base} · ${lim}+` : `${base} · ${lim}+`;
    }
    if (meta.includesPilotOrTest) {
      return locale === "ar"
        ? `${base} · يتضمن سجلات تجريبية/تجريبية تشغيلية`
        : `${base} · includes pilot/test records`;
    }
    return base;
  }
  return undefined;
}

export function assertNeverLabelsSampleAsExact(
  meta: DashboardKpiMeta,
  label: string,
): void {
  if (meta.accuracy === "bounded_sample") {
    const lower = label.toLowerCase();
    if (
      lower.includes("total ") ||
      lower.startsWith("total") ||
      lower.includes("إجمالي")
    ) {
      throw new Error(`KPI_LABEL_MISLEADING: sample labeled as total (${label})`);
    }
  }
}

/** Present operator-facing status tokens (never raw enum for incomplete/unavailable). */
export function presentKpiValue(
  value: number | null | undefined,
  meta: DashboardKpiMeta | undefined,
  locale: "en" | "ar",
  formatExact: (n: number) => string,
): string {
  if (meta?.accuracy === "unavailable" || value == null) {
    if (meta?.accuracy === "incomplete") {
      return locale === "ar" ? "بيانات غير مكتملة" : "Incomplete data";
    }
    return locale === "ar" ? "غير متاح" : "Unavailable";
  }
  if (meta?.accuracy === "incomplete") {
    return locale === "ar" ? "بيانات غير مكتملة" : "Incomplete data";
  }
  return formatExact(value);
}
