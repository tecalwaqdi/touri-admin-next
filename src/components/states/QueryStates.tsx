"use client";

import { useI18n } from "@/i18n/I18nProvider";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-state"
      className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600"
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
      data-state="empty"
      className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600"
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
      data-state="error"
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-900"
    >
      <p className="font-medium">{t("unexpectedError")}</p>
      <p className="mt-1 text-red-800">{message ?? t("error")}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-9 items-center rounded-md bg-red-800 px-4 text-sm font-medium text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
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
      data-state="forbidden"
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-8 text-center text-sm text-amber-950"
    >
      <p className="font-medium">{t("forbidden")}</p>
      {message && message !== t("forbidden") ? (
        <p className="mt-1">{message}</p>
      ) : null}
    </div>
  );
}

export function OfflineState() {
  const { t } = useI18n();
  return (
    <div
      data-testid="offline-state"
      data-state="offline"
      className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-8 text-center text-sm text-slate-700"
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
  const { t } = useI18n();
  return (
    <div
      data-testid="source-not-configured-state"
      data-state="production_source_not_configured"
      className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-8 text-center text-sm text-sky-950"
    >
      <p className="font-medium">{t("productionSourceNotConfigured")}</p>
      {message && message !== t("productionSourceNotConfigured") ? (
        <p className="mt-1">{message}</p>
      ) : null}
    </div>
  );
}

export function UnavailableState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="unavailable-state"
      data-state="unavailable"
      className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-8 text-center text-sm text-slate-800"
    >
      <p className="font-medium">{t("unavailable")}</p>
      {message && message !== t("unavailable") ? (
        <p className="mt-1 text-slate-700">{message}</p>
      ) : null}
    </div>
  );
}

/** Finance incomplete — distinct from empty and unavailable. */
export function IncompleteState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="incomplete-state"
      data-state="incomplete"
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center text-sm text-amber-950"
    >
      <p className="font-medium">{t("financialIncomplete")}</p>
      {message && message !== t("financialIncomplete") ? (
        <p className="mt-1">{message}</p>
      ) : null}
    </div>
  );
}

export function DataQualityState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="data-quality-state"
      data-state="data_quality_issue"
      className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
    >
      {message ?? t("dataQualityIssue")}
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
      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-800"
    >
      <p>{message ?? t("productionDetailNotEnabled")}</p>
    </div>
  );
}

/** True 404 — canonical record does not exist. */
export function NotFoundState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="not-found-state"
      data-state="not_found"
      className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-800"
    >
      <p className="font-medium">{t("recordNotFound")}</p>
      {message && message !== t("recordNotFound") ? (
        <p className="mt-1 text-slate-600">{message}</p>
      ) : null}
    </div>
  );
}

/** Intentionally deferred product surface (Support/Settings). */
export function DeferredSurfaceState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-testid="deferred-surface-state"
      data-state="deferred"
      className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-700"
    >
      <p>{message ?? t("surfaceDeferred")}</p>
    </div>
  );
}
