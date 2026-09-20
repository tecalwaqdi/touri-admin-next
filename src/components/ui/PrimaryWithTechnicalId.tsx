"use client";

import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { adminUi } from "@/components/ui/adminUi";
import { useI18n } from "@/i18n/I18nProvider";

/**
 * Primary human label with optional secondary technical id.
 * Never invents a primary from the id alone when primary is null —
 * caller passes unavailable/missing text as primary when needed.
 */
export function PrimaryWithTechnicalId({
  primary,
  technicalId,
  emptyLabel,
  testId,
}: {
  primary: string | null | undefined;
  technicalId?: string | null;
  emptyLabel: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const hasPrimary = Boolean(primary?.trim());
  const hasTech = Boolean(technicalId?.trim());

  return (
    <span data-testid={testId} className="inline-flex min-w-0 flex-col gap-0.5">
      <span className={!hasPrimary ? "text-slate-400" : undefined}>
        {hasPrimary ? primary : emptyLabel}
      </span>
      {hasTech ? (
        <span
          className={`${adminUi.monoId} text-[11px] text-slate-500`}
          title={`${t("technicalId")}: ${technicalId}`}
        >
          <LtrIsolate>{technicalId}</LtrIsolate>
        </span>
      ) : null}
    </span>
  );
}
