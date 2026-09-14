"use client";

const TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-900",
  online: "bg-emerald-100 text-emerald-900",
  completed: "bg-emerald-100 text-emerald-900",
  settled: "bg-emerald-100 text-emerald-900",
  PASS: "bg-emerald-100 text-emerald-900",
  approved: "bg-emerald-100 text-emerald-900",
  pending: "bg-amber-100 text-amber-900",
  pending_review: "bg-amber-100 text-amber-900",
  draft: "bg-amber-100 text-amber-900",
  WARN: "bg-amber-100 text-amber-900",
  UNKNOWN: "bg-slate-200 text-slate-800",
  unknown: "bg-slate-200 text-slate-800",
  inactive: "bg-slate-200 text-slate-700",
  suspended: "bg-red-100 text-red-900",
  FAIL: "bg-red-100 text-red-900",
  cancelled: "bg-red-100 text-red-900",
  rejected: "bg-red-100 text-red-900",
  fail_multiple_active: "bg-red-100 text-red-900",
  pass: "bg-emerald-100 text-emerald-900",
};

export function StatusBadge({
  value,
  testId,
}: {
  value: string;
  testId?: string;
}) {
  const tone = TONE[value] ?? "bg-slate-100 text-slate-800";
  return (
    <span
      data-testid={testId ?? "status-badge"}
      className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {value}
    </span>
  );
}
