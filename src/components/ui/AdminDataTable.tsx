"use client";

import type { ReactNode } from "react";
import { adminUi } from "@/components/ui/adminUi";

/**
 * Shared table shell: readable desktop density + controlled horizontal scroll
 * on narrow viewports (no shrink-all / no 8-col phone tables).
 */
export function AdminDataTable({
  children,
  testId,
  dense = false,
  footer,
}: {
  children: ReactNode;
  testId?: string;
  dense?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div data-testid={testId} className={adminUi.tableShell}>
      <div className={adminUi.tableScroll}>
        <table className={dense ? adminUi.tableDense : adminUi.table}>
          {children}
        </table>
      </div>
      {footer}
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return <thead className={adminUi.thead}>{children}</thead>;
}

export function AdminTh({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={`${adminUi.th} ${className}`.trim()}>{children}</th>;
}

export function AdminTd({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`${adminUi.td} ${className}`.trim()} title={title}>
      {children}
    </td>
  );
}

export function AdminTr({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      className={`${adminUi.tr} ${onClick ? "cursor-pointer" : ""} ${className}`.trim()}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}
