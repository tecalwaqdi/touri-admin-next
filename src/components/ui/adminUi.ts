/**
 * Shared Admin Next presentation tokens (PC-8).
 * Reuse these class strings instead of per-page arbitrary spacing.
 */

export const adminUi = {
  pageWidth: "mx-auto w-full max-w-[1440px]",
  pageStack: "space-y-4",
  card: "rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm",
  cardPad: "rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:p-5",
  filterBar:
    "mb-0 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4",
  filterControl:
    "h-9 min-w-[8rem] max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
  filterLabel: "flex flex-col gap-1 text-xs font-medium text-slate-600",
  btnPrimary:
    "inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
  btnSecondary:
    "inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
  btnGhost:
    "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
  tableShell:
    "overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm",
  /** Controlled horizontal scroll — never shrink an 8-col table onto a phone. */
  tableScroll: "overflow-x-auto overscroll-x-contain",
  table: "min-w-[56rem] w-full border-collapse text-sm",
  tableDense: "min-w-[44rem] w-full border-collapse text-sm",
  thead: "bg-slate-50 text-start",
  th: "px-3 py-2.5 text-start text-xs font-semibold uppercase tracking-wide text-slate-500",
  td: "px-3 py-2.5 text-start align-middle text-sm text-slate-800",
  tr: "border-t border-slate-100 transition hover:bg-slate-50/90",
  truncate: "max-w-[12rem] truncate",
  monoId: "font-mono text-xs text-slate-600 tabular-nums tracking-tight",
  sectionTitle: "text-base font-semibold tracking-tight text-slate-900",
  secondaryText: "text-sm text-slate-600",
  caption: "text-xs text-slate-500",
  tabActive: "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white",
  tabIdle:
    "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
  badge:
    "inline-flex max-w-full items-center rounded px-2 py-0.5 text-xs font-semibold leading-tight",
  link: "font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:text-[var(--brand)] hover:decoration-[var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]",
} as const;
