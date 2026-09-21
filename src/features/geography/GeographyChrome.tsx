"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import { adminUi } from "@/components/ui/adminUi";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";

export const GEOGRAPHY_SECTIONS = [
  { id: "countries", href: "/geography/countries", labelKey: "countries" as const },
  { id: "regions", href: "/geography/regions", labelKey: "regions" as const },
  { id: "cities", href: "/geography/cities", labelKey: "cities" as const },
  { id: "landmarks", href: "/geography/landmarks", labelKey: "landmarks" as const },
  {
    id: "data_quality",
    href: "/geography/data-quality",
    labelKey: "dataQuality" as const,
  },
] as const;

export function GeographyGateNotice() {
  const { t } = useI18n();
  return (
    <p
      data-testid="geography-gate-notice"
      className={
        isControlledWriteChromeEnabled()
          ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          : "rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
      }
    >
      {isControlledWriteChromeEnabled()
        ? t("geographyWritesEnabledNotice")
        : t("geographyReadOnlyNotice")}
    </p>
  );
}

export function GeographySubNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      data-testid="geography-tabs"
      aria-label={t("geography")}
      className="flex flex-wrap gap-2"
    >
      {GEOGRAPHY_SECTIONS.map((section) => {
        const active =
          pathname === section.href ||
          (section.href !== "/geography/data-quality" &&
            pathname.startsWith(`${section.href}/`));
        return (
          <Link
            key={section.id}
            href={section.href}
            data-testid={`geography-tab-${section.id}`}
            aria-current={active ? "page" : undefined}
            className={active ? adminUi.tabActive : adminUi.tabIdle}
          >
            {t(section.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function GeographyHierarchyHints({
  includeAgentHint = false,
  includeRegionNote = false,
}: {
  includeAgentHint?: boolean;
  includeRegionNote?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <p className={adminUi.secondaryText}>{t("hierarchyHint")}</p>
      {includeAgentHint ? (
        <p className={adminUi.secondaryText}>{t("oneCountryOneAgentHint")}</p>
      ) : null}
      {includeRegionNote ? (
        <p className={adminUi.secondaryText}>{t("regionOptionalNote")}</p>
      ) : null}
    </>
  );
}
