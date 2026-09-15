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
import type { Customer, QueryState } from "@/types/common";
import { CustomerWriteActions } from "@/features/customers/CustomerWriteActions";
import { useApiFetch } from "@/lib/apiClient";
import type { CustomerDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";

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

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<DetailUiState>("idle");
  const [data, setData] = useState<CustomerDetailDto | null>(null);
  const [legacy, setLegacy] = useState<Customer | null>(null);
  const [error, setError] = useState<string>();
  const [section, setSection] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setState("loading");
      setData(null);
      setLegacy(null);
      try {
        const res = await apiFetch(`/api/customers/${customerId}`);
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
        if ((body as CustomerDetailDto).kind === "customer") {
          setData(body as CustomerDetailDto);
        } else if ((body as Customer).id) {
          setLegacy(body as Customer);
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
  }, [apiFetch, customerId, t, locale]);

  const sections = [
    "overview",
    "account",
    "location",
    "trips",
    "deletion",
  ] as const;

  const source =
    data?.sourceLabel ??
    (legacy ? resolveAdminDataSourceLabel({ syntheticSource: true }) : null);

  return (
    <AdminShell title={t("customers")}>
      <PermissionGuard permission="customers:read">
        <Breadcrumb
          items={[
            { href: "/customers", label: t("customers") },
            { label: customerId },
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
          <div data-testid="customer-detail" className="space-y-4">
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
                {section === "overview" && (
                  <>
                    <Field label="Name">
                      {data.displayName ?? t("missing")}
                    </Field>
                    <Field label="ID">{data.id}</Field>
                    <Field label="Email">
                      {data.emailHint ?? t("unavailable")}
                    </Field>
                    <Field label="Phone">
                      {data.phoneHint ?? t("unavailable")}
                    </Field>
                  </>
                )}
                {section === "account" && (
                  <>
                    <Field label={t("status")}>
                      <span data-testid="customer-status">
                        {data.accountState ? (
                          <StatusBadge value={data.accountState} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </Field>
                    <Field label="Created">
                      {data.createdAtUtc ?? t("missing")}
                    </Field>
                    <Field label="Last activity">
                      {data.lastActivityAtUtc ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "location" && (
                  <>
                    <Field label={t("country")}>
                      <span data-testid="customer-country">
                        {data.countryId ?? t("missing")} /{" "}
                        {data.cityId ?? t("missing")}
                      </span>
                    </Field>
                    <Field label="Geography">
                      {data.geographyRepresentation ?? t("unknown")}
                    </Field>
                  </>
                )}
                {section === "trips" && (
                  <>
                    <Field label={t("tripsCount")}>
                      {data.tripSummary.bookingsCountAvailability ===
                      "available"
                        ? String(data.tripSummary.bookingsCount)
                        : data.tripSummary.bookingsCountAvailability ===
                            "missing"
                          ? t("missing")
                          : t("unavailable")}
                    </Field>
                    <Field label="Completed / cancelled">
                      {t("unavailable")}
                    </Field>
                    <Field label="Trip lock">
                      {data.tripLockHint ?? t("unknown")}
                    </Field>
                  </>
                )}
                {section === "deletion" && (
                  <Field label="Deletion / retention">
                    {t("unavailable")}
                  </Field>
                )}
              </dl>
            </div>
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="customer-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">{legacy.name}</Field>
                <Field label={t("country")}>
                  <span data-testid="customer-country">
                    {legacy.countryId} / {legacy.cityId}
                  </span>
                </Field>
                <Field label={t("status")}>
                  <span data-testid="customer-status">{legacy.status}</span>
                </Field>
              </dl>
            </div>
            <CustomerWriteActions
              customer={legacy}
              onUpdated={(next) => setLegacy(next)}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
