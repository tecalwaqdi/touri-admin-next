"use client";

import { useI18n } from "@/i18n/I18nProvider";

export default function NotFound() {
  const { t, dir, locale } = useI18n();
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-slate-50"
      dir={dir}
      lang={locale}
    >
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold">
          <span dir="ltr">404</span>
        </h1>
        <p className="mt-2 text-slate-600">{t("pageNotFound")}</p>
      </div>
    </div>
  );
}
