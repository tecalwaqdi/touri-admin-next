"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { DetailNotEnabledState, ErrorState, LoadingState } from "@/components/states/QueryStates";
import { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
import { useI18n } from "@/i18n/I18nProvider";
import type { Driver } from "@/types/driver";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { ReportResult } from "@/application/reports/ReportService";
import { DriverWriteActions } from "@/features/drivers/DriverWriteActions";

export function DriverDetailPage({ driverId }: { driverId: string }) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [driver, setDriver] = useState<Driver | null>(null);
  const [earnings, setEarnings] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      setState("loading");
      try {
        const res = await apiFetch(`/api/drivers/${driverId}`);
        const body = await res.json().catch(() => ({}));
        if (
          isProductionDetailDisabledResponse({
            status: res.status,
            code: (body as { code?: string }).code,
            bodyText: JSON.stringify(body),
          })
        ) {
          setError(t("productionDetailNotEnabled"));
          setState("error");
          return;
        }
        if (!res.ok) throw new Error("Driver not found");
        const d = body as Driver;
        setDriver(d);
        const earnRes = await apiFetch(
          `/api/reports?type=driver_earnings_summary&countryId=${d.countryId}&currencyCode=${
            d.countryId === "SA"
              ? "SAR"
              : d.countryId === "AE"
                ? "AED"
                : d.countryId === "EG"
                  ? "EGP"
                  : d.countryId === "KW"
                    ? "KWD"
                    : "JOD"
          }&driverId=${driverId}`,
        );
        if (earnRes.ok) {
          setEarnings((await earnRes.json()) as ReportResult);
        }
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, t]);

  return (
    <AdminShell title={t("drivers")}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb
          items={[
            { href: "/drivers", label: t("drivers") },
            { label: driverId },
          ]}
        />
        <div
          data-testid="synthetic-badge"
          className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" && error === t("productionDetailNotEnabled") ? (
          <DetailNotEnabledState message={error} />
        ) : null}
        {state === "error" && error !== t("productionDetailNotEnabled") ? (
          <ErrorState message={error} />
        ) : null}
        {state === "success" && driver ? (
          <div data-testid="driver-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-slate-500">Name</dt>
                  <dd>{driver.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("registrationStatus")}</dt>
                  <dd data-testid="registration-status">{driver.registrationStatus}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("approvalStatus")}</dt>
                  <dd data-testid="approval-status">{driver.approvalStatus}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("availabilityStatus")}</dt>
                  <dd data-testid="availability-status">{driver.availabilityStatus}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("country")}</dt>
                  <dd>
                    {driver.countryId} / {driver.cityId}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">{t("agents")}</dt>
                  <dd>{driver.agentId ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Vehicle</dt>
                  <dd data-testid="driver-vehicle">{driver.vehiclePlate}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Documents</dt>
                  <dd data-testid="driver-docs">Synthetic docs: license + ID (placeholder)</dd>
                </div>
              </dl>
            </div>
            <DriverWriteActions
              driver={driver}
              onUpdated={(next) => {
                setDriver(next);
              }}
            />
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Synthetic earnings</h2>
              <p data-testid="driver-earnings">
                {earnings
                  ? `${earnings.rows.find((r) => r.id === driverId)?.amountMinor ?? "0"} ${earnings.currencyCode}`
                  : t("unavailable")}
              </p>
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
