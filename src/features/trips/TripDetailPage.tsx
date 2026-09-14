"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import { ErrorState, LoadingState } from "@/components/states/QueryStates";
import { useI18n } from "@/i18n/I18nProvider";
import type { Trip } from "@/types/trip";
import type { FinancialTripDto } from "@/domain/finance/serializeFinancialTrip";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";

type TripDetailResponse = {
  trip: Trip;
  financial: FinancialTripDto;
  sections: string[];
};

export function TripDetailPage({ tripId }: { tripId: string }) {
  const { t } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<QueryState>("idle");
  const [data, setData] = useState<TripDetailResponse | null>(null);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState<string>();

  useEffect(() => {
    const load = async () => {
      setState("loading");
      try {
        const res = await apiFetch(`/api/trips/${tripId}`);
        if (!res.ok) throw new Error("Trip not found");
        setData((await res.json()) as TripDetailResponse);
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
  }, [apiFetch, tripId, t]);

  const trip = data?.trip;
  const financial = data?.financial;

  return (
    <AdminShell title={t("trips")}>
      <PermissionGuard permission="trips:read">
        <Breadcrumb
          items={[
            { href: "/trips", label: t("trips") },
            { label: tripId },
          ]}
        />
        <div
          data-testid="synthetic-badge"
          className="mb-4 inline-flex rounded-md bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-900"
        >
          {t("syntheticData")} / بيانات تجريبية
        </div>
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState message={error} /> : null}
        {state === "success" && trip && financial ? (
          <div data-testid="trip-detail" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {data.sections.map((section) => (
                <button
                  key={section}
                  type="button"
                  data-testid={`tab-${section}`}
                  className={`rounded px-3 py-1 text-sm ${
                    tab === section ? "bg-slate-900 text-white" : "bg-white border"
                  }`}
                  onClick={() => setTab(section)}
                >
                  {section}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              {tab === "overview" || tab === "status" ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-slate-500">ID</dt>
                    <dd>{trip.id}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">{t("status")}</dt>
                    <dd>{trip.status}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Legacy status</dt>
                    <dd>{trip.legacyStatus ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">{t("country")}</dt>
                    <dd>
                      {trip.countryId} / {trip.cityId}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {tab === "parties" ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-slate-500">{t("customers")}</dt>
                    <dd>
                      {trip.customerName} ({trip.customerId})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">{t("drivers")}</dt>
                    <dd>
                      {trip.driverName ?? "—"} ({trip.driverId ?? "—"})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">{t("agents")}</dt>
                    <dd>{trip.agentId ?? "—"}</dd>
                  </div>
                </dl>
              ) : null}
              {tab === "payment" ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-slate-500">Payment method</dt>
                    <dd>{trip.paymentMethod}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Currency</dt>
                    <dd>{trip.currencyCode}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-slate-500">Gross fare</dt>
                    <dd>{trip.grossFare ?? t("unavailable")}</dd>
                  </div>
                </dl>
              ) : null}
              {tab === "financial" || tab === "settlement_eligibility" ? (
                <div data-testid="trip-financial">
                  <div
                    data-testid="synthetic-financial-badge"
                    className="mb-3 inline-flex rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900"
                  >
                    Synthetic financial calculation
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm text-slate-500">Confidence</dt>
                      <dd data-testid="financial-confidence">{financial.confidence}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-500">Settlement eligible</dt>
                      <dd>{String(financial.settlementEligible)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-500">Incomplete reasons</dt>
                      <dd>
                        {financial.incompleteReasons.length
                          ? financial.incompleteReasons.join(", ")
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-500">Platform commission</dt>
                      <dd>
                        {financial.amounts.platformCommission
                          ? financial.amounts.platformCommission.amountMinor
                          : t("unavailable")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-500">Driver earnings</dt>
                      <dd>
                        {financial.amounts.driverEarnings
                          ? financial.amounts.driverEarnings.amountMinor
                          : t("unavailable")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-slate-500">Policy</dt>
                      <dd>
                        {financial.calculationPolicyId}@{financial.calculationPolicyVersion}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {tab === "audit_placeholder" ? (
                <p className="text-sm text-slate-600">
                  Trip-level audit trail links to /audit filtered by resource (synthetic).
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
