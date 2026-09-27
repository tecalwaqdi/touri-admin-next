"use client";

import {
  ACCOUNTANT_CLASS_TERM_KEYS,
  type AccountantDataClass,
} from "@/domain/finance/reporting/AccountantDataClassification";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";

const TONE: Record<AccountantDataClass, string> = {
  certified: "bg-emerald-100 text-emerald-900 border-emerald-200",
  operational: "bg-sky-100 text-sky-900 border-sky-200",
  historical: "bg-amber-100 text-amber-950 border-amber-200",
  qa_test: "bg-violet-100 text-violet-900 border-violet-200",
  incomplete: "bg-orange-100 text-orange-950 border-orange-200",
  conflict: "bg-rose-100 text-rose-900 border-rose-200",
  uncertified: "bg-slate-100 text-slate-800 border-slate-200",
};

type Props = {
  dataClass: AccountantDataClass;
  locale: FinanceLocale;
  className?: string;
  title?: string;
};

export function ClassificationBadge({
  dataClass,
  locale,
  className = "",
  title,
}: Props) {
  const label = presentFinanceTerm(
    ACCOUNTANT_CLASS_TERM_KEYS[dataClass],
    locale,
  );
  return (
    <span
      data-testid={`class-badge-${dataClass}`}
      title={title ?? label}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONE[dataClass]} ${className}`}
    >
      {label}
    </span>
  );
}
