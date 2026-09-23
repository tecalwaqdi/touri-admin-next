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
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import {
  presentCancellationReason,
  presentPaymentMethod,
  presentStatus,
} from "@/domain/presentation/statusPresentation";
import {
  presentFinanceTerm,
  type FinanceLocale,
} from "@/domain/presentation/financeTerminology";
import {
  CityCell,
  CountryCell,
  LandmarkCell,
} from "@/components/ui/GeoReferenceCells";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import type { QueryState } from "@/types/common";
import { useApiFetch } from "@/lib/apiClient";
import type { TripDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import type { Trip } from "@/types/trip";
import type { FinancialTripDto } from "@/domain/finance/serializeFinancialTrip";
import { shortenId } from "@/domain/presentation/operationalDisplayName";

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

function displayCommissionPercent(
  value: number | null | undefined,
  availability: TripDetailDto["financial"]["platformCommissionAvailability"],
  unavailableLabel: string,
  missingLabel: string,
): string {
  if (value != null) return String(value);
  if (availability === "missing") return missingLabel;
  return unavailableLabel;
}

function partyEmptyLabel(
  assignment: TripDetailDto["driverAssignment"] | "assigned",
  t: (k: "missing" | "neverAssigned" | "brokenReference" | "unavailable") => string,
): string {
  if (assignment === "never_assigned") return t("neverAssigned");
  if (assignment === "broken_reference") return t("brokenReference");
  return t("missing");
}

function timingFallback(
  value: string | null | undefined,
  opts: {
    cancelled?: boolean;
    terminal?: boolean;
    isCancelField?: boolean;
    t: (k: "missing" | "notApplicable" | "notYetReached") => string;
  },
): string {
  if (value) return ""; // FormattedDateTime handles
  if (opts.isCancelField && !opts.cancelled) return opts.t("notApplicable");
  if (!opts.isCancelField && !opts.terminal && !opts.cancelled) {
    return opts.t("notYetReached");
  }
  return opts.t("missing");
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
          setError(t("dataSourceUnavailable"));
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

  const canonicalStatus =
    data?.lifecycleStatus || data?.status || null;
  const isCancelled = data?.cancellation.isCancelled === true;
  const isTerminal =
    canonicalStatus === "completed" ||
    canonicalStatus === "expired" ||
    isCancelled;

  return (
    <AdminShell title={t("trips")}>
      <PermissionGuard permission="trips:read">
        <Breadcrumb
          items={[
            { href: "/trips", label: t("trips") },
            { label: shortenId(tripId, 16) ?? tripId },
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
                  {t(s as "overview" | "lifecycle" | "parties" | "route" | "timing" | "payment")}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                {section === "overview" && (
                  <>
                    <Field label={t("id")}>
                      <LtrIsolate>{data.id}</LtrIsolate>
                    </Field>
                    <Field label={t("status")}>
                      <span data-testid="trip-detail-status">
                        <StatusBadge
                          value={canonicalStatus || "unmapped"}
                        />
                      </span>
                    </Field>
                    <Field label={t("assignment")}>
                      {data.mappingStatus ? (
                        <StatusBadge value={data.mappingStatus} />
                      ) : (
                        presentStatus("unknown", locale)
                      )}
                    </Field>
                    <Field label={t("customers")}>
                      <PrimaryWithTechnicalId
                        primary={data.customerDisplayName}
                        technicalId={data.customerId}
                        emptyLabel={
                          data.customerIdKnowledge === "missing"
                            ? t("missing")
                            : t("unavailable")
                        }
                      />
                    </Field>
                    <Field label={t("drivers")}>
                      <PrimaryWithTechnicalId
                        primary={data.driverDisplayName}
                        technicalId={data.driverId}
                        emptyLabel={partyEmptyLabel(data.driverAssignment, t)}
                      />
                    </Field>
                    <Field label={t("country")}>
                      <CountryCell
                        canonicalCountryId={data.canonicalCountryId}
                        countryId={data.countryId}
                      />
                    </Field>
                    <Field label={t("city")}>
                      <CityCell cityId={data.cityId} />
                    </Field>
                    <Field label={t("origin")}>
                      <LandmarkCell
                        landmarkId={data.pickupLandmarkId}
                        explicitName={data.pickupLandmarkName}
                        knowledge={data.pickupLandmarkKnowledge}
                      />
                    </Field>
                    <Field label={t("destination")}>
                      <LandmarkCell
                        landmarkId={data.destinationLandmarkId}
                        explicitName={data.destinationLandmarkName}
                        knowledge={data.destinationLandmarkKnowledge}
                      />
                    </Field>
                    <Field label={t("paymentMethod")}>
                      {data.paymentMethod === "cash"
                        ? t("cashOnly")
                        : data.paymentMethod
                          ? presentPaymentMethod(data.paymentMethod, locale)
                          : presentStatus("unknown", locale)}
                    </Field>
                    <Field label={t("fare")}>
                      {displayMoney(
                        data.financial.grossFare,
                        t("missing"),
                        presentStatus("unknown", locale),
                        t("unavailable"),
                      )}
                      {data.currencyCode ? (
                        <span className="ms-1 text-slate-500">
                          <LtrIsolate>{data.currencyCode}</LtrIsolate>
                        </span>
                      ) : null}
                    </Field>
                    <Field label={t("createdAt")}>
                      <FormattedDateTime
                        value={data.createdAtUtc}
                        fallback={t("missing")}
                      />
                    </Field>
                  </>
                )}
                {section === "lifecycle" && (
                  <>
                    <Field label={t("status")}>
                      <StatusBadge
                        value={canonicalStatus || "unmapped"}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      {data.lifecycleEvents.length > 0 ? (
                        <ul
                          data-testid="lifecycle-events"
                          className="space-y-2"
                        >
                          {data.lifecycleEvents.map((ev, i) => (
                            <li
                              key={`${ev.action}-${ev.atUtc ?? i}`}
                              className="rounded border border-slate-100 px-3 py-2 text-sm"
                            >
                              <span className="font-medium">
                                {presentStatus(ev.action, locale)}
                              </span>
                              {ev.actor ? (
                                <span className="ms-2 text-slate-500">
                                  {presentStatus(ev.actor, locale)}
                                </span>
                              ) : null}
                              {ev.atUtc ? (
                                <span className="ms-2 text-slate-500">
                                  <FormattedDateTime value={ev.atUtc} />
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p
                          data-testid="lifecycle-empty"
                          className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600"
                        >
                          {t("noLifecycleEvents")}
                        </p>
                      )}
                    </div>
                  </>
                )}
                {section === "parties" && (
                  <>
                    <Field label={t("customers")}>
                      <PrimaryWithTechnicalId
                        primary={data.customerDisplayName}
                        technicalId={data.customerId}
                        emptyLabel={
                          data.customerIdKnowledge === "missing"
                            ? t("missing")
                            : t("unavailable")
                        }
                      />
                    </Field>
                    <Field label={t("drivers")}>
                      <PrimaryWithTechnicalId
                        primary={data.driverDisplayName}
                        technicalId={data.driverId}
                        emptyLabel={partyEmptyLabel(data.driverAssignment, t)}
                      />
                    </Field>
                    <Field label={t("agents")}>
                      <PrimaryWithTechnicalId
                        primary={data.agentDisplayName}
                        technicalId={data.agentId}
                        emptyLabel={
                          data.agentId ? t("unavailable") : t("neverAssigned")
                        }
                      />
                    </Field>
                  </>
                )}
                {section === "route" && (
                  <>
                    <Field label={t("pickupLandmark")}>
                      <LandmarkCell
                        landmarkId={data.pickupLandmarkId}
                        explicitName={data.pickupLandmarkName}
                        knowledge={data.pickupLandmarkKnowledge}
                      />
                    </Field>
                    <Field label={t("destinationLandmark")}>
                      <LandmarkCell
                        landmarkId={data.destinationLandmarkId}
                        explicitName={data.destinationLandmarkName}
                        knowledge={data.destinationLandmarkKnowledge}
                      />
                    </Field>
                  </>
                )}
                {section === "timing" && (
                  <>
                    <Field label={t("createdAt")}>
                      <FormattedDateTime
                        value={data.createdAtUtc}
                        fallback={t("missing")}
                      />
                    </Field>
                    <Field label={t("startedAt")}>
                      {data.startedAtUtc ? (
                        <FormattedDateTime value={data.startedAtUtc} />
                      ) : (
                        <span className="text-slate-400">
                          {timingFallback(null, {
                            cancelled: isCancelled,
                            terminal: isTerminal,
                            t,
                          })}
                        </span>
                      )}
                    </Field>
                    <Field label={t("completedAt")}>
                      {data.completedAtUtc ? (
                        <FormattedDateTime value={data.completedAtUtc} />
                      ) : (
                        <span className="text-slate-400">
                          {timingFallback(null, {
                            cancelled: isCancelled,
                            terminal: isTerminal,
                            t,
                          })}
                        </span>
                      )}
                    </Field>
                    <Field label={t("scheduledAt")}>{t("notApplicable")}</Field>
                    <Field label={t("cancelledAt")}>
                      {data.cancellation.cancelledAtUtc ? (
                        <FormattedDateTime
                          value={data.cancellation.cancelledAtUtc}
                        />
                      ) : (
                        <span className="text-slate-400">
                          {timingFallback(null, {
                            cancelled: isCancelled,
                            terminal: isTerminal,
                            isCancelField: true,
                            t,
                          })}
                        </span>
                      )}
                    </Field>
                    <Field label={t("cancelReason")}>
                      {isCancelled
                        ? presentCancellationReason(
                            data.cancellation.reason,
                            locale,
                          ) ?? t("missing")
                        : t("notApplicable")}
                    </Field>
                    <Field label={t("cancelledBy")}>
                      {isCancelled
                        ? data.cancellation.actor
                          ? presentStatus(data.cancellation.actor, locale)
                          : presentStatus("unknown", locale)
                        : t("notApplicable")}
                    </Field>
                  </>
                )}
                {section === "payment" && (
                  <>
                    {data.financial.financeDisplayPresentationKey ===
                      "historicalFinancialIncomplete" ||
                    data.financial.financeDisplayState ===
                      "historical_incomplete" ? (
                      <p
                        className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                        data-testid="trip-finance-historical-incomplete"
                      >
                        {presentFinanceTerm(
                          "historicalFinancialIncomplete",
                          locale as FinanceLocale,
                        )}
                      </p>
                    ) : null}
                    {data.financial.financeDisplayPresentationKey ===
                      "historicalFinancialConflict" ||
                    data.financial.financeDisplayState ===
                      "historical_conflict" ? (
                      <p
                        className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950"
                        data-testid="trip-finance-historical-conflict"
                      >
                        {presentFinanceTerm(
                          "historicalFinancialConflict",
                          locale as FinanceLocale,
                        )}
                      </p>
                    ) : null}
                    <Field label={t("paymentMethod")}>
                      {data.paymentMethod === "cash"
                        ? t("cashOnly")
                        : data.paymentMethod
                          ? presentPaymentMethod(data.paymentMethod, locale)
                          : presentStatus("unknown", locale)}
                    </Field>
                    <Field label={t("currency")}>
                      {data.currencyCode ? (
                        <LtrIsolate>{data.currencyCode}</LtrIsolate>
                      ) : (
                        t("missing")
                      )}
                    </Field>
                    <Field label={t("grossFare")}>
                      {data.financial.excludeFromCertifiedTotals &&
                      (data.financial.financeDisplayState ===
                        "historical_incomplete" ||
                        data.financial.financeDisplayState ===
                          "historical_conflict")
                        ? presentFinanceTerm(
                            data.financial.financeDisplayPresentationKey ??
                              "historicalFinancialIncomplete",
                            locale as FinanceLocale,
                          )
                        : displayMoney(
                            data.financial.grossFare,
                            t("missing"),
                            presentStatus("unknown", locale),
                            t("unavailable"),
                          )}
                    </Field>
                    <Field label={t("vat")}>
                      {data.financial.excludeFromCertifiedTotals &&
                      (data.financial.financeDisplayState ===
                        "historical_incomplete" ||
                        data.financial.financeDisplayState ===
                          "historical_conflict")
                        ? presentFinanceTerm(
                            data.financial.financeDisplayPresentationKey ??
                              "historicalFinancialIncomplete",
                            locale as FinanceLocale,
                          )
                        : displayMoney(
                            data.financial.vatAmount,
                            t("missing"),
                            presentStatus("unknown", locale),
                            t("unavailable"),
                          )}
                    </Field>
                    <Field label={t("platformCommissionPercent")}>
                      {displayCommissionPercent(
                        data.financial.platformCommissionRatePercent,
                        data.financial.platformCommissionAvailability,
                        t("unavailable"),
                        t("missing"),
                      )}
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
                <Field label={t("id")}>
                  <LtrIsolate>{legacy.trip.id}</LtrIsolate>
                </Field>
                <Field label={t("status")}>
                  <StatusBadge value={legacy.trip.status} />
                </Field>
                <Field label={t("country")}>
                  <CountryCell countryId={legacy.trip.countryId} />
                </Field>
                <Field label={t("city")}>
                  <CityCell cityId={legacy.trip.cityId} />
                </Field>
                <Field label={t("customers")}>
                  <PrimaryWithTechnicalId
                    primary={null}
                    technicalId={legacy.trip.customerId}
                    emptyLabel={t("missing")}
                  />
                </Field>
                <Field label={t("drivers")}>
                  <PrimaryWithTechnicalId
                    primary={null}
                    technicalId={legacy.trip.driverId}
                    emptyLabel={t("neverAssigned")}
                  />
                </Field>
              </dl>
            </div>
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
