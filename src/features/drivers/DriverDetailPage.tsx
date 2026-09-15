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
import type { DriverDetailDto } from "@/application/production-read/detailDtos";
import {
  normalizeSourceLabelCode,
  resolveAdminDataSourceLabel,
} from "@/domain/production-read/SourceLabel";
import { DriverWriteActions } from "@/features/drivers/DriverWriteActions";
import type { Driver } from "@/types/driver";

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

export function DriverDetailPage({ driverId }: { driverId: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<DetailUiState>("idle");
  const [data, setData] = useState<DriverDetailDto | null>(null);
  const [legacy, setLegacy] = useState<Driver | null>(null);
  const [error, setError] = useState<string>();
  const [section, setSection] = useState("overview");

  useEffect(() => {
    const load = async () => {
      setState("loading");
      setData(null);
      setLegacy(null);
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
            t("dataSourceUnavailable"),
          );
          return;
        }
        if (!res.ok) {
          throw new Error((body as { error?: string }).error ?? t("error"));
        }
        if ((body as DriverDetailDto).kind === "driver") {
          setData(body as DriverDetailDto);
        } else if ((body as Driver).id) {
          setLegacy(body as Driver);
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
  }, [apiFetch, driverId, t, locale]);

  const sections = [
    "overview",
    "registration",
    "contact",
    "vehicle",
    "documents",
    "operational",
    "trips",
    "finance",
  ] as const;

  const sectionLabel = (s: (typeof sections)[number]): string => {
    switch (s) {
      case "overview":
        return t("overview");
      case "registration":
        return t("registration");
      case "contact":
        return t("contactLocation");
      case "vehicle":
        return t("vehicle");
      case "documents":
        return t("documents");
      case "operational":
        return t("operationalState");
      case "trips":
        return t("tripSummary");
      case "finance":
        return t("financeSummary");
      default:
        return s;
    }
  };

  const source =
    data?.sourceLabel ??
    (legacy ? resolveAdminDataSourceLabel({ syntheticSource: true }) : null);

  return (
    <AdminShell title={t("drivers")}>
      <PermissionGuard permission="drivers:read">
        <Breadcrumb
          items={[
            { href: "/drivers", label: t("drivers") },
            { label: driverId },
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
          <div data-testid="driver-detail" className="space-y-4">
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
                  {sectionLabel(s)}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                {section === "overview" && (
                  <>
                    <Field label={t("name")}>
                      {data.displayName ?? t("missing")}
                    </Field>
                    <Field label={t("id")}>{data.id}</Field>
                    <Field label={t("email")}>{data.email ?? t("unavailable")}</Field>
                    <Field label={t("phone")}>{data.phone ?? t("unavailable")}</Field>
                    <Field label={t("account")}>
                      {data.accountState ? (
                        <StatusBadge value={data.accountState} />
                      ) : (
                        t("unknown")
                      )}
                    </Field>
                  </>
                )}
                {section === "registration" && (
                  <>
                    <Field label={t("registrationStatus")}>
                      <span data-testid="registration-status">
                        {data.registrationStatus ? (
                          <StatusBadge value={data.registrationStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </Field>
                    <Field label={t("approvalStatus")}>
                      <span data-testid="approval-status">
                        {data.approvalStatus ? (
                          <StatusBadge value={data.approvalStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </Field>
                  </>
                )}
                {section === "contact" && (
                  <>
                    <Field label={t("email")}>
                      {data.email ?? t("unavailable")}
                    </Field>
                    <Field label={t("phone")}>{data.phone ?? t("unavailable")}</Field>
                    <Field label={t("country")}>
                      {data.countryId ?? t("missing")}
                    </Field>
                    <Field label={t("city")}>{data.cityId ?? t("missing")}</Field>
                    <Field label={t("region")}>{t("unavailable")}</Field>
                  </>
                )}
                {section === "vehicle" && (
                  <>
                    <Field label={t("makeName")}>
                      <span data-testid="driver-vehicle">
                        {data.vehicle.name ?? t("missing")}
                      </span>
                    </Field>
                    <Field label={t("model")}>
                      {data.vehicle.model ?? t("missing")}
                    </Field>
                    <Field label={t("vehicle")}>
                      {data.vehicle.typeCarId ?? t("missing")}
                    </Field>
                    <Field label={t("plate")}>
                      {data.vehicle.plateMasked ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "documents" && (
                  <>
                    <Field label={t("overall")}>
                      <span data-testid="driver-docs">
                        {data.documents.overall ?? t("unknown")}
                      </span>
                    </Field>
                    {data.documents.slots.map((slot) => (
                      <Field key={slot.slot} label={slot.slot}>
                        {slot.presence}
                      </Field>
                    ))}
                  </>
                )}
                {section === "operational" && (
                  <>
                    <Field label={t("availabilityStatus")}>
                      <span data-testid="availability-status">
                        {data.availabilityStatus ? (
                          <StatusBadge value={data.availabilityStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </Field>
                    <Field label={t("online")}>
                      {data.onlineStatus ?? t("unknown")}
                    </Field>
                    <Field label={t("onTrip")}>
                      {data.onTrip == null
                        ? t("unknown")
                        : data.onTrip
                          ? "yes"
                          : "no"}
                    </Field>
                    <Field label={t("createdAt")}>
                      {data.createdAtUtc ?? t("missing")}
                    </Field>
                  </>
                )}
                {section === "trips" && (
                  <Field label={t("tripsCount")}>{t("unavailable")}</Field>
                )}
                {section === "finance" && (
                  <Field label={t("walletSettlement")}>
                    {t("unavailable")}
                  </Field>
                )}
              </dl>
            </div>
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="driver-detail" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label={t("name")}>{legacy.name}</Field>
                <Field label={t("registrationStatus")}>
                  <span data-testid="registration-status">
                    <StatusBadge value={legacy.registrationStatus} />
                  </span>
                </Field>
                <Field label={t("approvalStatus")}>
                  <span data-testid="approval-status">
                    <StatusBadge value={legacy.approvalStatus} />
                  </span>
                </Field>
                <Field label={t("availabilityStatus")}>
                  <span data-testid="availability-status">
                    <StatusBadge value={legacy.availabilityStatus} />
                  </span>
                </Field>
                <Field label={t("vehicle")}>
                  <span data-testid="driver-vehicle">{legacy.vehiclePlate}</span>
                </Field>
              </dl>
            </div>
            <DriverWriteActions
              driver={legacy}
              onUpdated={(next) => setLegacy(next)}
            />
          </div>
        ) : null}
      </PermissionGuard>
    </AdminShell>
  );
}
