"use client";

import { useEffect, useState, useRef } from "react";
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
import { DriverDocumentSlotReviewActions } from "@/features/drivers/DriverDocumentSlotReviewActions";
import type { Driver, RegistrationStatus } from "@/types/driver";
import { REGISTRATION_STATUSES } from "@/types/driver";
import {
  DetailField,
  SectionTabs,
} from "@/components/ui/DetailSection";
import { adminUi } from "@/components/ui/adminUi";
import { LtrIsolate } from "@/components/i18n/LtrIsolate";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import { CityCell, CountryCell } from "@/components/ui/GeoReferenceCells";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import { MoneyCell } from "@/components/ui/MoneyCell";
import { shortenId } from "@/domain/presentation/operationalDisplayName";
import { normalizeDocumentSlotReviewStatus } from "@/domain/driver/DriverDocumentReview";

const MEANINGFUL_DOC_REVIEW = new Set([
  "pending",
  "pending_review",
  "approved",
  "rejected",
  "needs_changes",
  "expired",
]);

function registrationFromDetail(
  value: string | null | undefined,
): RegistrationStatus {
  if (value && (REGISTRATION_STATUSES as readonly string[]).includes(value)) {
    return value as RegistrationStatus;
  }
  return "draft";
}

function driverFromDetail(data: DriverDetailDto): Driver {
  return {
    id: data.id,
    name: data.displayName ?? data.id,
    phone: data.phone ?? "",
    email: data.email ?? "",
    countryId: data.countryId ?? "",
    cityId: data.cityId ?? "",
    agentId: null,
    registrationStatus: registrationFromDetail(data.registrationStatus),
    approvalStatus:
      data.approvalStatus === "approved" ||
      data.approvalStatus === "rejected" ||
      data.approvalStatus === "suspended" ||
      data.approvalStatus === "pending"
        ? data.approvalStatus
        : "pending",
    availabilityStatus:
      data.availabilityStatus === "online" ||
      data.availabilityStatus === "offline" ||
      data.availabilityStatus === "busy" ||
      data.availabilityStatus === "unavailable"
        ? data.availabilityStatus
        : "unavailable",
    vehiclePlate: data.vehicle.plateMasked ?? "—",
    rating: null,
    tripCount: 0,
    createdAtUtc: data.createdAtUtc ?? new Date(0).toISOString(),
    lastSeenAtUtc: null,
  };
}

function DriverDocumentPreviewButton({ driverId, slot }: { driverId: string; slot: string }) {
  const { t, locale } = useI18n();
  const apiFetch = useApiFetch();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  return <div>
    <button type="button" data-testid={`driver-doc-preview-${slot}`} className={adminUi.btnGhost} disabled={busy} onClick={() => {
      dialog.current?.showModal(); setBusy(true); setMessage(undefined); setPreview(null);
      void (async () => {
        try {
          const res = await apiFetch(`/api/storage/driver-documents/${encodeURIComponent(driverId)}/${encodeURIComponent(slot)}`);
          if (!res.ok) { setMessage(t("previewUnavailable")); return; }
          const blob = await res.blob();
          if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(blob.type)) { setMessage(t("previewUnavailable")); return; }
          setPreview({ url: URL.createObjectURL(blob), type: blob.type });
        } catch { setMessage(t("previewUnavailable")); } finally { setBusy(false); }
      })();
    }}>{t("previewDocument")}</button>
    <dialog ref={dialog} className="m-auto max-h-[90dvh] w-[min(92vw,60rem)] rounded-xl p-4 backdrop:bg-black/50" aria-label={t("previewDocument")} onClose={() => setPreview(null)}>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">{t("previewDocument")}</h2><button type="button" className={adminUi.btnGhost} onClick={() => dialog.current?.close()}>{locale === "ar" ? "إغلاق" : "Close"}</button></div>
      {busy ? <LoadingState /> : null}
      {message ? <p role="status">{message}</p> : null}
      {preview ? preview.type === "application/pdf" ? <iframe className="h-[70dvh] w-full" src={preview.url} title={t("previewDocument")} /> : <img className="mx-auto max-h-[70dvh] max-w-full object-contain" src={preview.url} alt={t("previewDocument")} /> : null}
    </dialog>
  </div>;
}

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
            {
              label:
                data?.displayName ??
                legacy?.name ??
                shortenId(driverId, 16) ??
                driverId,
            },
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
                    <DetailField label={t("id")}>
                      <LtrIsolate className={adminUi.monoId}>{data.id}</LtrIsolate>
                    </DetailField>
                    <DetailField label={t("email")}>{data.email ?? t("unavailable")}</DetailField>
                    <DetailField label={t("phone")}>{data.phone ?? t("unavailable")}</DetailField>
                    <DetailField label={t("registrationStatus")}>
                      {data.registrationStatus ? (
                        <StatusBadge value={data.registrationStatus} />
                      ) : (
                        presentStatus("unknown", locale)
                      )}
                    </DetailField>
                    <DetailField label={t("account")}>
                      {data.accountState ? (
                        <StatusBadge value={data.accountState} />
                      ) : (
                        presentStatus("unknown", locale)
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
                          presentStatus("unknown", locale)
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("approvalStatus")}>
                      <span data-testid="approval-status">
                        {data.approvalStatus ? (
                          <StatusBadge value={data.approvalStatus} />
                        ) : (
                          presentStatus("unknown", locale)
                        )}
                      </span>
                    </DetailField>
                    {data.registrationStatus === "draft" ? (
                      <div className="sm:col-span-2 text-sm text-slate-600">
                        {t("driverActionsUnavailableDraft")}
                      </div>
                    ) : null}
                  </>
                )}
                {section === "contact" && (
                  <>
                    <DetailField label={t("email")}>
                      {data.email ?? t("unavailable")}
                    </DetailField>
                    <DetailField label={t("phone")}>{data.phone ?? t("unavailable")}</DetailField>
                    <DetailField label={t("country")}>
                      <CountryCell countryId={data.countryId} />
                    </DetailField>
                    <DetailField label={t("city")}>
                      <CityCell cityId={data.cityId} />
                    </DetailField>
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
                      <PrimaryWithTechnicalId
                        primary={
                          data.vehicle.name || data.vehicle.model
                            ? [data.vehicle.name, data.vehicle.model]
                                .filter(Boolean)
                                .join(" · ")
                            : null
                        }
                        technicalId={data.vehicle.typeCarId}
                        emptyLabel={t("missing")}
                      />
                    </DetailField>
                    <DetailField label={t("classification")}>
                      {data.vehicle.classificationText ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("plate")}>
                      {data.vehicle.plateMasked ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("year")}>
                      {data.vehicle.year != null
                        ? String(data.vehicle.year)
                        : t("missing")}
                    </DetailField>
                    <DetailField label={t("color")}>
                      {data.vehicle.color ?? t("missing")}
                    </DetailField>
                    <DetailField label={t("vehicleReview")}>
                      {data.vehicle.vehicleReviewStatus ? (
                        <StatusBadge value={data.vehicle.vehicleReviewStatus} />
                      ) : (
                        t("unavailable")
                      )}
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
                          presentStatus("unknown", locale)
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("documentReview")}>
                      {data.documents.documentReviewStatus &&
                      MEANINGFUL_DOC_REVIEW.has(
                        data.documents.documentReviewStatus,
                      ) ? (
                        <StatusBadge
                          value={data.documents.documentReviewStatus}
                        />
                      ) : data.documents.documentReviewStatus ? (
                        <StatusBadge
                          value={data.documents.documentReviewStatus}
                        />
                      ) : (
                        t("unavailable")
                      )}
                    </DetailField>
                    <DetailField label={t("rejectionReasonText")}>
                      {data.documents.rejectionReasonText
                        ? data.documents.rejectionReasonText
                        : data.documents.rejectionReasonPresent
                          ? t("yes")
                          : t("no")}
                    </DetailField>
                    <DetailField label={t("needsChangesReasonText")}>
                      {data.documents.needsChangesReasonText
                        ? data.documents.needsChangesReasonText
                        : data.documents.needsChangesReasonPresent
                          ? t("yes")
                          : t("no")}
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
                      <DetailField key={slot.slot} label={documentSlotLabel(slot.slot, locale)}>
                        <div className="space-y-1">
                          <StatusBadge value={slot.presence || "missing"} />
                          {(() => {
                            const status = normalizeDocumentSlotReviewStatus(
                              slot.reviewStatus,
                            );
                            return status &&
                              MEANINGFUL_DOC_REVIEW.has(status) ? (
                              <StatusBadge value={status} />
                            ) : null;
                          })()}
                          {slot.expiryUtc ? (
                            <span className="block text-xs text-slate-500">
                              {t("expiry")}:{" "}
                              <FormattedDateTime value={slot.expiryUtc} />
                            </span>
                          ) : null}
                          <span className="block text-xs text-slate-500">
                            {t("uploaded")}:{" "}
                            {slot.uploadedMetadataPresent ? t("yes") : t("no")}
                          </span>
                          {slot.uploadedMetadataPresent ||
                          slot.presence === "present" ? (
                            <DriverDocumentPreviewButton
                              driverId={driverId}
                              slot={slot.slot}
                            />
                          ) : null}
                          <DriverDocumentSlotReviewActions
                            driverId={driverId}
                            slot={slot.slot}
                            presence={slot.presence}
                            reviewStatus={slot.reviewStatus}
                            documentVersion={slot.documentVersion}
                            registrationStatus={data.registrationStatus}
                            onUpdated={(next) => {
                              setData((prev) => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  documents: {
                                    ...prev.documents,
                                    slots: prev.documents.slots.map((s) =>
                                      s.slot === next.slot
                                        ? {
                                            ...s,
                                            reviewStatus: next.reviewStatus,
                                            documentVersion: next.documentVersion,
                                          }
                                        : s,
                                    ),
                                  },
                                };
                              });
                            }}
                          />
                        </div>
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
                          presentStatus("unknown", locale)
                        )}
                      </span>
                    </DetailField>
                    <DetailField label={t("online")}>
                      {data.onlineStatus ? (
                        <StatusBadge value={data.onlineStatus} />
                      ) : (
                        presentStatus("unknown", locale)
                      )}
                    </DetailField>
                    <DetailField label={t("onTrip")}>
                      {data.onTrip == null
                        ? presentStatus("unknown", locale)
                        : data.onTrip
                          ? t("yes")
                          : t("no")}
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
                  <div className="sm:col-span-2 space-y-3">
                    {data.tripSummary &&
                    data.tripSummary.availability === "available" &&
                    data.tripSummary.total != null ? (
                      <dl
                        data-testid="driver-trip-summary"
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        <DetailField label={t("totalTrips")}>
                          {String(data.tripSummary.total)}
                        </DetailField>
                        <DetailField label={t("completedTrips")}>
                          {data.tripSummary.completed != null
                            ? String(data.tripSummary.completed)
                            : t("unavailable")}
                        </DetailField>
                        <DetailField label={t("cancelledTrips")}>
                          {data.tripSummary.cancelled != null
                            ? String(data.tripSummary.cancelled)
                            : t("unavailable")}
                        </DetailField>
                        <DetailField label={t("currentTrip")}>
                          {data.tripSummary.current != null
                            ? String(data.tripSummary.current)
                            : t("unavailable")}
                        </DetailField>
                      </dl>
                    ) : data.tripSummary?.availability === "missing" &&
                      data.tripSummary.total === 0 ? (
                      <p
                        data-testid="driver-trip-summary-empty"
                        className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600"
                      >
                        {t("tripSummaryNone")}
                      </p>
                    ) : (
                      <p
                        data-testid="driver-trip-summary-empty"
                        className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600"
                      >
                        {t("tripSummaryEmpty")}
                      </p>
                    )}
                  </div>
                )}
                {section === "finance" && (
                  <div className="sm:col-span-2 space-y-3">
                    {data.financial.summary &&
                    data.financial.summary.availability === "available" ? (
                      <dl
                        data-testid="driver-finance-summary"
                        className="grid gap-3 sm:grid-cols-2"
                      >
                        <DetailField label={t("grossEarnings")}>
                          {data.financial.summary.grossEarnings ? (
                            <MoneyCell
                              money={data.financial.summary.grossEarnings}
                            />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                        <DetailField label={t("companyCommission")}>
                          {data.financial.summary.commission ? (
                            <MoneyCell
                              money={data.financial.summary.commission}
                            />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                        <DetailField label={t("vat")}>
                          {data.financial.summary.vat ? (
                            <MoneyCell money={data.financial.summary.vat} />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                        <DetailField label={t("driverNet")}>
                          {data.financial.summary.driverNet ? (
                            <MoneyCell
                              money={data.financial.summary.driverNet}
                            />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                        <DetailField label={t("settledAmount")}>
                          {data.financial.summary.settledAmount ? (
                            <MoneyCell
                              money={data.financial.summary.settledAmount}
                            />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                        <DetailField label={t("outstandingAmount")}>
                          {data.financial.summary.outstandingAmount ? (
                            <MoneyCell
                              money={data.financial.summary.outstandingAmount}
                            />
                          ) : (
                            t("unavailable")
                          )}
                        </DetailField>
                      </dl>
                    ) : (
                      <p
                        data-testid="driver-finance-summary-empty"
                        className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600"
                      >
                        {t("noFinanceSummaryData")}
                      </p>
                    )}
                  </div>
                )}
              </dl>
            </div>
            <DriverWriteActions
              driver={driverFromDetail(data)}
              reviewVersion={data.reviewVersion}
              onUpdated={(next) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        registrationStatus: next.registrationStatus,
                        approvalStatus: next.approvalStatus,
                        availabilityStatus: next.availabilityStatus,
                      }
                    : prev,
                );
              }}
            />
          </div>
        ) : null}
        {state === "success" && legacy && !data ? (
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

function documentSlotLabel(slot: string, locale: string): string {
  const labels: Record<string, [string, string]> = {
    national_id: ["الهوية الوطنية", "National ID"],
    driver_license: ["رخصة القيادة", "Driving license"],
    driver_license_back: ["رخصة القيادة (خلف)", "Driving license (back)"],
    vehicle_registration: ["استمارة المركبة", "Vehicle registration"],
    profile_photo: ["الصورة الشخصية", "Personal photo"],
    vehicle_photo: ["صورة المركبة", "Vehicle photo"],
    vehicle_insurance: ["تأمين المركبة", "Vehicle insurance"],
  };
  return labels[slot]?.[locale === "ar" ? 0 : 1] ?? (locale === "ar" ? "مستند" : "Document");
}
