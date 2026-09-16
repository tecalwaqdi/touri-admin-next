"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGuard } from "./AuthGuard";
/** Mount page hooks only after Firebase persistence and server authorization finish. */
export function ProtectedRouteBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return <AuthGuard>{children}</AuthGuard>;
}
