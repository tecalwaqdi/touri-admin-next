"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-testid="loading-state"
      className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600"
    >
      {label ?? t("loading")}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="empty-state"
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-600"
    >
      {message ?? t("empty")}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-testid="error-state"
      className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-red-800"
    >
      <p>{message ?? t("error")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded bg-red-700 px-4 py-2 text-sm text-white"
        >
          {t("retry")}
        </button>
      ) : null}
    </div>
  );
}

export function ForbiddenState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="forbidden-state"
      className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center text-amber-900"
    >
      {message ?? t("forbidden")}
    </div>
  );
}

export function OfflineState() {
  const { t } = useI18n();
  return (
    <div
      data-testid="offline-state"
      className="rounded-lg border border-slate-300 bg-slate-100 p-8 text-center text-slate-700"
    >
      {t("offline")}
    </div>
  );
}

/** Production source missing — distinct from empty and unexpected error. */
export function SourceNotConfiguredState({
  message,
}: {
  message?: string;
}) {
  const { t, locale } = useI18n();
  return (
    <div
      data-testid="source-not-configured-state"
      data-state="production_source_not_configured"
      className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center text-amber-950"
    >
      <p>
        {message ??
          (locale === "ar"
            ? t("productionSourceNotConfigured")
            : t("productionSourceNotConfigured"))}
      </p>
    </div>
  );
}

export function UnavailableState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="unavailable-state"
      data-state="unavailable"
      className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-700"
    >
      <p>{message ?? t("unavailable")}</p>
    </div>
  );
}

export function DataQualityState({ message }: { message?: string }) {
  const { locale } = useI18n();
  return (
    <div
      data-testid="data-quality-state"
      data-state="data_quality_issue"
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
    >
      {message ??
        (locale === "ar" ? "مشكلة في جودة البيانات" : "Data quality issue")}
    </div>
  );
}

/** Detail route not enabled in Production (PC-1 interim — not “not found”). */
export function DetailNotEnabledState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="detail-not-enabled-state"
      data-state="detail_not_enabled"
      className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-800"
    >
      <p>{message ?? t("productionDetailNotEnabled")}</p>
    </div>
  );
}

/** True 404 — canonical record does not exist. */
export function NotFoundState({ message }: { message?: string }) {
  const { locale } = useI18n();
  return (
    <div
      data-testid="not-found-state"
      data-state="not_found"
      className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-800"
    >
      <p>
        {message ??
          (locale === "ar" ? "السجل غير موجود" : "Record not found")}
      </p>
    </div>
  );
}
