/**
 * List → detail navigation.
 * PC-2: enable DetailNavLink per resource only when Production detail GET is wired.
 */

"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import {
  areProductionDetailRoutesEnabled,
  isProductionDetailResourceEnabled,
  type DetailNavResource,
} from "@/domain/presentation/detailNavResources";

export { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
export {
  areProductionDetailRoutesEnabled,
  isProductionDetailResourceEnabled,
  PRODUCTION_DETAIL_RESOURCE_ENABLED,
  type DetailNavResource,
} from "@/domain/presentation/detailNavResources";

export function DetailNavLink(props: {
  href: string;
  resource: DetailNavResource;
  children?: React.ReactNode;
  testId?: string;
}) {
  const { t, locale } = useI18n();
  if (!isProductionDetailResourceEnabled(props.resource)) {
    return (
      <span
        data-testid={props.testId ?? "detail-link-disabled"}
        data-detail-enabled="false"
        data-detail-resource={props.resource}
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
      data-detail-resource={props.resource}
      className="text-emerald-700 underline"
      href={props.href}
    >
      {props.children ?? t("details")}
    </Link>
  );
}

// Keep symbol referenced for tree/tests that import from this module.
void areProductionDetailRoutesEnabled;
