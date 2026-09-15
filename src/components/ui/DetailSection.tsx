"use client";

import type { ReactNode } from "react";
import { adminUi } from "@/components/ui/adminUi";

export function DetailSection({
  children,
  testId,
  title,
}: {
  children: ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <section data-testid={testId} className={adminUi.cardPad}>
      {title ? <h2 className={`mb-3 ${adminUi.sectionTitle}`}>{title}</h2> : null}
      <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

export function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className={adminUi.caption}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function SectionTabs({
  items,
  active,
  onChange,
  testIdPrefix = "tab",
  listTestId,
}: {
  items: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
  testIdPrefix?: string;
  listTestId?: string;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-2"
      data-testid={listTestId ?? `${testIdPrefix}-list`}
    >
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`${testIdPrefix}-${item.id}`}
            className={selected ? adminUi.tabActive : adminUi.tabIdle}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
