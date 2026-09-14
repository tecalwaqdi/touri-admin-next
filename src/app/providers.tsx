"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/auth/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <I18nProvider>{children}</I18nProvider>
    </AuthProvider>
  );
}
