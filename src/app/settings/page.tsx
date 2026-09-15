"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { DeferredSurfaceState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";

/** Settings is deferred (PC-8 nav policy) — no safe config surface yet. */
export default function Page() {
  const { t } = useI18n();
  return (
    <AdminShell title={t("settings")}>
      <Breadcrumb items={[{ label: t("settings") }]} />
      <DeferredSurfaceState />
    </AdminShell>
  );
}
