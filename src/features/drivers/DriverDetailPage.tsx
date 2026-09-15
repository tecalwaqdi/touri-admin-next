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
import {
  DetailField,
  SectionTabs,
} from "@/components/ui/DetailSection";
import { adminUi } from "@/components/ui/adminUi";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";

type DetailUiState = QueryState | "not_found" | "unavailable" | "not_enabled";

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
            <SectionTabs
              testIdPrefix="tab"
              active={section}
              onChange={(id) => setSection(id)}
              items={sections.map((s) => ({ id: s, label: sectionLabel(s) }))}
            />
            <div className={adminUi.cardPad}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {section === "overview" && (
                  <>
                    <DetailField label={t("name")}>
                      {data.displayName ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("id")}><LtrIsolate className={adminUi.monoId}>{data.id}</LtrIsolate></DetailField>
                    <DetailField label={t("email")}>{data.email ?? t("unavailable")}</DetailField>
                    <DetailField label={t("phone")}>{data.phone ?? t("unavailable")}</DetailField>
                    <DetailField label={t("account")}>
                      {data.accountState ? (
                        <StatusBadge value={data.accountState} />
                      ) : (
                        t("unknown")
                      )}
                    </DetailField>
                  </>
                )}
                {section === "registration" && (
                  <>
                    <DetailField label={t("registrationStatus")}>
                      <span data-testid="registration-status">
                        {data.registrationStatus ? (
                          <StatusBadge value={data.registrationStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("approvalStatus")}>
                      <span data-testid="approval-status">
                        {data.approvalStatus ? (
                          <StatusBadge value={data.approvalStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </DetailField>
                  </>
                )}
                {section === "contact" && (
                  <>
                    <DetailField label={t("email")}>
                      {data.email ?? t("unavailable")}
                    </DetailField>
                    <DetailField label={t("phone")}>{data.phone ?? t("unavailable")}</DetailField>
                    <DetailField label={t("country")}>
                      {data.countryId ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("city")}>{data.cityId ?? t("missing")}</DetailField>
                    <DetailField label={t("region")}>{t("unavailable")}</DetailField>
                  </>
                )}
                {section === "vehicle" && (
                  <>
                    <DetailField label={t("makeName")}>
                      <span data-testid="driver-vehicle">
                        {data.vehicle.name ?? t("missing")}
                      </span>
                    </DetailField>
                    <DetailField label={t("model")}>
                      {data.vehicle.model ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("vehicle")}>
                      {data.vehicle.typeCarId ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("plate")}>
                      {data.vehicle.plateMasked ?? t("missing")}
                    </DetailField>
                  </>
                )}
                {section === "documents" && (
                  <>
                    <DetailField label={t("overall")}>
                      <span data-testid="driver-docs">
                        {data.documents.overall ? (
                          <StatusBadge value={data.documents.overall} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("status")}>
                      {data.documents.expiredSlotCount > 0 ? (
                        <StatusBadge value="WARNING" />
                      ) : data.documents.hasKnownExpiry ? (
                        <StatusBadge value="PASS" />
                      ) : (
                        t("unavailable")
                      )}
                    </DetailField>
                    {data.documents.slots.map((slot) => (
                      <DetailField key={slot.slot} label={slot.slot}>
                        <StatusBadge value={slot.presence || "missing"} />
                      </DetailField>
                    ))}
                  </>
                )}
                {section === "operational" && (
                  <>
                    <DetailField label={t("availabilityStatus")}>
                      <span data-testid="availability-status">
                        {data.availabilityStatus ? (
                          <StatusBadge value={data.availabilityStatus} />
                        ) : (
                          t("unknown")
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("online")}>
                      {data.onlineStatus ?? t("unknown")}
                    </DetailField>
                    <DetailField label={t("onTrip")}>
                      {data.onTrip == null
                        ? t("unknown")
                        : data.onTrip
                          ? "yes"
                          : "no"}
                    </DetailField>
                    <DetailField label={t("createdAt")}>
                      {data.createdAtUtc ? (
                        <FormattedDateTime value={data.createdAtUtc} />
                      ) : (
                        t("missing")
                      )}
                    </DetailField>
                  </>
                )}
                {section === "trips" && (
                  <DetailField label={t("tripsCount")}>{t("unavailable")}</DetailField>
                )}
                {section === "finance" && (
                  <DetailField label={t("walletSettlement")}>
                    {t("unavailable")}
                  </DetailField>
                )}
              </dl>
            </div>
          </div>
        ) : null}
        {state === "success" && legacy ? (
          <div data-testid="driver-detail" className="space-y-4">
            <div className={adminUi.cardPad}>
              <dl className="grid gap-3 sm:grid-cols-2">
                <DetailField label={t("name")}>{legacy.name}</DetailField>
                <DetailField label={t("registrationStatus")}>
                  <span data-testid="registration-status">
                    <StatusBadge value={legacy.registrationStatus} />
                  </span>
                </DetailField>
                <DetailField label={t("approvalStatus")}>
                  <span data-testid="approval-status">
                    <StatusBadge value={legacy.approvalStatus} />
                  </span>
                </DetailField>
                <DetailField label={t("availabilityStatus")}>
                  <span data-testid="availability-status">
                    <StatusBadge value={legacy.availabilityStatus} />
                  </span>
                </DetailField>
                <DetailField label={t("vehicle")}>
                  <span data-testid="driver-vehicle">{legacy.vehiclePlate}</span>
                </DetailField>
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
