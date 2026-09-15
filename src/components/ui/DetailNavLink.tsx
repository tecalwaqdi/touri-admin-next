/**
 * List → detail navigation that does not falsely claim “not found”
 * when Production detail routes are not enabled yet (PC-2).
 */

"use client";

import Link from "next/link";
import { getClientAppEnv } from "@/lib/clientAppEnv";
import { useI18n } from "@/i18n/I18nProvider";

export { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";

/** Staging/Production list detail routes are deferred to PC-2. */
export function areProductionDetailRoutesEnabled(): boolean {
  return getClientAppEnv() === "development";
}

export function DetailNavLink(props: {
  href: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  const { t, locale } = useI18n();
  if (!areProductionDetailRoutesEnabled()) {
    return (
      <span
        data-testid={props.testId ?? "detail-link-disabled"}
        data-detail-enabled="false"
        title={
          locale === "ar"
            ? "التفاصيل ستُستكمل في المرحلة التالية"
            : "Details will be completed in the next phase"
        }
        className="cursor-not-allowed text-slate-400"
      >
        {props.children ?? t("details")}
        <span className="ms-1 text-xs">
          ({locale === "ar" ? "قريبًا" : "soon"})
        </span>
      </span>
    );
  }
  return (
    <Link
      data-testid={props.testId ?? "detail-link"}
      data-detail-enabled="true"
      className="text-emerald-700 underline"
      href={props.href}
    >
      {props.children ?? t("details")}
    </Link>
  );
}
