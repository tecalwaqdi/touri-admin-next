"use client";

import type { ReactNode } from "react";

/**
 * Scoped LTR isolate for mixed-direction values inside RTL layouts
 * (email, UUID, phone, plate, URL, requestId, currency code, etc.).
 */
export function LtrIsolate({
  children,
  className,
  title,
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  as?: "span" | "code" | "div";
}) {
  return (
    <Tag dir="ltr" className={className} title={title} style={{ unicodeBidi: "isolate" }}>
      {children}
    </Tag>
  );
}
