"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { canAdminCancelTripLifecycle } from "@/domain/trip/TripCancelPolicy";
import type { TripLifecycleStatus } from "@/domain/trip/TripLifecycleStatus";
import type { TripCancelReasonCode } from "@/application/controlled-writes/trips/TripWriteTypes";
import { adminUi } from "@/components/ui/adminUi";

const REASON_OPTIONS: Array<{ value: TripCancelReasonCode; ar: string; en: string }> = [
  { value: "operational", ar: "تشغيلي", en: "Operational" },
  { value: "customer_request", ar: "طلب العميل", en: "Customer request" },
  { value: "safety", ar: "سلامة", en: "Safety" },
  { value: "no_driver", ar: "لا يوجد سائق", en: "No driver" },
  { value: "payment_issue", ar: "مشكلة دفع", en: "Payment issue" },
  { value: "other", ar: "أخرى", en: "Other" },
];

export function TripCancelActions({
  tripId,
  lifecycleStatus,
  onCancelled,
}: {
  tripId: string;
  lifecycleStatus: string | null;
  onCancelled: () => void;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reasonCode, setReasonCode] =
    useState<TripCancelReasonCode>("operational");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "trips:manage")
        : false,
    [session.user],
  );

  const cancellable = canAdminCancelTripLifecycle(
    lifecycleStatus as TripLifecycleStatus,
  );

  if (!canWrite) return null;
  if (!isControlledWriteChromeEnabled()) return null;
  if (!cancellable) {
    return (
      <div
        data-testid="trip-cancel-actions"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-1 font-semibold">
          {locale === "ar" ? "إلغاء الرحلة" : "Cancel trip"}
        </h2>
        <p className="text-sm text-slate-600">
          {locale === "ar"
            ? "لا يمكن إلغاء هذه الرحلة — الحالة نهائية أو غير مؤهلة."
            : "This trip cannot be cancelled — terminal or ineligible status."}
        </p>
      </div>
    );
  }

  const run = async () => {
    if (inFlight.current || pending || !lifecycleStatus) return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/cancel`, {
        method: "POST",
        headers: {
          "idempotency-key": `ui-trip-cancel-${tripId}-${Date.now()}`,
        },
        body: JSON.stringify({
          expectedLifecycleStatus: lifecycleStatus,
          reasonCode,
          note: note.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        code?: string;
        toLifecycle?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        setError(
          [json.code, json.error].filter(Boolean).join(": ") ||
            t("requestFailed"),
        );
        return;
      }
      setSuccess(
        locale === "ar"
          ? "تم إلغاء الرحلة بنجاح"
          : "Trip cancelled successfully",
      );
      setConfirming(false);
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("requestFailed"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div
      data-testid="trip-cancel-actions"
      className="rounded-lg border border-rose-200 bg-rose-50/40 p-4"
    >
      <h2 className="mb-2 font-semibold">
        {locale === "ar" ? "إلغاء الرحلة" : "Cancel trip"}
      </h2>
      <p className="mb-3 text-xs text-slate-600">
        {locale === "ar"
          ? "يلغي الحجز من الإدارة ويفتح المجال للعميل لطلب رحلة جديدة."
          : "Marks the booking cancelled by admin so the customer can book again."}
      </p>
      <label className="mb-2 block text-sm text-slate-700">
        {locale === "ar" ? "سبب الإلغاء" : "Cancel reason"}
        <select
          className={`${adminUi.filterControl} mt-1 w-full max-w-xs`}
          value={reasonCode}
          data-testid="trip-cancel-reason"
          onChange={(e) =>
            setReasonCode(e.target.value as TripCancelReasonCode)
          }
        >
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {locale === "ar" ? o.ar : o.en}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 block text-sm text-slate-700">
        {locale === "ar" ? "ملاحظة (اختياري)" : "Note (optional)"}
        <input
          className={`${adminUi.filterControl} mt-1 w-full max-w-md`}
          value={note}
          maxLength={280}
          data-testid="trip-cancel-note"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        type="button"
        data-testid="trip-cancel-open"
        disabled={pending}
        className="rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => setConfirming(true)}
      >
        {pending
          ? t("working")
          : locale === "ar"
            ? "إلغاء الرحلة"
            : "Cancel trip"}
      </button>

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="trip-cancel"
          confirmTemplateKey="confirmTripCancel"
          actionLabelKey="cancelTripAction"
          targetId={tripId}
          stateLabel={lifecycleStatus ?? "—"}
          pending={pending}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      {error ? (
        <p
          data-testid="trip-cancel-error"
          className="mt-2 text-sm text-rose-700"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          data-testid="trip-cancel-success"
          className="mt-2 text-sm text-emerald-800"
        >
          {success}
        </p>
      ) : null}
    </div>
  );
}
