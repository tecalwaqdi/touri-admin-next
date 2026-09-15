"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { useI18n } from "@/i18n/I18nProvider";
import { SETTINGS_PRODUCT_POLICY } from "@/domain/product-contract/FinalProductSurfaceContract";

/**
 * Settings is intentionally not a product surface.
 * Direct URL documents NOT_APPLICABLE — no secrets/env/IAM exposure.
 */
export default function Page() {
  const { t } = useI18n();
  return (
    <AdminShell title={t("settings")}>
      <Breadcrumb items={[{ label: t("settings") }]} />
      <div
        data-testid="settings-not-applicable"
        className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"
      >
        <p className="font-medium">{t("notApplicableByProductContract")}</p>
        <p className="mt-2 text-slate-600">{SETTINGS_PRODUCT_POLICY.reason}</p>
      </div>
    </AdminShell>
  );
}
