"use client";

import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { useI18n } from "@/i18n/I18nProvider";
import { adminUi } from "@/components/ui/adminUi";
import {
  GeographyGateNotice,
  GeographyHierarchyHints,
  GeographySubNav,
  GEOGRAPHY_SECTIONS,
} from "@/features/geography/GeographyChrome";

/**
 * Geography hub — dedicated section entry points (not a cramped tabbed form+table).
 */
export function GeographyPage() {
  const { t } = useI18n();

  const cards = [
    {
      href: "/geography/countries",
      title: t("countries"),
      body: t("geographySectionCountries"),
    },
    {
      href: "/geography/regions",
      title: t("regions"),
      body: t("geographySectionRegions"),
    },
    {
      href: "/geography/cities",
      title: t("cities"),
      body: t("geographySectionCities"),
    },
    {
      href: "/geography/landmarks",
      title: t("landmarks"),
      body: t("geographySectionLandmarks"),
    },
    {
      href: "/geography/data-quality",
      title: t("dataQuality"),
      body: t("geographySectionDq"),
    },
  ] as const;

  return (
    <AdminShell title={t("geography")}>
      <Breadcrumb items={[{ label: t("geography") }]} />
      <GeographyHierarchyHints includeAgentHint />
      <GeographyGateNotice />
      <GeographySubNav />
      <section className="space-y-3" data-testid="geography-hub">
        <h2 className={adminUi.sectionTitle}>{t("geographyHubTitle")}</h2>
        <p className={adminUi.secondaryText}>{t("geographyHubHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`${adminUi.cardPad} block transition hover:border-slate-300 hover:shadow`}
            >
              <div className="font-semibold text-slate-900">{card.title}</div>
              <p className={`mt-1 ${adminUi.secondaryText}`}>{card.body}</p>
            </Link>
          ))}
        </div>
        <p className={adminUi.caption}>
          {GEOGRAPHY_SECTIONS.map((s) => t(s.labelKey)).join(" · ")}
        </p>
      </section>
    </AdminShell>
  );
}
