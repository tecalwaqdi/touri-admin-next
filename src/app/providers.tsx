"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/auth/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";

import { ProtectedRouteBoundary } from "@/components/guards/ProtectedRouteBoundary";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider><ProtectedRouteBoundary>{children}</ProtectedRouteBoundary></I18nProvider>
    </AuthProvider>
  );
}
