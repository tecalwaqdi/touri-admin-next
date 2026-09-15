"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { DeferredSurfaceState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";

/** Support is deferred (PC-8 nav policy) — not product-ready. */
export default function Page() {
  const { t } = useI18n();
  return (
    <AdminShell title={t("support")}>
      <Breadcrumb items={[{ label: t("support") }]} />
      <DeferredSurfaceState />
    </AdminShell>
  );
}
