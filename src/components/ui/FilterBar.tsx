"use client";

import type { ReactNode } from "react";
import { adminUi } from "@/components/ui/adminUi";

export function FilterBar({
  children,
  testId,
  hint,
}: {
  children: ReactNode;
  testId?: string;
  hint?: ReactNode;
}) {
  return (
    <div data-testid={testId ?? "filter-bar"} className={adminUi.filterBar}>
      {children}
      {hint ? <div className={`w-full ${adminUi.caption}`}>{hint}</div> : null}
    </div>
  );
}

export function FilterField({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  if (!label) return <>{children}</>;
  return (
    <label className={adminUi.filterLabel}>
      <span>{label}</span>
      {children}
    </label>
  );
}
