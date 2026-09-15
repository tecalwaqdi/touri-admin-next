"use client";

import { useState, type ReactNode } from "react";
import { adminUi } from "@/components/ui/adminUi";

/** Collapsible technical payload — closed by default (audit JSON, diagnostics). */
export function DisclosureBlock({
  summary,
  children,
  testId,
  defaultOpen = false,
}: {
  summary: string;
  children: ReactNode;
  testId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div data-testid={testId} className="rounded-md border border-slate-200">
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm font-medium text-slate-800 ${adminUi.btnGhost}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{summary}</span>
        <span aria-hidden className="text-slate-400">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-slate-200 bg-slate-50 p-3">{children}</div>
      ) : null}
    </div>
  );
}
