"use client";

import {
  ACCOUNTANT_CLASS_TERM_KEYS,
  type AccountantDataClass,
} from "@/domain/finance/reporting/AccountantDataClassification";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import { adminUi } from "@/components/ui/adminUi";
import { FilterField } from "@/components/ui/FilterBar";

const CLASSES: Array<AccountantDataClass | ""> = [
  "",
  "certified",
  "operational",
  "historical",
  "qa_test",
  "incomplete",
  "conflict",
  "uncertified",
];

type Props = {
  locale: FinanceLocale;
  value: AccountantDataClass | "";
  onChange: (v: AccountantDataClass | "") => void;
  testId?: string;
};

export function DataClassificationFilter({
  locale,
  value,
  onChange,
  testId = "data-classification-filter",
}: Props) {
  return (
    <FilterField label={presentFinanceTerm("dataClassification", locale)}>
      <select
        data-testid={testId}
        className={adminUi.filterControl}
        value={value}
        onChange={(e) => onChange(e.target.value as AccountantDataClass | "")}
      >
        <option value="">{presentFinanceTerm("all", locale)}</option>
        {CLASSES.filter(Boolean).map((c) => (
          <option key={c} value={c}>
            {presentFinanceTerm(ACCOUNTANT_CLASS_TERM_KEYS[c as AccountantDataClass], locale)}
          </option>
        ))}
      </select>
    </FilterField>
  );
}
