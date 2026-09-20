"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/components/layout/AdminShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  ErrorState,
  LoadingState,
  NotFoundState,
} from "@/components/states/QueryStates";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useI18n } from "@/i18n/I18nProvider";
import { useApiFetch } from "@/lib/apiClient";
import { adminUi } from "@/components/ui/adminUi";
import { DetailField, SectionTabs } from "@/components/ui/DetailSection";
import { CountryCell } from "@/components/ui/GeoReferenceCells";
import { PrimaryWithTechnicalId } from "@/components/ui/PrimaryWithTechnicalId";
import { FormattedDateTime } from "@/components/i18n/FormattedDateTime";
import { useAuth } from "@/auth/AuthContext";
import { hasPermission } from "@/permissions/rbac";
import { isControlledWriteChromeEnabled } from "@/domain/ui/controlledWriteChrome";
import { ControlledWriteConfirmPanel } from "@/components/ui/ControlledWriteConfirmPanel";
import { presentStatus } from "@/domain/presentation/statusPresentation";
import {
  legalTourGuideWriteActions,
  parseTourGuideStatus,
  type TourGuideWriteAction,
} from "@/domain/guides/TourGuideMaster";
import type { MessageKey } from "@/i18n/messages";

type GuideDetail = {
  kind: "guide";
  id: string;
  displayName: string | null;
  emailHint: string | null;
  phoneHint: string | null;
  countryId: string | null;
  status: string;
  transportCompanyText: string | null;
  permitPresent: boolean;
  rejectionReasonPresent: boolean;
  rejectionReasonText: string | null;
  reviewedAtUtc: string | null;
  cityText: string | null;
};

const GUIDE_ACTION_LABELS: Record<TourGuideWriteAction, MessageKey> = {
  approve: "approveAction",
  reject: "rejectAction",
  suspend: "suspendAction",
  reactivate: "reactivateAction",
};

export function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const { session } = useAuth();
  const apiFetch = useApiFetch();
  const [state, setState] = useState<"loading" | "error" | "success" | "not_found">(
    "loading",
  );
  const [error, setError] = useState<string>();
  const [detail, setDetail] = useState<GuideDetail | null>(null);
  const [section, setSection] = useState("overview");
  const [confirming, setConfirming] = useState<TourGuideWriteAction | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const inFlight = useRef(false);

  const canWrite = useMemo(
    () =>
      !!session.user &&
      hasPermission(session.user.permissions, "drivers:approve") &&
      isControlledWriteChromeEnabled(),
    [session.user],
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/api/guides/${encodeURIComponent(id)}`);
      if (res.status === 404) {
        setState("not_found");
        return;
      }
      if (!res.ok) throw new Error(t("requestFailed"));
      const json = (await res.json()) as { item?: GuideDetail };
      if (!json.item) {
        setState("not_found");
        return;
      }
      setDetail(json.item);
      setState("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error"));
      setState("error");
    }
  }, [apiFetch, id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = detail
    ? legalTourGuideWriteActions(parseTourGuideStatus(detail.status))
    : [];

  const runAction = async (action: TourGuideWriteAction) => {
    if (!detail || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setActionError(undefined);
    try {
      const res = await apiFetch(
        `/api/guides/${encodeURIComponent(detail.id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preconditionToken: detail.id,
            reasonCode: "operational",
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || json.ok === false) {
        setActionError(json.message ?? json.error ?? t("error"));
        return;
      }
      setConfirming(null);
      await load();
    } catch {
      setActionError(t("error"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const sections = ["overview", "registration", "contact", "documents"] as const;

  return (
    <AdminShell title={t("guides")}>
      <Breadcrumb
        items={[
          { label: t("guides"), href: "/guides" },
          { label: detail?.displayName ?? id },
        ]}
      />
      {state === "loading" ? <LoadingState /> : null}
      {state === "error" ? (
        <ErrorState message={error ?? t("error")} onRetry={() => void load()} />
      ) : null}
      {state === "not_found" ? <NotFoundState /> : null}
      {state === "success" && detail ? (
        <div className="mt-4 space-y-4" data-testid="guide-detail">
          <SectionTabs
            items={sections.map((s) => ({
              id: s,
              label:
                s === "overview"
                  ? t("overview")
                  : s === "registration"
                    ? t("registration")
                    : s === "contact"
                      ? t("contactLocation")
                      : t("documents"),
            }))}
            active={section}
            onChange={setSection}
          />
          <dl className={`${adminUi.cardPad} grid gap-3 sm:grid-cols-2`}>
            {section === "overview" ? (
              <>
                <DetailField label={t("name")}>
                  <PrimaryWithTechnicalId
                    primary={detail.displayName ?? detail.id}
                    technicalId={detail.id}
                    emptyLabel={t("unavailable")}
                  />
                </DetailField>
                <DetailField label={t("status")}>
                  <StatusBadge value={detail.status} />
                </DetailField>
                <DetailField label={t("country")}>
                  <CountryCell countryId={detail.countryId} />
                </DetailField>
                <DetailField label={t("fleet")}>
                  {detail.transportCompanyText ?? t("unavailable")}
                </DetailField>
              </>
            ) : null}
            {section === "registration" ? (
              <>
                <DetailField label={t("status")}>
                  <StatusBadge value={detail.status} />
                </DetailField>
                <DetailField label={t("updatedAt")}>
                  {detail.reviewedAtUtc ? (
                    <FormattedDateTime value={detail.reviewedAtUtc} />
                  ) : (
                    t("unavailable")
                  )}
                </DetailField>
                <DetailField label={t("rejectionReasonText")}>
                  {detail.rejectionReasonText
                    ? detail.rejectionReasonText
                    : detail.rejectionReasonPresent
                      ? t("yes")
                      : t("no")}
                </DetailField>
              </>
            ) : null}
            {section === "contact" ? (
              <>
                <DetailField label={t("email")}>
                  {detail.emailHint ?? t("unavailable")}
                </DetailField>
                <DetailField label={t("phone")}>
                  {detail.phoneHint ?? t("unavailable")}
                </DetailField>
                <DetailField label={t("city")}>
                  {detail.cityText ?? t("unavailable")}
                </DetailField>
                <DetailField label={t("country")}>
                  <CountryCell countryId={detail.countryId} />
                </DetailField>
              </>
            ) : null}
            {section === "documents" ? (
              <>
                <DetailField label={t("documents")}>
                  {detail.permitPresent ? (
                    <StatusBadge value="present" />
                  ) : (
                    <StatusBadge value="missing" />
                  )}
                </DetailField>
                <DetailField label={t("status")}>
                  {presentStatus(detail.status, locale === "ar" ? "ar" : "en")}
                </DetailField>
              </>
            ) : null}
          </dl>
          {canWrite && actions.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    data-testid={`guide-detail-${action}`}
                    className={
                      action === "approve" || action === "reactivate"
                        ? "rounded bg-emerald-700 px-2 py-1 text-xs text-white"
                        : action === "reject"
                          ? "rounded bg-rose-700 px-2 py-1 text-xs text-white"
                          : "rounded bg-amber-600 px-2 py-1 text-xs text-white"
                    }
                    disabled={pending}
                    onClick={() => setConfirming(action)}
                  >
                    {t(GUIDE_ACTION_LABELS[action])}
                  </button>
                ))}
              </div>
              {confirming ? (
                <ControlledWriteConfirmPanel
                  testIdPrefix={`guide-detail-${confirming}`}
                  confirmTemplateKey="confirmGuideWrite"
                  actionLabelKey={GUIDE_ACTION_LABELS[confirming]}
                  targetId={detail.displayName ?? detail.id}
                  stateLabel={presentStatus(
                    detail.status,
                    locale === "ar" ? "ar" : "en",
                  )}
                  pending={pending}
                  onConfirm={() => void runAction(confirming)}
                  onCancel={() => setConfirming(null)}
                />
              ) : null}
              {actionError ? (
                <p className="text-sm text-rose-700" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>
          ) : null}
          <Link className="text-emerald-700 underline" href="/guides">
            {t("guides")}
          </Link>
        </div>
      ) : null}
    </AdminShell>
  );
}
