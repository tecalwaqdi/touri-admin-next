"use client";

import { useI18n } from "@/i18n/I18nProvider";
import {
  presentStatus,
  type StatusLocale,
} from "@/domain/presentation/statusPresentation";

const TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-900",
  online: "bg-emerald-100 text-emerald-900",
  completed: "bg-emerald-100 text-emerald-900",
  settled: "bg-emerald-100 text-emerald-900",
  PASS: "bg-emerald-100 text-emerald-900",
  approved: "bg-emerald-100 text-emerald-900",
  locked: "bg-emerald-100 text-emerald-900",
  enabled: "bg-emerald-100 text-emerald-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  pending: "bg-amber-100 text-amber-900",
  pending_review: "bg-amber-100 text-amber-900",
  draft: "bg-amber-100 text-amber-900",
  partially_paid: "bg-amber-100 text-amber-900",
  disputed: "bg-amber-100 text-amber-900",
  WARN: "bg-amber-100 text-amber-900",
  UNKNOWN: "bg-slate-200 text-slate-800",
  unknown: "bg-slate-200 text-slate-800",
  unavailable: "bg-slate-200 text-slate-800",
  inactive: "bg-slate-200 text-slate-700",
  disabled: "bg-slate-200 text-slate-700",
  offline: "bg-slate-200 text-slate-700",
  voided: "bg-slate-200 text-slate-700",
  void: "bg-slate-200 text-slate-700",
  reversed: "bg-slate-200 text-slate-700",
  suspended: "bg-red-100 text-red-900",
  FAIL: "bg-red-100 text-red-900",
  cancelled: "bg-red-100 text-red-900",
  rejected: "bg-red-100 text-red-900",
  needs_changes: "bg-amber-100 text-amber-900",
  fail_multiple_active: "bg-red-100 text-red-900",
  no_active_agent: "bg-amber-100 text-amber-900",
  pass: "bg-emerald-100 text-emerald-900",
  present: "bg-emerald-100 text-emerald-900",
  missing: "bg-amber-100 text-amber-900",
  INFO: "bg-slate-100 text-slate-800",
  WARNING: "bg-amber-100 text-amber-900",
  ERROR: "bg-orange-100 text-orange-900",
  INVARIANT_VIOLATION: "bg-red-100 text-red-900",
  NO_ACTIVE_AGENT: "bg-amber-100 text-amber-900",
  VIOLATION: "bg-red-100 text-red-900",
  DATA_QUALITY_WARNING: "bg-amber-100 text-amber-900",
  busy: "bg-amber-100 text-amber-900",
};

export function StatusBadge({
  value,
  testId,
}: {
  value: string;
  testId?: string;
}) {
  const { locale } = useI18n();
  const domain = typeof value === "string" ? value : String(value ?? "unknown");
  const tone =
    TONE[domain] ??
    (domain.startsWith("cancelled") ? TONE.cancelled : "bg-slate-100 text-slate-800");
  const label = presentStatus(domain, locale as StatusLocale);
  return (
    <span
      data-testid={testId ?? "status-badge"}
      data-status-domain={value}
      title={domain}
      className={`inline-flex max-w-[12rem] truncate rounded px-2 py-0.5 text-xs font-semibold leading-tight ${tone}`}
    >
      {label}
    </span>
  );
}
