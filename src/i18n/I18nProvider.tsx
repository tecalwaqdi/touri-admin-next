"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
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
  const dir: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const value: I18nValue = {
    locale,
    dir,
    t: (key) => t(locale, key),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
