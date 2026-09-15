"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/messages";
import { formatControlledWriteConfirm } from "@/domain/ui/formatControlledWriteConfirm";

type Props = {
  testIdPrefix: string;
  confirmTemplateKey: MessageKey;
  actionLabelKey: MessageKey;
  targetId: string;
  stateLabel: string;
  warningKey?: MessageKey;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  extra?: ReactNode;
};

/**
 * Shared AR/EN confirmation panel for controlled write actions.
 * UI visibility ≠ authorization — API gates remain authoritative.
 */
export function ControlledWriteConfirmPanel({
  testIdPrefix,
  confirmTemplateKey,
  actionLabelKey,
  targetId,
  stateLabel,
  warningKey,
  pending,
  onConfirm,
  onCancel,
  extra,
}: Props) {
  const { t } = useI18n();
  const body = formatControlledWriteConfirm(t(confirmTemplateKey), {
    action: t(actionLabelKey),
    id: targetId,
    state: stateLabel,
  });

  return (
    <div
      data-testid={`${testIdPrefix}-confirm`}
      className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm"
    >
      <p>{body}</p>
      {warningKey ? (
        <p className="mt-2 text-amber-800" data-testid={`${testIdPrefix}-confirm-warning`}>
          {t(warningKey)}
        </p>
      ) : null}
      {extra}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid={`${testIdPrefix}-confirm-yes`}
          disabled={pending}
          className="rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
          onClick={onConfirm}
        >
          {pending ? t("working") : t("confirm")}
        </button>
        <button
          type="button"
          data-testid={`${testIdPrefix}-confirm-no`}
          disabled={pending}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
          onClick={onCancel}
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
