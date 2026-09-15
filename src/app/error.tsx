"use client";

import { useEffect } from "react";
import { sanitizeErrorMessage } from "@/infrastructure/logging/logger";
import { useI18n } from "@/i18n/I18nProvider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, dir, locale } = useI18n();
  useEffect(() => {
    console.error(sanitizeErrorMessage(error));
  }, [error]);

  return (
    <div
      data-testid="route-error"
      className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      dir={dir}
      lang={locale}
      role="alert"
    >
      <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">{t("unexpectedError")}</h2>
        <p className="mt-2 text-sm text-slate-600">{sanitizeErrorMessage(error)}</p>
        <button
          type="button"
          className="mt-4 rounded bg-slate-900 px-4 py-2 text-sm text-white"
          onClick={reset}
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
