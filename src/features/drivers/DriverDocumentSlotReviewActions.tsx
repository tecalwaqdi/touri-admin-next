"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import {
  legalDocumentReviewActions,
  normalizeDocumentSlotReviewStatus,
  type DriverDocumentReviewAction,
} from "@/domain/driver/DriverDocumentReview";
import { createIdempotencyKey } from "@/lib/ids";

type Props = {
  driverId: string;
  slot: string;
  presence: "present" | "missing" | "unknown";
  reviewStatus: string | null;
  documentVersion: number | null;
  registrationStatus: string | null;
  onUpdated: (next: {
    slot: string;
    reviewStatus: string;
    documentVersion: number;
  }) => void;
};

const ACTION_LABEL: Record<
  DriverDocumentReviewAction,
  "approveAction" | "rejectAction" | "requestChangesAction"
> = {
  approve: "approveAction",
  reject: "rejectAction",
  needs_changes: "requestChangesAction",
};

export function DriverDocumentSlotReviewActions({
  driverId,
  slot,
  presence,
  reviewStatus,
  documentVersion,
  registrationStatus,
  onUpdated,
}: Props) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [confirming, setConfirming] = useState<DriverDocumentReviewAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const canWrite =
    !!session.user &&
    hasPermission(session.user.permissions, "drivers:approve") &&
    isControlledWriteChromeEnabled();

  const actions = canWrite
    ? legalDocumentReviewActions({
        presence,
        reviewStatus,
        registrationStatus,
      })
    : [];

  if (!canWrite || actions.length === 0) return null;

  const run = async (action: DriverDocumentReviewAction) => {
    if (inFlight.current) return;
    if (action !== "approve" && reason.trim().length < 3) {
      setError(t("reasonRequired"));
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    try {
      const res = await apiFetch(
        `/api/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(slot)}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(
              `doc-${action}-${driverId}-${slot}`,
            ),
          },
          body: JSON.stringify({
            expectedDocumentVersion: documentVersion ?? 1,
            reason: reason.trim(),
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
        reviewStatus?: string;
        documentVersion?: number;
      };
      if (!res.ok) {
        setError(json.error ?? json.code ?? t("error"));
        return;
      }
      onUpdated({
        slot,
        reviewStatus:
          normalizeDocumentSlotReviewStatus(json.reviewStatus) ??
          (action === "approve"
            ? "approved"
            : action === "reject"
              ? "rejected"
              : "needs_changes"),
        documentVersion:
          typeof json.documentVersion === "number"
            ? json.documentVersion
            : (documentVersion ?? 1) + 1,
      });
      setConfirming(null);
      setReason("");
    } catch {
      setError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div
      className="mt-2 space-y-2"
      data-testid={`driver-doc-review-${slot}`}
    >
      <div className="flex flex-wrap gap-1">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            data-testid={`driver-doc-${action}-${slot}`}
            className={
              action === "approve"
                ? "rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                : action === "reject"
                  ? "rounded bg-rose-700 px-2 py-1 text-xs text-white disabled:opacity-50"
                  : "rounded bg-amber-600 px-2 py-1 text-xs text-white disabled:opacity-50"
            }
            disabled={pending}
            onClick={() => {
              setConfirming(action);
              setError(undefined);
            }}
          >
            {t(ACTION_LABEL[action])}
          </button>
        ))}
      </div>
      {confirming ? (
        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-2">
          {confirming !== "approve" ? (
            <label className="block text-xs text-slate-600">
              {t("reasonRequired")}
              <textarea
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid={`driver-doc-reason-${slot}`}
              />
            </label>
          ) : null}
          <ControlledWriteConfirmPanel
            testIdPrefix={`driver-doc-${confirming}-${slot}`}
            confirmTemplateKey="confirmAgentWrite"
            actionLabelKey={ACTION_LABEL[confirming]}
            targetId={`${slot} · ${driverId.slice(0, 8)}`}
            stateLabel={
              normalizeDocumentSlotReviewStatus(reviewStatus) ??
              (locale === "ar" ? "قيد المراجعة" : "pending")
            }
            pending={pending}
            onConfirm={() => void run(confirming)}
            onCancel={() => {
              setConfirming(null);
              setReason("");
            }}
          />
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
