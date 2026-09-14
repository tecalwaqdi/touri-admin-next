"use client";

import { createContext, useContext, type ReactNode } from "react";
import { t, type Locale, type MessageKey } from "@/i18n/messages";
import { useAuth } from "@/auth/AuthContext";

type I18nValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (key: MessageKey) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const locale: Locale = session.user?.locale ?? "en";
  const value: I18nValue = {
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
    t: (key) => t(locale, key),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
