"use client";

import { AdminShell } from "@/components/layout/AdminShell";
import { ComingSoonPage } from "@/components/ui/ComingSoonPage";
import { useI18n } from "@/i18n/I18nProvider";

export default function Page() {
  const { t } = useI18n();
  return (
    <AdminShell title={t("support")}>
      <ComingSoonPage titleKey="support" />
    </AdminShell>
  );
}
