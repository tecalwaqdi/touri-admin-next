"use client";

import { useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";

export function DriverCreatePage() {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [displayName, setDisplayName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch("/api/drivers/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, phoneE164, countryId, regionId: regionId || null }),
      });
      const json = (await res.json()) as { error?: string; code?: string; driverId?: string };
      setMessage(json.error ?? json.code ?? (json.driverId ? `OK ${json.driverId}` : t("error")));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title={locale === "ar" ? "إنشاء سائق" : "Create driver"}>
      <PermissionGuard permission="drivers:approve">
        <Breadcrumb
          items={[
            { href: "/drivers", label: t("drivers") },
            { label: locale === "ar" ? "إنشاء" : "Create" },
          ]}
        />
        <p className="mb-3 text-sm text-slate-600">DRIVER_WRITE_ENABLED=false</p>
        <div className="mx-auto grid max-w-xl gap-3 rounded border bg-white p-4">
          <input className="rounded border px-2 py-1.5 text-sm" placeholder={locale === "ar" ? "الاسم" : "Name"} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className="rounded border px-2 py-1.5 text-sm" placeholder="phone E.164" value={phoneE164} onChange={(e) => setPhoneE164(e.target.value)} />
          <input className="rounded border px-2 py-1.5 text-sm" placeholder="countryId" value={countryId} onChange={(e) => setCountryId(e.target.value)} />
          <input className="rounded border px-2 py-1.5 text-sm" placeholder="regionId (optional)" value={regionId} onChange={(e) => setRegionId(e.target.value)} />
          <button type="button" disabled={busy} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => void submit()}>
            {locale === "ar" ? "إنشاء" : "Create"}
          </button>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </PermissionGuard>
    </AdminShell>
  );
}
