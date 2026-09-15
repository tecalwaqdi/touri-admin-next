"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PermissionGuard } from "@/components/guards/PermissionGuard";
import {
  DetailNotEnabledState,
  ErrorState,
  LoadingState,
  NotFoundState,
  UnavailableState,
} from "@/components/states/QueryStates";
import { isProductionDetailDisabledResponse } from "@/domain/presentation/detailRouteSemantics";
import { SourceLabelBadge } from "@/components/ui/SourceLabelBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { TripDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { Trip } from "@/types/trip";
import type { FinancialTripDto } from "@/domain/finance/serializeFinancialTrip";

type DetailUiState = QueryState | "not_found" | "unavailable" | "not_enabled";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function displayMoney(
  field: TripDetailDto["financial"]["grossFare"] | null | undefined,
  missingLabel: string,
  unknownLabel: string,
  unavailableLabel: string,
): string {
  if (!field) return unavailableLabel;
  if (field.availability === "missing") return missingLabel;
  if (field.availability === "unavailable") return unavailableLabel;
  if (field.availability === "unknown" || field.amount == null) return unknownLabel;
  return String(field.amount);
}

export function TripDetailPage({ tripId }: { tripId: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<DetailUiState>("idle");
  const [data, setData] = useState<TripDetailDto | null>(null);
  const [legacy, setLegacy] = useState<{
    trip: Trip;
    financial: FinancialTripDto;
  } | null>(null);
  const [error, setError] = useState<string>();
  const [section, setSection] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setState("loading");
      setData(null);
      setLegacy(null);
      try {
        const res = await apiFetch(`/api/trips/${tripId}`);
        const body = await res.json().catch(() => ({}));
        if (
          isProductionDetailDisabledResponse({
            status: res.status,
            code: (body as { code?: string }).code,
            bodyText: JSON.stringify(body),
          })
        ) {
          setError(t("productionDetailNotEnabled"));
          setState("not_enabled");
          return;
        }
        if (res.status === 404) {
          setState("not_found");
          return;
        }
        if (res.status === 503) {
          setState("unavailable");
          setError(
            locale === "ar" ? "مصدر البيانات غير متاح" : "Data source unavailable",
          );
          return;
        }
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? t("error"));
        }
        if ((body as TripDetailDto).kind === "trip") {
          setData(body as TripDetailDto);
        } else if (
          (body as { trip?: Trip; financial?: FinancialTripDto }).trip &&
          (body as { financial?: FinancialTripDto }).financial
        ) {
          setLegacy({
            trip: (body as { trip: Trip }).trip,
            financial: (body as { financial: FinancialTripDto }).financial,
          });
        } else {
          throw new Error(t("error"));
        }
        setState("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("error"));
        setState("error");
      }
    };
    void load();
  }, [apiFetch, tripId, t, locale]);

  const sections = [
    "overview",
    "parties",
    "route",
    "timing",
    "payment",
    "lifecycle",
  ] as const;

  const source =
    data?.sourceLabel ??
    (legacy
      ? resolveAdminDataSourceLabel({ syntheticSource: true })
      : null);

  return (
    <AdminShell title={t("trips")}>
      <PermissionGuard permission="trips:read">
        <Breadcrumb
          items={[
            { href: "/trips", label: t("trips") },
            { label: tripId },
          ]}
        />
        {source ? (
          <SourceLabelBadge
            testId="source-label-badge"
            source={{
              label: normalizeSourceLabelCode(source.label),
              code: normalizeSourceLabelCode(source.label),
              en: source.en,
              ar: source.ar,
              synthetic: source.synthetic,
            }}
          />
        ) : null}
        {state === "loading" || state === "idle" ? <LoadingState /> : null}
        {state === "not_enabled" ? (
          <DetailNotEnabledState message={error} />
        ) : null}
        {state === "not_found" ? <NotFoundState /> : null}
        {state === "unavailable" ? (
          <UnavailableState message={error} />
        ) : null}
        {state === "error" ? <ErrorState message={error} /> : null}
        {state === "success" && data ? (
          <div data-testid="trip-detail" className="space-y-4">
            {data.dataQualityWarnings.length > 0 ? (
              <ul
                data-testid="data-quality-warnings"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
              >
                {data.dataQualityWarnings.map((w) => (
                  <li key={`${w.code}-${w.messageEn}`}>
                    {locale === "ar" ? w.messageAr : w.messageEn}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-testid={`tab-${s}`}
                  className={`rounded px-3 py-1 text-sm ${
                    section === s ? "bg-slate-900 text-white" : "bg-white border"
                  }`}
                  onClick={() => setSection(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                {(section === "overview" || section === "lifecycle") && (
                  <>
                    <Field label="ID">{data.id}</Field>
                    <Field label={t("status")}>
                      <StatusBadge
                        value={
                          data.lifecycleStatus || data.status || "unknown"
                        }
                      />
                    </Field>
                    <Field label={t("country")}>
                      {data.countryId ?? t("missing")} /{" "}
                      {data.cityId ?? t("missing")}
                    </Field>
                    <Field label="Mapping">
                      {data.mappingStatus ?? t("unknown")}
                    </Field>
                  </>
                )}
                {section === "parties" && (
                  <>
                    <Field label={t("customers")}>
                      {data.customerId ?? t("missing")}
                    </Field>
                    <Field label={t("drivers")}>
                      {data.driverId ?? t("missing")}
                    </Field>
                    <Field label={t("agents")}>
                      {data.agentId ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "route" && (
                  <>
                    <Field label="Pickup landmark">
                      {data.pickupLandmarkId ?? t("missing")}
                    </Field>
                    <Field label="Destination landmark">
                      {data.destinationLandmarkId ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "timing" && (
                  <>
                    <Field label="Created">
                      {data.createdAtUtc ?? t("missing")}
                    </Field>
                    <Field label="Started">
                      {data.startedAtUtc ?? t("missing")}
                    </Field>
                    <Field label="Completed">
                      {data.completedAtUtc ?? t("missing")}
                    </Field>
                    <Field label="Scheduled">{t("unavailable")}</Field>
                    <Field label="Cancelled at">
                      {data.cancellation.cancelledAtUtc ?? t("missing")}
                    </Field>
                    <Field label="Cancel reason">
                      {data.cancellation.reason ?? t("missing")}
                    </Field>
                    <Field label="Cancelled by">
                      {data.cancellation.actor ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "payment" && (
                  <>
                    <Field label="Payment method">
                      {data.paymentMethod ?? t("unknown")}
                    </Field>
                    <Field label="Currency">
                      {data.currencyCode ?? t("missing")}
                    </Field>
                    <Field label="Gross fare">
                      {displayMoney(
                        data.financial.grossFare,
                        t("missing"),
                        t("unknown"),
                        t("unavailable"),
                      )}
                    </Field>
                    <Field label="VAT">
                      {displayMoney(
                        data.financial.vatAmount,
                        t("missing"),
                        t("unknown"),
                        t("unavailable"),
                      )}
                    </Field>
                    <Field label="Platform commission %">
                      {data.financial.platformCommissionRatePercent ??
                        t("missing")}
                    </Field>
                  </>
                )}
              </dl>
            </div>
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="trip-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="ID">{legacy.trip.id}</Field>
                <Field label={t("status")}>
                  <StatusBadge value={legacy.trip.status} />
                </Field>
                <Field label={t("country")}>
                  {legacy.trip.countryId} / {legacy.trip.cityId}
                </Field>
                <Field label={t("customers")}>{legacy.trip.customerId}</Field>
                <Field label={t("drivers")}>
                  {legacy.trip.driverId ?? t("missing")}
                </Field>
              </dl>
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
