"use client";

import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import {
  resolveAccountantDatePreset,
  type AccountantDatePreset,
} from "@/domain/ui/accountantDatePresets";
import { adminUi } from "@/components/ui/adminUi";
import { FilterField } from "@/components/ui/FilterBar";

type Props = {
  locale: FinanceLocale;
  value: AccountantDatePreset;
  onChange: (preset: AccountantDatePreset, range: { from: string; to: string } | null) => void;
  testId?: string;
};

const PRESETS: AccountantDatePreset[] = [
  "today",
  "last7",
  "this_month",
  "prev_month",
  "custom",
];

const LABEL_KEYS: Record<AccountantDatePreset, string> = {
  today: "reportToday",
  last7: "reportLast7Days",
  this_month: "reportThisMonth",
  prev_month: "reportPreviousMonth",
  custom: "reportCustomPeriod",
};

export function AccountantDatePresetSelect({
  locale,
  value,
  onChange,
  testId = "accountant-date-preset",
}: Props) {
  return (
    <FilterField label={presentFinanceTerm("period", locale)}>
      <select
        data-testid={testId}
        className={adminUi.filterControl}
        value={value}
        onChange={(e) => {
          const preset = e.target.value as AccountantDatePreset;
          onChange(preset, resolveAccountantDatePreset(preset));
        }}
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {presentFinanceTerm(LABEL_KEYS[p], locale)}
          </option>
        ))}
      </select>
    </FilterField>
  );
}
