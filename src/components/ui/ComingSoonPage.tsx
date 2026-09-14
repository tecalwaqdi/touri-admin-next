"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { Breadcrumb } from "@/components/layout/Breadcrumb";

export function ComingSoonPage({ titleKey }: { titleKey: "customers" | "settlements" | "reports" | "users" | "audit" | "settings" | "geography" | "support" }) {
  const { t } = useI18n();
  return (
    <>
      <Breadcrumb items={[{ label: t(titleKey) }]} />
      <div
        data-testid="coming-soon"
        className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-600"
      >
        <p className="text-lg font-medium">{t(titleKey)}</p>
        <p className="mt-2">{t("comingSoon")}</p>
      </div>
    </>
  );
}
