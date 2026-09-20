"use client";

import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { useApiFetch } from "@/lib/apiClient";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { allowedFromStatesForAction } from "@/application/controlled-writes/drivers/DriverStateMachine";
import type { Driver } from "@/types/driver";
import type { RegistrationStatus } from "@/types/driver";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { presentStatus } from "@/domain/presentation/statusPresentation";

type UiAction =
  | { kind: "approve"; label: MessageKey; api: "approve" }
  | { kind: "reactivate"; label: MessageKey; api: "approve" }
  | { kind: "reject"; label: MessageKey; api: "reject"; needsReason: true }
  | { kind: "needs_changes"; label: MessageKey; api: "needs_changes"; needsReason: true }
  | { kind: "suspend"; label: MessageKey; api: "suspend"; needsReason: true };

type FixField =
  | "national_id"
  | "vehicle_registration"
  | "driver_license"
  | "other";

const REJECT_CODES = [
  "missing_document",
  "invalid_document",
  "identity_mismatch",
  "vehicle_incomplete",
  "compliance_incomplete",
  "other",
] as const;

const CHANGES_CODES = [
  "missing_document",
  "invalid_document",
  "photo_quality",
  "vehicle_incomplete",
  "compliance_incomplete",
  "other",
] as const;

const SUSPEND_CODES = [
  "policy_violation",
  "safety",
  "compliance",
  "operational",
  "other",
] as const;

const FIX_FIELDS: FixField[] = [
  "national_id",
  "vehicle_registration",
  "driver_license",
  "other",
];

function legalActions(status: RegistrationStatus): UiAction[] {
  const out: UiAction[] = [];
  if (allowedFromStatesForAction("approve").includes(status)) {
    if (status === "suspended") {
      out.push({ kind: "reactivate", label: "reactivateAction", api: "approve" });
    } else {
      out.push({ kind: "approve", label: "approveAction", api: "approve" });
    }
  }
  if (allowedFromStatesForAction("reject").includes(status)) {
    out.push({
      kind: "reject",
      label: "rejectAction",
      api: "reject",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("needs_changes").includes(status)) {
    out.push({
      kind: "needs_changes",
      label: "requestChangesAction",
      api: "needs_changes",
      needsReason: true,
    });
  }
  if (allowedFromStatesForAction("suspend").includes(status)) {
    out.push({
      kind: "suspend",
      label: "suspendAction",
      api: "suspend",
      needsReason: true,
    });
  }
  return out;
}

function codesFor(api: string): readonly string[] {
  if (api === "reject") return REJECT_CODES;
  if (api === "needs_changes") return CHANGES_CODES;
  if (api === "suspend") return SUSPEND_CODES;
  return [];
}

function reasonLabel(code: string, locale: string): string {
  const ar: Record<string, string> = {
    missing_document: "مستند ناقص",
    invalid_document: "مستند غير صالح",
    identity_mismatch: "عدم تطابق الهوية",
    vehicle_incomplete: "بيانات المركبة غير مكتملة",
    compliance_incomplete: "الامتثال غير مكتمل",
    photo_quality: "جودة الصورة غير كافية",
    policy_violation: "مخالفة السياسة",
    safety: "سلامة",
    compliance: "امتثال",
    operational: "تشغيلي",
    other: "أخرى",
  };
  const en: Record<string, string> = {
    missing_document: "Missing document",
    invalid_document: "Invalid document",
    identity_mismatch: "Identity mismatch",
    vehicle_incomplete: "Incomplete vehicle data",
    compliance_incomplete: "Incomplete compliance",
    photo_quality: "Photo quality",
    policy_violation: "Policy violation",
    safety: "Safety",
    compliance: "Compliance",
    operational: "Operational",
    other: "Other",
  };
  return (locale === "ar" ? ar : en)[code] ?? code;
}

function fieldLabel(field: FixField, locale: string): string {
  const ar: Record<FixField, string> = {
    national_id: "الهوية الوطنية",
    vehicle_registration: "استمارة المركبة",
    driver_license: "رخصة القيادة",
    other: "أخرى",
  };
  const en: Record<FixField, string> = {
    national_id: "National ID",
    vehicle_registration: "Vehicle registration",
    driver_license: "Driver license",
    other: "Other",
  };
  return locale === "ar" ? ar[field] : en[field];
}

export function DriverWriteActions({
  driver,
  onUpdated,
  reviewVersion = null,
}: {
  driver: Driver;
  onUpdated: (next: Driver) => void;
  /** Stale-state protection for canonical review workflow when known. */
  reviewVersion?: number | null;
}) {
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirming, setConfirming] = useState<UiAction | null>(null);
  const [reasonCode, setReasonCode] = useState("missing_document");
  const [note, setNote] = useState("");
  const [fieldsToFix, setFieldsToFix] = useState<FixField[]>([]);
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      session.user
        ? hasPermission(session.user.permissions, "drivers:approve")
        : false,
    [session.user],
  );

  const actions = useMemo(
    () => legalActions(driver.registrationStatus),
    [driver.registrationStatus],
  );

  if (!isControlledWriteChromeEnabled()) return null;
  if (!canWrite) return null;

  if (actions.length === 0) {
    const emptyMessage =
      driver.registrationStatus === "draft"
        ? t("driverActionsUnavailableDraft")
        : t("driverActionsUnavailable");
    return (
      <div
        data-testid="driver-write-actions"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 className="mb-2 font-semibold">{t("driverActionsTitle")}</h2>
        <p
          data-testid="driver-actions-empty"
          className="text-sm text-slate-600"
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  const openConfirm = (action: UiAction) => {
    const codes = codesFor(action.api);
    setReasonCode(codes[0] ?? "other");
    setNote("");
    setFieldsToFix([]);
    setError(undefined);
    setConfirming(action);
  };

  const run = async (action: UiAction) => {
    if (inFlight.current || pending) return;
    if ("needsReason" in action && action.needsReason) {
      if (!reasonCode.trim()) {
        setError(t("reasonRequired"));
        return;
      }
      if (action.api !== "suspend" && note.trim().length < 3) {
        setError(t("reasonRequired"));
        return;
      }
      if (action.api === "needs_changes" && fieldsToFix.length === 0) {
        setError(t("fieldsToFixRequired"));
        return;
      }
    }
    inFlight.current = true;
    setPending(action.kind);
    setError(undefined);
    setSuccess(undefined);
    try {
      const body: Record<string, unknown> = {
        expectedCurrentState: driver.registrationStatus,
      };
      if ("needsReason" in action && action.needsReason) {
        body.reasonCode = reasonCode;
        body.note = note.trim().slice(0, 280);
        body.reason = note.trim().slice(0, 280);
      }
      if (action.api === "needs_changes") {
        body.fieldsToFix = fieldsToFix;
      }
      if (reviewVersion != null && Number.isFinite(reviewVersion)) {
        body.reviewVersion = reviewVersion;
      }
      const res = await apiFetch(`/api/drivers/${driver.id}/${action.api}`, {
        method: "POST",
        headers: {
          "idempotency-key": `ui-${action.kind}-${driver.id}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Driver & {
        error?: string;
        code?: string;
        write?: { toState?: string };
      };
      if (!res.ok) {
        setError(
          [json.code, json.error].filter(Boolean).join(": ") ||
            `Action ${action.label} failed`,
        );
        return;
      }
      onUpdated(json);
      const toState = json.write?.toState ?? json.registrationStatus;
      setSuccess(
        `${t("writeApplied")} → ${presentStatus(toState, locale)}`,
      );
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("requestFailed"));
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };

  return (
    <div
      data-testid="driver-write-actions"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <h2 className="mb-3 font-semibold">{t("driverActionsTitle")}</h2>
      <p className="mb-2 text-xs text-slate-500">
        {driver.registrationStatus === "pending_review"
          ? `${t("approveAction")} / ${t("rejectAction")} / ${t("requestChangesAction")}`
          : driver.registrationStatus === "suspended"
            ? t("reactivateAction")
            : driver.registrationStatus === "approved"
              ? t("suspendAction")
              : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.kind}
            type="button"
            data-testid={`driver-action-${action.kind}`}
            disabled={Boolean(pending)}
            className={
              action.kind === "approve" || action.kind === "reactivate"
                ? "rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                : action.kind === "reject" || action.kind === "suspend"
                  ? "rounded bg-rose-700 px-3 py-2 text-sm text-white disabled:opacity-50"
                  : "rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            }
            onClick={() => openConfirm(action)}
          >
            {pending === action.kind ? t("working") : t(action.label)}
          </button>
        ))}
      </div>

      {confirming ? (
        <ControlledWriteConfirmPanel
          testIdPrefix="driver-action"
          confirmTemplateKey="confirmDriverWrite"
          actionLabelKey={confirming.label}
          targetId={driver.id}
          stateLabel={presentStatus(driver.registrationStatus, locale)}
          pending={Boolean(pending)}
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
          extra={
            "needsReason" in confirming && confirming.needsReason ? (
              <div className="mt-3 space-y-2" data-testid="driver-action-reason-fields">
                <label className="block text-sm">
                  {t("reasonCode")}
                  <select
                    data-testid="driver-action-reason-code"
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                  >
                    {codesFor(confirming.api).map((code) => (
                      <option key={code} value={code}>
                        {reasonLabel(code, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {t("operatorNote")}
                  <textarea
                    data-testid="driver-action-note"
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                    rows={3}
                    maxLength={280}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      locale === "ar"
                        ? "سبب يظهر للسائق (مطلوب للرفض / طلب التعديلات)"
                        : "Reason shown to driver (required for reject / request changes)"
                    }
                  />
                </label>
                {confirming.api === "needs_changes" ? (
                  <fieldset data-testid="driver-action-fields-to-fix">
                    <legend className="text-sm font-medium">
                      {t("fieldsToFix")}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {FIX_FIELDS.map((field) => {
                        const checked = fieldsToFix.includes(field);
                        return (
                          <label
                            key={field}
                            className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setFieldsToFix((prev) =>
                                  checked
                                    ? prev.filter((f) => f !== field)
                                    : [...prev, field],
                                )
                              }
                            />
                            {fieldLabel(field, locale)}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : null}

      {error ? (
        <p data-testid="driver-action-error" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p data-testid="driver-action-success" className="mt-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}
    </div>
  );
}
